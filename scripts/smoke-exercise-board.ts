#!/usr/bin/env node
/**
 * Checks the per-exercise leaderboard against the live database.
 *
 * The thing under test is not "does it return rows" but the two properties it
 * exists to guarantee:
 *
 *   1. It ranks on estimated 1RM, so a heavy single does not automatically
 *      beat volume and a light set of twenty does not automatically win on
 *      Epley drift. Two lifters are constructed to make the ordering
 *      unambiguous and the expected numbers are computed by hand below.
 *   2. It leaks nothing. A private profile must not appear at all, and the
 *      direct table reads that RLS blocks must stay blocked — the function
 *      being `security definer` is the one sanctioned way around RLS, and
 *      only in the aggregate direction.
 *
 *   pnpm smoke:exercise-board
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

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) failures++;
};

const SLUG = `smoke-board-${Date.now()}`;
const today = new Date().toISOString().slice(0, 10);

/** Signs up a fresh user and logs one day of the exercise for them. */
async function lifter(
	name: string,
	isPublic: boolean,
	sets: { reps: number; weightKg: number; warmup?: boolean }[],
) {
	const client = createClient(url, key);
	const { data: signUp, error } = await client.auth.signUp({
		email: `smoke-board-${name}-${Date.now()}@gmail.com`,
		password: "smoke-test-password",
	});
	if (error) throw error;
	if (!signUp.session) throw new Error("autoconfirm is off again");
	const userId = signUp.user?.id as string;

	await client
		.from("profiles")
		.update({ display_name: name, public_profile: isPublic })
		.eq("id", userId);

	const { data: session, error: sessionError } = await client
		.from("sessions")
		.insert({ user_id: userId, date: today, finished_at: new Date().toISOString() })
		.select("id")
		.single();
	if (sessionError) throw sessionError;

	const { data: logged, error: loggedError } = await client
		.from("logged_exercises")
		.insert({ session_id: session.id, exercise_slug: SLUG, position: 0 })
		.select("id")
		.single();
	if (loggedError) throw loggedError;

	// One insert per set: PostgREST normalises a batch to the union of keys and
	// sends an explicit NULL for anything omitted, so a column default like
	// `warmup not null default false` never applies and the batch fails.
	for (const [position, set] of sets.entries()) {
		const { error: setError } = await client.from("sets").insert({
			logged_exercise_id: logged.id,
			position,
			reps: set.reps,
			weight_kg: set.weightKg,
			warmup: set.warmup ?? false,
		});
		if (setError) throw setError;
	}

	return { client, userId, sessionId: session.id, loggedId: logged.id };
}

/** Adds one more exercise to a lifter's existing session. Returns its id. */
async function logExtra(
	lifter: { client: ReturnType<typeof createClient>; sessionId: string },
	slug: string,
	sets: { reps: number; weightKg: number; seconds?: number }[],
) {
	const { data, error } = await lifter.client
		.from("logged_exercises")
		.insert({ session_id: lifter.sessionId, exercise_slug: slug, position: 1 })
		.select("id")
		.single();
	if (error) throw error;

	for (const [position, set] of sets.entries()) {
		const { error: setError } = await lifter.client.from("sets").insert({
			logged_exercise_id: data.id,
			position,
			reps: set.reps,
			weight_kg: set.weightKg,
			seconds: set.seconds ?? null,
			warmup: false,
		});
		if (setError) throw setError;
	}
	return data.id as string;
}

console.log("→ three lifters, same movement");

// Epley: w x (1 + reps / 30), except a single rep is the load itself.
//   Ana    100 x 1        -> 1RM 100.0   volume 100
//   Beto    80 x 8        -> 1RM  80 x (1 + 8/30) = 101.333…   volume 640
//   Cami   120 x 3        -> 1RM 120 x (1 + 3/30) = 132.0      volume 360, PRIVATE
//
// Beto edges Ana out on the estimate while lifting less weight, which is the
// whole reason the board ranks on 1RM rather than on load. Cami would top the
// board on every metric and must not appear at all.
const ana = await lifter("Ana", true, [
	{ reps: 5, weightKg: 40, warmup: true },
	{ reps: 1, weightKg: 100 },
]);
const beto = await lifter("Beto", true, [{ reps: 8, weightKg: 80 }]);
const cami = await lifter("Cami", false, [{ reps: 3, weightKg: 120 }]);

const { data: board, error: boardError } = await ana.client.rpc(
	"exercise_leaderboard",
	{ p_slug: SLUG },
);
if (boardError) throw boardError;

const rows = board ?? [];
const named = (n: string) => rows.find((r) => r.display_name === n);

console.log("\n→ who is on it");
check("Ana and Beto only", rows.length === 2, `${rows.length} rows`);
check("private profile absent", !named("Cami"));

console.log("\n→ ranked by estimated 1RM, not by load");
check(
	"Beto first on 101.3 over Ana's 100",
	rows[0]?.display_name === "Beto",
	`order: ${rows.map((r) => r.display_name).join(", ")}`,
);
check(
	"Beto's 1RM = 101.3",
	Math.abs(Number(named("Beto")?.best_one_rm_kg) - 101.3333333333) < 0.001,
	String(named("Beto")?.best_one_rm_kg),
);
check(
	"a single rep is the load itself, not the estimate",
	Number(named("Ana")?.best_one_rm_kg) === 100,
	String(named("Ana")?.best_one_rm_kg),
);
check(
	"Ana still has the heavier bar",
	Number(named("Ana")?.top_weight_kg) === 100 &&
		Number(named("Beto")?.top_weight_kg) === 80,
);

