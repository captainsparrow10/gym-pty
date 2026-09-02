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

console.log("→ rutina");
const { data: routine, error: routineError } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Empuje" })
	.select("id")
	.single();
if (routineError) throw routineError;
check("rutina creada", Boolean(routine.id));

const slugs = ["bench-press", "overhead-press", "tricep-pushdown"];
const { error: addError } = await supabase.from("routine_exercises").insert(
	slugs.map((slug, position) => ({ routine_id: routine.id, exercise_slug: slug, position })),
);
if (addError) throw addError;
check("3 ejercicios agregados", true);

const readOrder = async (): Promise<string[]> => {
	const { data } = await supabase
		.from("routine_exercises")
		.select("exercise_slug, position")
		.eq("routine_id", routine.id)
		.order("position");
	return (data ?? []).map((row) => row.exercise_slug);
};

check("orden inicial", JSON.stringify(await readOrder()) === JSON.stringify(slugs));

console.log("\n→ reordenar");
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
check("un swap directo choca con el índice único", naiveError !== null, naiveError?.code ?? "");

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
	"el swap con parking funciona",
	JSON.stringify(swapped) === JSON.stringify([slugs[1], slugs[0], slugs[2]]),
	swapped.join(" → "),
);

console.log("\n→ empezar desde la rutina");
const { data: session, error: sessionError } = await supabase
	.from("sessions")
	.insert({ user_id: userId })
	.select("id")
	.single();
if (sessionError) throw sessionError;

const { error: preloadError } = await supabase.from("logged_exercises").insert(
	swapped.map((slug, position) => ({ session_id: session.id, exercise_slug: slug, position })),
);
check("sesión precargada con la rutina", !preloadError);

const { data: loaded } = await supabase
	.from("logged_exercises")
	.select("exercise_slug, position")
	.eq("session_id", session.id)
	.order("position");
check(
	"conserva el orden de la rutina",
	JSON.stringify((loaded ?? []).map((row) => row.exercise_slug)) === JSON.stringify(swapped),
);

console.log("\n→ progreso");
// Two training days on the same lift, so the strength series has a slope.
const { data: firstExercise, error: lookupError } = await supabase
	.from("logged_exercises")
	.select("id")
	.eq("session_id", session.id)
	.eq("exercise_slug", "bench-press")
	.single();
check("se ubica el ejercicio", Boolean(firstExercise?.id), lookupError?.message ?? "");

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
check("series insertadas", !setsError, setsError?.message ?? "");

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
check("el historial trae las 2 series", allSets.length === 2);
check("el calentamiento se excluye", working.length === 1);

const volume = working.reduce((total, set) => total + set.reps * Number(set.weight_kg), 0);
// 5 x 80, and the 12 x 20 warm-up must not count.
check("volumen sin calentamiento", volume === 400, `${formatKg(volume)} kg`);

console.log("\n→ limpieza");
await supabase.from("sessions").delete().eq("id", session.id);
await supabase.from("routines").delete().eq("id", routine.id);

const { data: leftRoutines } = await supabase.from("routines").select("id");
const { data: leftSessions } = await supabase.from("sessions").select("id");
check("no quedó nada", (leftRoutines ?? []).length === 0 && (leftSessions ?? []).length === 0);

console.log(`\n${process.exitCode ? "hubo fallos" : "todo en verde"}`);
