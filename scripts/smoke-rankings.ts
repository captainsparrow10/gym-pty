#!/usr/bin/env node
/**
 * Checks rankings, personal records and routine tracking against real data.
 *
 * The numbers are asserted against values worked out by hand rather than
 * against whatever the code returns, which is the only way this catches an
 * arithmetic mistake instead of enshrining one.
 *
 *   pnpm smoke:rankings
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

const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) process.exitCode = 1;
};

const { data: signUp, error: signUpError } = await supabase.auth.signUp({
	email: `smoke-${Date.now()}@gmail.com`,
	password: "smoke-test-password",
});
if (signUpError) throw signUpError;
const userId = signUp.user?.id as string;

console.log("→ routine with history");
const { data: routine } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Push" })
	.select("id")
	.single();

await supabase.from("routine_exercises").insert([
	{ routine_id: routine!.id, exercise_slug: "bench-press", position: 0 },
	{ routine_id: routine!.id, exercise_slug: "overhead-press", position: 1 },
]);

/** Runs the routine on a given date with a fixed set of sets. */
async function performRoutine(date: string, sets: [string, number, number][]) {
	const { data: session } = await supabase
		.from("sessions")
		.insert({ user_id: userId, routine_id: routine!.id, date })
		.select("id")
		.single();

	const slugs = [...new Set(sets.map(([slug]) => slug))];
	const { data: logged } = await supabase
		.from("logged_exercises")
		.insert(slugs.map((slug, position) => ({ session_id: session!.id, exercise_slug: slug, position })))
		.select("id, exercise_slug");

	const bySlug = new Map((logged ?? []).map((row) => [row.exercise_slug, row.id]));
	const counters = new Map<string, number>();

	await supabase.from("sets").insert(
		sets.map(([slug, reps, weight]) => {
			const position = counters.get(slug) ?? 0;
			counters.set(slug, position + 1);
			return {
				logged_exercise_id: bySlug.get(slug) as string,
				position,
				reps,
				weight_kg: weight,
				warmup: false,
			};
		}),
	);

	await supabase
		.from("sessions")
		.update({ finished_at: new Date().toISOString(), duration_sec: 3600 })
		.eq("id", session!.id);

	return session!.id;
}

const today = new Date().toISOString().slice(0, 10);
const older = new Date();
older.setDate(older.getDate() - 40);
const oldDate = older.toISOString().slice(0, 10);

// Today: bench 3 sets, overhead 2. Volume 5x100 + 5x100 + 3x110 + 8x50 + 8x50
//        = 500 + 500 + 330 + 400 + 400 = 2130
const sessionToday = await performRoutine(today, [
	["bench-press", 5, 100],
	["bench-press", 5, 100],
	["bench-press", 3, 110],
	["overhead-press", 8, 50],
	["overhead-press", 8, 50],
]);
// 40 days ago: bench only, 2 sets, 5x90 + 5x90 = 900
const sessionOld = await performRoutine(oldDate, [
	["bench-press", 5, 90],
	["bench-press", 5, 90],
]);
check("two sessions recorded", Boolean(sessionToday && sessionOld));

console.log("\n→ rankings");
const { data: history } = await supabase
	.from("sessions")
	.select("date, logged_exercises(exercise_slug, sets(reps, weight_kg, warmup))")
	.not("finished_at", "is", null);

const flat = (history ?? []).flatMap((session) =>
	(session.logged_exercises ?? []).flatMap((exercise) =>
		(exercise.sets ?? []).map((set) => ({
			date: session.date,
			slug: exercise.exercise_slug,
			reps: set.reps,
			weightKg: Number(set.weight_kg),
			warmup: set.warmup,
		})),
	),
);

const { rankExercises, sortByMetric, totals, withinWindow, personalRecords } = await import(
	"../apps/web/src/features/progress/rankings.ts"
);

const allTime = withinWindow(flat, "all");
const thisDay = withinWindow(flat, "day");

check("all-time has 7 sets", allTime.length === 7, `${allTime.length}`);
check("today has 5 sets", thisDay.length === 5, `${thisDay.length}`);

const dayTotals = totals(thisDay);
check("today volume is 2130 kg", dayTotals.volumeKg === 2130, `${dayTotals.volumeKg}`);
check("today reps total 29", dayTotals.reps === 29, `${dayTotals.reps}`);

const allTotals = totals(allTime);
check("all-time volume is 3030 kg", allTotals.volumeKg === 3030, `${allTotals.volumeKg}`);
check("all-time counts 2 sessions", allTotals.sessions === 2, `${allTotals.sessions}`);

const byTrained = sortByMetric(rankExercises(allTime), "sessions");
check("bench-press ranks first by days trained", byTrained[0]?.slug === "bench-press");
check("bench-press was trained 2 days", byTrained[0]?.sessions === 2, `${byTrained[0]?.sessions}`);

const byVolume = sortByMetric(rankExercises(allTime), "volumeKg");
// bench 500+500+330+900 = 2230, overhead 800
check("bench-press leads volume with 2230", byVolume[0]?.volumeKg === 2230, `${byVolume[0]?.volumeKg}`);

const byWeight = sortByMetric(rankExercises(allTime), "topWeightKg");
check("heaviest load is 110 kg", byWeight[0]?.topWeightKg === 110, `${byWeight[0]?.topWeightKg}`);

console.log("\n→ personal records");
const records = personalRecords(allTime.filter((set) => !set.warmup));
const bench = records.find((record) => record.slug === "bench-press");
check("bench PR is 3 x 110 kg", bench?.weightKg === 110 && bench?.reps === 3,
	`${bench?.reps} x ${bench?.weightKg}`);

console.log("\n→ routine tracking");
const { data: routineSessions } = await supabase
	.from("sessions")
	.select("routine_id, date, duration_sec, logged_exercises(sets(reps, weight_kg, warmup))")
	.eq("routine_id", routine!.id)
	.not("finished_at", "is", null);

check("both sessions link to the routine", (routineSessions ?? []).length === 2,
	`${(routineSessions ?? []).length}`);

const routineVolume = (routineSessions ?? []).reduce(
	(total, session) =>
		total +
		(session.logged_exercises ?? [])
			.flatMap((exercise) => exercise.sets ?? [])
			.filter((set) => !set.warmup)
			.reduce((sum, set) => sum + set.reps * Number(set.weight_kg), 0),
	0,
);
check("routine total volume is 3030 kg", routineVolume === 3030, `${routineVolume}`);
check("average volume is 1515 kg", routineVolume / 2 === 1515);

console.log("\n→ rating");
await supabase.from("routines").update({ rating: 4 }).eq("id", routine!.id);
const { data: rated } = await supabase
	.from("routines")
	.select("rating")
	.eq("id", routine!.id)
	.single();
check("rating saved", rated?.rating === 4, `${rated?.rating}`);

const { error: badRating } = await supabase
	.from("routines")
	.update({ rating: 9 })
	.eq("id", routine!.id);
check("a rating above 5 is rejected", badRating !== null, badRating?.code ?? "");

await supabase.from("routines").update({ rating: null }).eq("id", routine!.id);
const { data: cleared } = await supabase
	.from("routines")
	.select("rating")
	.eq("id", routine!.id)
	.single();
check("rating can be cleared", cleared?.rating === null);

console.log("\n→ cleanup");
await supabase.from("sessions").delete().in("id", [sessionToday, sessionOld]);
await supabase.from("routines").delete().eq("id", routine!.id);
const { data: left } = await supabase.from("sessions").select("id");
check("nothing left behind", (left ?? []).length === 0);

console.log(`\n${process.exitCode ? "failures above" : "all green"}`);