console.log("\n→ warm-ups are excluded, as everywhere else");
check(
	"Ana's volume is 100, not 300",
	Number(named("Ana")?.volume_kg) === 100,
	String(named("Ana")?.volume_kg),
);
check("Ana's set count is 1, not 2", Number(named("Ana")?.sets) === 1);
check("Beto's volume is 640", Number(named("Beto")?.volume_kg) === 640);

console.log("\n→ nothing leaks past the aggregate");
{
	const { data: sets } = await ana.client
		.from("sets")
		.select("id, logged_exercise_id")
		.limit(50);
	const visible = sets ?? [];
	// Counting rows proves nothing on its own — Ana logged two sets herself,
	// the warm-up and the working set. What matters is that every row she can
	// see is her own, so the count is checked against her own exercise rather
	// than against a number.
	check(
		"Ana sees her own two sets",
		visible.length === 2,
		`${visible.length} rows`,
	);
	check(
		"and not one row belonging to anyone else",
		visible.every((row) => row.logged_exercise_id === ana.loggedId),
		visible
			.filter((row) => row.logged_exercise_id !== ana.loggedId)
			.map((row) => row.logged_exercise_id)
			.join(", "),
	);
	for (const [name, other] of [["Beto", beto], ["Cami", cami]] as const) {
		const { data: theirs } = await ana.client
			.from("sets")
			.select("id")
			.eq("logged_exercise_id", other.loggedId);
		check(`${name}'s sets are unreadable by name`, (theirs ?? []).length === 0);
	}

	const { data: theirSessions } = await ana.client
		.from("sessions")
		.select("id")
		.eq("id", beto.sessionId);
	check("another user's session is unreadable", (theirSessions ?? []).length === 0);

	// The exact column set, not a blacklist of suspicious names. A blacklist
	// called this a leak the moment `reps` was added as sum(st.reps), and would
	// have missed a genuinely new column with an innocent name. Pinning the
	// list means any future column has to be added here deliberately.
	const columns = Object.keys(rows[0] ?? {}).sort();
	const expected = [
		"avatar_color",
		"avatar_icon",
		"best_one_rm_kg",
		"display_name",
		"last_performed",
		"reps",
		"sessions",
		"sets",
		"top_seconds",
		"top_weight_kg",
		"user_id",
		"volume_kg",
	];
	check(
		"the return type is exactly the aggregates",
		JSON.stringify(columns) === JSON.stringify(expected),
		columns.join(", "),
	);
	check(
		"no column identifies a row in sets or sessions",
		!columns.some((c) =>
			["id", "session_id", "logged_exercise_id", "weight_kg", "completed_at", "notes"].includes(c),
		),
	);
}

console.log("\n→ the window filter");
{
	const { data: lastWeek } = await ana.client.rpc("exercise_leaderboard", {
		p_slug: SLUG,
		p_days: 7,
	});
	check("today's work is inside a 7-day window", (lastWeek ?? []).length === 2);

	const { data: future } = await ana.client.rpc("exercise_leaderboard", {
		p_slug: SLUG,
		p_days: 0,
	});
	check("a zero-day window still includes today", (future ?? []).length === 2);
}

console.log("\n→ an exercise nobody has done");
{
	const { data: empty } = await ana.client.rpc("exercise_leaderboard", {
		p_slug: `${SLUG}-nobody`,
	});
	check("returns no rows rather than zero rows", (empty ?? []).length === 0);
}

console.log("\n→ a movement nobody loads is ranked on reps, not on zeros");
{
	// Unweighted work is stored at 0 kg. Ranking it on load produces a column
	// of zeroes and an order decided by nothing, which is how a pull-up board
	// once put whoever sorted first at the top.
	const BW = `${SLUG}-bodyweight`;
	const few = await logExtra(ana, BW, [{ reps: 8, weightKg: 0 }]);
	const many = await logExtra(beto, BW, [{ reps: 20, weightKg: 0 }]);
	const { data } = await ana.client.rpc("exercise_leaderboard", { p_slug: BW });
	const rows = data ?? [];
	check("both lifters appear", rows.length === 2, `${rows.length} rows`);
	check(
		"the one with more reps leads",
		rows[0]?.display_name === "Beto",
		rows.map((r) => `${r.display_name}:${r.reps}`).join(", "),
	);
	check("reps are reported", Number(rows[0]?.reps) === 20);
	check("1RM stays honestly zero", Number(rows[0]?.best_one_rm_kg) === 0);
	await ana.client.from("logged_exercises").delete().eq("id", few);
	await beto.client.from("logged_exercises").delete().eq("id", many);
}

console.log("\n→ timed work is ranked on the longest hold");
{
	const TIMED = `${SLUG}-timed`;
	const short = await logExtra(ana, TIMED, [{ reps: 0, weightKg: 0, seconds: 45 }]);
	const long = await logExtra(beto, TIMED, [{ reps: 0, weightKg: 0, seconds: 120 }]);
	const { data } = await ana.client.rpc("exercise_leaderboard", { p_slug: TIMED });
	const rows = data ?? [];
	check(
		"the longer hold leads",
		rows[0]?.display_name === "Beto" && Number(rows[0]?.top_seconds) === 120,
		rows.map((r) => `${r.display_name}:${r.top_seconds}s`).join(", "),
	);
	check("reps and load are both zero", Number(rows[0]?.reps) === 0 && Number(rows[0]?.volume_kg) === 0);
	await ana.client.from("logged_exercises").delete().eq("id", short);
	await beto.client.from("logged_exercises").delete().eq("id", long);
}

console.log("\n→ cleanup");
for (const { client, sessionId } of [ana, beto, cami]) {
	await client.from("sessions").delete().eq("id", sessionId);
}
const { data: left } = await ana.client.rpc("exercise_leaderboard", { p_slug: SLUG });
check("board is empty again", (left ?? []).length === 0);

console.log(failures === 0 ? "\n✓ exercise board ok" : `\n✗ ${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
