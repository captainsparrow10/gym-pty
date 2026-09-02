#!/usr/bin/env node
/**
 * Checks routines and the progress calculations against the live database.
 *
 * Both live behind the auth gate, so the server renders a splash for them and
 * they cannot be verified over HTTP. The reordering path gets particular
 * attention: `(routine_id, position)` is unique, so a naive swap collides on
 * its first update.
 *
 *   pnpm smoke:routines
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatKg } from "../packages/shared/src/domain/index.ts";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(
	readFileSync(path.join(ROOT, ".env"), "utf8")
		.split("\n")
		.filter((line) => line.includes("=") && !line.startsWith("#"))
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) process.exitCode = 1;
};

const email = `smoke-${Date.now()}@gmail.com`;
const { data: signUp, error: signUpError } = await supabase.auth.signUp({
	email,
	password: "smoke-test-password",
});
if (signUpError) throw signUpError;
if (!signUp.session) throw new Error("sign-up returned no session; autoconfirm is off again");
const userId = signUp.user?.id as string;

console.log("→ routine");
const { data: routine, error: routineError } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Empuje" })
	.select("id")
	.single();
if (routineError) throw routineError;
check("routine created", Boolean(routine.id));

const slugs = ["bench-press", "overhead-press", "tricep-pushdown"];
const { error: addError } = await supabase.from("routine_exercises").insert(
	slugs.map((slug, position) => ({ routine_id: routine.id, exercise_slug: slug, position })),
);
if (addError) throw addError;
check("3 exercises added", true);

const readOrder = async (): Promise<string[]> => {
	const { data } = await supabase
		.from("routine_exercises")
		.select("exercise_slug, position")
		.eq("routine_id", routine.id)
		.order("position");
	return (data ?? []).map((row) => row.exercise_slug);
};

check("initial order", JSON.stringify(await readOrder()) === JSON.stringify(slugs));

console.log("\n→ reorder");
// A direct swap has to fail, which is the reason the app parks rows first.
const { data: rows } = await supabase
	.from("routine_exercises")
	.select("id, position")
	.eq("routine_id", routine.id)
	.order("position");
const [first, second] = rows ?? [];

const { error: naiveError } = await supabase
	.from("routine_exercises")
	.update({ position: second.position })
	.eq("id", first.id);
check("a direct swap collides with the unique constraint", naiveError !== null, naiveError?.code ?? "");

// The parked swap the app actually performs.
const park = async (id: string, position: number) => {
	const { error } = await supabase.from("routine_exercises").update({ position }).eq("id", id);
	if (error) throw error;
};
await park(first.id, -1);
await park(second.id, -2);
await park(first.id, second.position);
await park(second.id, first.position);

const swapped = await readOrder();
check(
	"the parked swap works",
	JSON.stringify(swapped) === JSON.stringify([slugs[1], slugs[0], slugs[2]]),
	swapped.join(" → "),
);

console.log("\n→ start from routine");
const { data: session, error: sessionError } = await supabase
	.from("sessions")
	.insert({ user_id: userId })
	.select("id")
	.single();
if (sessionError) throw sessionError;

const { error: preloadError } = await supabase.from("logged_exercises").insert(
	swapped.map((slug, position) => ({ session_id: session.id, exercise_slug: slug, position })),
);
check("session preloaded from the routine", !preloadError);

const { data: loaded } = await supabase
	.from("logged_exercises")
	.select("exercise_slug, position")
	.eq("session_id", session.id)
	.order("position");
check(
	"keeps the routine order",
	JSON.stringify((loaded ?? []).map((row) => row.exercise_slug)) === JSON.stringify(swapped),
);

console.log("\n→ progress");
// Two training days on the same lift, so the strength series has a slope.
const { data: firstExercise, error: lookupError } = await supabase
	.from("logged_exercises")
	.select("id")
	.eq("session_id", session.id)
	.eq("exercise_slug", "bench-press")
	.single();
check("exercise located", Boolean(firstExercise?.id), lookupError?.message ?? "");

/*
 * Every column is spelled out on both rows, including `warmup: false`.
 *
 * PostgREST normalises a batch insert to the union of the keys it is given and
 * sends an explicit NULL for anything a row omits — the column default never
 * applies. With `warmup not null default false`, leaving it off the first row
 * fails the whole batch with a not-null violation.
 */
const { error: setsError } = await supabase.from("sets").insert([
	{ logged_exercise_id: firstExercise?.id, position: 0, reps: 5, weight_kg: 80, warmup: false },
	// A warm-up, which every chart must exclude.
	{ logged_exercise_id: firstExercise?.id, position: 1, reps: 12, weight_kg: 20, warmup: true },
]);
check("sets inserted", !setsError, setsError?.message ?? "");

await supabase
	.from("sessions")
	.update({ finished_at: new Date().toISOString(), duration_sec: 1800 })
	.eq("id", session.id);

const { data: history } = await supabase
	.from("sessions")
	.select("date, logged_exercises(exercise_slug, sets(reps, weight_kg, warmup))")
	.not("finished_at", "is", null);

const allSets = (history ?? []).flatMap((s) =>
	(s.logged_exercises ?? []).flatMap((e) => (e.sets ?? []).map((set) => ({ ...set }))),
);

const working = allSets.filter((set) => !set.warmup);
check("history returns both sets", allSets.length === 2);
check("the warm-up is excluded", working.length === 1);

const volume = working.reduce((total, set) => total + set.reps * Number(set.weight_kg), 0);
// 5 x 80, and the 12 x 20 warm-up must not count.
check("volume without the warm-up", volume === 400, `${formatKg(volume)} kg`);

console.log("\n→ naming");
const { data: renamed, error: renameError } = await supabase
	.from("routines")
	.update({ name: "Push day" })
	.eq("id", routine!.id)
	.select("name")
	.single();
check("routine can be renamed", renamed?.name === "Push day", renameError?.message ?? "");

const { error: duplicateName } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Push day" });
check("a duplicate name is rejected", duplicateName?.code === "23505", duplicateName?.code ?? "");

// Case and surrounding whitespace do not make a different routine.
const { error: casedDuplicate } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "  push DAY " });
check("case and spacing do not dodge it", casedDuplicate?.code === "23505", casedDuplicate?.code ?? "");

const { error: differentName } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Pull day" });
check("a different name is allowed", !differentName);
await supabase.from("routines").delete().eq("name", "Pull day");

console.log("\n→ cleanup");
await supabase.from("sessions").delete().eq("id", session.id);
await supabase.from("routines").delete().eq("id", routine.id);

// Scoped by user_id: a public routine is selectable by anyone now, so an
// unscoped select would also return every other public routine on the site.
const { data: leftRoutines } = await supabase
	.from("routines")
	.select("id")
	.eq("user_id", userId);
const { data: leftSessions } = await supabase.from("sessions").select("id");
check("nothing left behind", (leftRoutines ?? []).length === 0 && (leftSessions ?? []).length === 0);

console.log(`\n${process.exitCode ? "failures above" : "all green"}`);
