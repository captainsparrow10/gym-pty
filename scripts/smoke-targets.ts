#!/usr/bin/env node
/**
 * Checks per-set targets on a routine exercise against the live database.
 *
 * A plan used to carry one target for the whole exercise, which could only say
 * "every set the same". The point of the table that replaced it is that the
 * sets can differ, so that is what is asserted here: a real ramp, stored and
 * read back in order, with the reps and the load moving independently.
 *
 * The rest matters too — every field nullable, "no reps stated" surviving as
 * null rather than becoming zero, and the check constraints refusing a load or
 * a rep count that cannot be real.
 *
 *   pnpm smoke:targets
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(
	readFileSync(path.join(ROOT, ".env"), "utf8")
		.split("\n")
		.filter((line) => line.includes("=") && !line.startsWith("#"))
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) failures++;
};

const email = `smoke-targets-${Date.now()}@gmail.com`;
const { data: signUp, error: signUpError } = await supabase.auth.signUp({
	email,
	password: "smoke-test-password",
});
if (signUpError) throw signUpError;
if (!signUp.session) throw new Error("sign-up returned no session; autoconfirm is off again");
const userId = signUp.user?.id as string;

const today = new Date().toISOString().slice(0, 10);

const { data: routine, error: routineError } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Targets" })
	.select("id")
	.single();
if (routineError) throw routineError;

const { data: row, error: addError } = await supabase
	.from("routine_exercises")
	.insert({ routine_id: routine.id, exercise_slug: "back-squat", position: 0 })
	.select("id")
	.single();
if (addError) throw addError;

const addSet = async (
	position: number,
	values: { reps?: number | null; weight_kg?: number | null; rest_seconds?: number | null; warmup?: boolean },
) =>
	supabase
		.from("set_targets")
		.insert({ routine_exercise_id: row.id, position, ...values })
		.select("id, position, reps, weight_kg, rest_seconds, warmup")
		.single();

const readSets = async () => {
	const { data } = await supabase
		.from("set_targets")
		.select("position, reps, weight_kg, rest_seconds, warmup")
		.eq("routine_exercise_id", row.id)
		.order("position");
	return data ?? [];
};

console.log("→ an exercise starts with no sets");
check("nothing planned yet", (await readSets()).length === 0);

console.log("\n→ a ramp: the whole point of the table");
{
	// 8 at 60, 6 at 70, 4 at 80 — the shape the single-target column could not
	// express at all.
	await addSet(0, { reps: 8, weight_kg: 60 });
	await addSet(1, { reps: 6, weight_kg: 70 });
	await addSet(2, { reps: 4, weight_kg: 80 });

	const sets = await readSets();
	check("three sets stored", sets.length === 3, `${sets.length}`);
	check(
		"reps differ per set",
		JSON.stringify(sets.map((s) => s.reps)) === "[8,6,4]",
		JSON.stringify(sets.map((s) => s.reps)),
	);
	check(
		"load differs per set",
		JSON.stringify(sets.map((s) => Number(s.weight_kg))) === "[60,70,80]",
		JSON.stringify(sets.map((s) => Number(s.weight_kg))),
	);
	check(
		"read back in planned order",
		JSON.stringify(sets.map((s) => s.position)) === "[0,1,2]",
	);
}

console.log("\n→ every field is optional");
{
	const { data, error } = await addSet(3, {});
	check("a set with nothing stated is allowed", !error);
	check("reps stay null, not zero", data?.reps === null);
	check("load stays null, not zero", data?.weight_kg === null);
	check("rest stays null", data?.rest_seconds === null);
	check("and it is a working set by default", data?.warmup === false);
}

console.log("\n→ warm-ups are part of the plan");
{
	const { data } = await addSet(4, { reps: 12, weight_kg: 30, warmup: true });
	check("a planned warm-up is stored as one", data?.warmup === true);
	const sets = await readSets();
	check(
		"working sets are still three",
		sets.filter((s) => !s.warmup && s.reps !== null).length === 3,
	);
}

console.log("\n→ 52.5 kg survives the round trip");
{
	// 2.5 kg plates make these the ordinary numbers, not the edge case.
	const { data } = await addSet(5, { reps: 5, weight_kg: 52.5 });
	check("stored exactly", Number(data?.weight_kg) === 52.5, String(data?.weight_kg));
}

console.log("\n→ the check constraints hold");
for (const [label, values] of [
	["zero reps", { reps: 0 }],
	["negative reps", { reps: -3 }],
	["zero load", { weight_kg: 0 }],
	["negative load", { weight_kg: -20 }],
	["rest of 15 minutes and one second", { rest_seconds: 901 }],
	["negative rest", { rest_seconds: -1 }],
] as const) {
	const { error } = await addSet(90, { ...values });
	check(`rejects ${label}`, Boolean(error), error ? "" : "STORED");
}
check("nothing was added by the rejections", (await readSets()).length === 6);

console.log("\n→ a set belongs to exactly one parent");
{
	const { data: day } = await supabase
		.from("planned_exercises")
		.insert({ user_id: userId, date: today, exercise_slug: "bench-press", position: 0 })
		.select("id")
		.single();

	// Both parents at once, and neither, are the two states the nullable
	// foreign keys cannot rule out on their own.
	const { error: both } = await supabase.from("set_targets").insert({
		routine_exercise_id: row.id,
		planned_exercise_id: day?.id,
		position: 80,
	});
	check("rejects two parents", Boolean(both), both ? "" : "STORED");

	const { error: neither } = await supabase
		.from("set_targets")
		.insert({ position: 81 });
	check("rejects no parent", Boolean(neither), neither ? "" : "STORED");

	const { error: ok } = await supabase.from("set_targets").insert({
		planned_exercise_id: day?.id,
		position: 0,
		reps: 10,
	});
	check("a day plan can hold sets too", !ok, ok ? ok.message : "");
}

console.log("\n→ deleting the exercise takes its sets");
{
	await supabase.from("routine_exercises").delete().eq("id", row.id);
	check("sets cascaded", (await readSets()).length === 0);
}

console.log("\n→ cleanup");
await supabase.from("routines").delete().eq("id", routine.id);
const { data: gone } = await supabase.from("routines").select("id").eq("id", routine.id);
check("routine removed", (gone ?? []).length === 0);

console.log(failures === 0 ? "\n✓ targets ok" : `\n✗ ${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
