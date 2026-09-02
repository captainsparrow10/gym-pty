#!/usr/bin/env node
/**
 * End-to-end check of the profile and social layer against the live database.
 *
 * Everything here lives behind row level security, so the only way to prove
 * the isolation actually holds is to act as two different signed-in users at
 * once and try the reads and writes that must fail. Two live clients, one per
 * throwaway account, do that; a single client can only hold one session.
 *
 *   pnpm smoke:social
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
const anonKey = env.VITE_SUPABASE_ANON_KEY;

const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) process.exitCode = 1;
};

// One client per account: a single supabase-js client holds exactly one
// session, so proving A cannot read B's data needs two separate clients
// signed in at once, not one client signing in twice.
const clientA = createClient(url, anonKey);
const clientB = createClient(url, anonKey);

const stamp = Date.now();
const password = "smoke-test-password";

console.log("→ accounts");

const { data: signUpA, error: signUpAError } = await clientA.auth.signUp({
	email: `smoke-social-a-${stamp}@gmail.com`,
	password,
});
if (signUpAError) throw signUpAError;
if (!signUpA.session) throw new Error("sign-up returned no session; autoconfirm is off again");
const userA = signUpA.user?.id as string;
check("account A created with a session", Boolean(userA));

const { data: signUpB, error: signUpBError } = await clientB.auth.signUp({
	email: `smoke-social-b-${stamp}@gmail.com`,
	password,
});
if (signUpBError) throw signUpBError;
if (!signUpB.session) throw new Error("sign-up returned no session; autoconfirm is off again");
const userB = signUpB.user?.id as string;
check("account B created with a session", Boolean(userB));

console.log("\n→ profiles");

// The trigger creates the row; this only customises it so the leaderboard
// checks below have something distinctive to assert on.
const { error: profileAError } = await clientA
	.from("profiles")
	.update({ display_name: "Smoke A", avatar_icon: "flame", avatar_color: "red" })
	.eq("id", userA);
check("profile A customised", !profileAError, profileAError?.message ?? "");

const { error: profileBError } = await clientB
	.from("profiles")
	.update({ display_name: "Smoke B", avatar_icon: "trophy", avatar_color: "blue" })
	.eq("id", userB);
check("profile B customised", !profileBError, profileBError?.message ?? "");

console.log("\n→ routines");

const { data: routineAPrivate, error: routineAError } = await clientA
	.from("routines")
	.insert({ user_id: userA, name: "A private routine" })
	.select("id")
	.single();
if (routineAError) throw routineAError;
check("A's private routine created", Boolean(routineAPrivate?.id));

const { data: routineBPrivate, error: routineBPrivateError } = await clientB
	.from("routines")
	.insert({ user_id: userB, name: "B private routine" })
	.select("id")
	.single();
if (routineBPrivateError) throw routineBPrivateError;
check("B's private routine created", Boolean(routineBPrivate?.id));

const { data: routineBPublic, error: routineBPublicError } = await clientB
	.from("routines")
	.insert({ user_id: userB, name: "B public routine", visibility: "public" })
	.select("id")
	.single();
if (routineBPublicError) throw routineBPublicError;
check("B's public routine created", Boolean(routineBPublic?.id));

const { error: exercisesError } = await clientB.from("routine_exercises").insert([
	{ routine_id: routineBPublic.id, exercise_slug: "bench-press", position: 0 },
	{ routine_id: routineBPublic.id, exercise_slug: "squat", position: 1 },
]);
check("B's public routine has 2 exercises", !exercisesError, exercisesError?.message ?? "");

console.log("\n→ A reading B's routines");

const { data: aReadsPrivate } = await clientA
	.from("routines")
	.select("id")
	.eq("id", routineBPrivate.id);
check("A cannot read B's private routine", (aReadsPrivate ?? []).length === 0);

const { data: aReadsAllOfB } = await clientA.from("routines").select("id").eq("user_id", userB);
check(
	"A sees only B's public routine, never the private one",
	(aReadsAllOfB ?? []).length === 1 && aReadsAllOfB?.[0]?.id === routineBPublic.id,
	`${(aReadsAllOfB ?? []).length} row(s)`,
);

const { data: aReadsPublic } = await clientA
	.from("routines")
	.select("id, name")
	.eq("id", routineBPublic.id)
	.maybeSingle();
check("A can read B's public routine", aReadsPublic?.id === routineBPublic.id);

const { data: aReadsPublicExercises } = await clientA
	.from("routine_exercises")
	.select("id")
	.eq("routine_id", routineBPublic.id);
check(
	"A can read B's public routine's exercises",
	(aReadsPublicExercises ?? []).length === 2,
	`${(aReadsPublicExercises ?? []).length} row(s)`,
);

const { data: aReadsPrivateExercises } = await clientA
	.from("routine_exercises")
	.select("id")
	.eq("routine_id", routineBPrivate.id);
check("A cannot read B's private routine's exercises", (aReadsPrivateExercises ?? []).length === 0);

console.log("\n→ A writing to B's public routine");

const { data: hijackAttempt, error: hijackError } = await clientA
	.from("routines")
	.update({ name: "hijacked" })
	.eq("id", routineBPublic.id)
	.select();
check(
	"A cannot update B's routine, public or not",
	!hijackError && (hijackAttempt ?? []).length === 0,
	hijackError?.message ?? `${(hijackAttempt ?? []).length} row(s) updated`,
);

const { data: nameAfterHijack } = await clientA
	.from("routines")
	.select("name")
	.eq("id", routineBPublic.id)
	.single();
check("B's routine name is unchanged", nameAfterHijack?.name === "B public routine");

const { data: deleteAttempt, error: deleteError } = await clientA
	.from("routines")
	.delete()
	.eq("id", routineBPublic.id)
	.select();
check(
	"A cannot delete B's routine, public or not",
	!deleteError && (deleteAttempt ?? []).length === 0,
	deleteError?.message ?? `${(deleteAttempt ?? []).length} row(s) deleted`,
);

const { data: stillThere } = await clientA
	.from("routines")
	.select("id")
	.eq("id", routineBPublic.id)
	.maybeSingle();
check("B's public routine still exists", stillThere?.id === routineBPublic.id);

console.log("\n→ training data isolation");

// A's own working session: 3 working sets plus a warm-up that must not count.
const { data: sessionA, error: sessionAError } = await clientA
	.from("sessions")
	.insert({ user_id: userA })
	.select("id")
	.single();
if (sessionAError) throw sessionAError;

const { data: loggedA, error: loggedAError } = await clientA
	.from("logged_exercises")
	.insert({ session_id: sessionA.id, exercise_slug: "bench-press", position: 0 })
	.select("id")
	.single();
if (loggedAError) throw loggedAError;

const setsA = [
	{ logged_exercise_id: loggedA.id, position: 0, reps: 10, weight_kg: 60, warmup: false },
	{ logged_exercise_id: loggedA.id, position: 1, reps: 8, weight_kg: 70, warmup: false },
	{ logged_exercise_id: loggedA.id, position: 2, reps: 6, weight_kg: 80, warmup: false },
	{ logged_exercise_id: loggedA.id, position: 3, reps: 12, weight_kg: 20, warmup: true },
];
const { error: setsAError } = await clientA.from("sets").insert(setsA);
check("A's sets recorded", !setsAError, setsAError?.message ?? "");

await clientA
	.from("sessions")
	.update({ finished_at: new Date().toISOString(), duration_sec: 3600 })
	.eq("id", sessionA.id);

// A older session for A, to prove the p_days window actually narrows the
// leaderboard rather than just being accepted and ignored.
const oldDate = new Date();
oldDate.setDate(oldDate.getDate() - 400);
const oldDateIso = oldDate.toISOString().slice(0, 10);

const { data: oldSessionA, error: oldSessionAError } = await clientA
	.from("sessions")
	.insert({ user_id: userA, date: oldDateIso })
	.select("id")
	.single();
if (oldSessionAError) throw oldSessionAError;

const { data: oldLoggedA, error: oldLoggedAError } = await clientA
	.from("logged_exercises")
	.insert({ session_id: oldSessionA.id, exercise_slug: "squat", position: 0 })
	.select("id")
	.single();
if (oldLoggedAError) throw oldLoggedAError;

const { error: oldSetsAError } = await clientA
	.from("sets")
	.insert([{ logged_exercise_id: oldLoggedA.id, position: 0, reps: 1, weight_kg: 999, warmup: false }]);
check("A's old set recorded", !oldSetsAError, oldSetsAError?.message ?? "");

await clientA
	.from("sessions")
	.update({ finished_at: new Date().toISOString(), duration_sec: 60 })
	.eq("id", oldSessionA.id);

// B's own working session: 2 working sets plus a warm-up.
const { data: sessionB, error: sessionBError } = await clientB
	.from("sessions")
	.insert({ user_id: userB })
	.select("id")
	.single();
if (sessionBError) throw sessionBError;

const { data: loggedB, error: loggedBError } = await clientB
	.from("logged_exercises")
	.insert({ session_id: sessionB.id, exercise_slug: "deadlift", position: 0 })
	.select("id")
	.single();
if (loggedBError) throw loggedBError;

const setsB = [
	{ logged_exercise_id: loggedB.id, position: 0, reps: 5, weight_kg: 100, warmup: false },
	{ logged_exercise_id: loggedB.id, position: 1, reps: 5, weight_kg: 90, warmup: false },
	{ logged_exercise_id: loggedB.id, position: 2, reps: 15, weight_kg: 10, warmup: true },
];
const { error: setsBError } = await clientB.from("sets").insert(setsB);
check("B's sets recorded", !setsBError, setsBError?.message ?? "");

await clientB
	.from("sessions")
	.update({ finished_at: new Date().toISOString(), duration_sec: 2400 })
	.eq("id", sessionB.id);

const { data: bodyweightB, error: bodyweightBError } = await clientB
	.from("bodyweight")
	.insert({ user_id: userB, weight_kg: 82 })
	.select("id")
	.single();
if (bodyweightBError) throw bodyweightBError;

const { data: noteB, error: noteBError } = await clientB
	.from("exercise_notes")
	.insert({ user_id: userB, exercise_slug: "deadlift", body: "Left knee twinges past 5 reps." })
	.select("id")
	.single();
if (noteBError) throw noteBError;

const { data: aReadsBSessions } = await clientA.from("sessions").select("id").eq("user_id", userB);
check("A cannot read B's sessions", (aReadsBSessions ?? []).length === 0);

const { data: aReadsBSets } = await clientA
	.from("sets")
	.select("id")
	.eq("logged_exercise_id", loggedB.id);
check("A cannot read B's sets", (aReadsBSets ?? []).length === 0);

const { data: aReadsBBodyweight } = await clientA
	.from("bodyweight")
	.select("id")
	.eq("user_id", userB);
check("A cannot read B's bodyweight", (aReadsBBodyweight ?? []).length === 0);

const { data: aReadsBNotes } = await clientA.from("exercise_notes").select("id").eq("user_id", userB);
check("A cannot read B's exercise notes", (aReadsBNotes ?? []).length === 0);

console.log("\n→ leaderboard");

// Hand-computed, not compared against the function's own arithmetic:
// A: 10x60 + 8x70 + 6x80 = 600 + 560 + 480 = 1640, 3 working sets, warm-up excluded.
// B: 5x100 + 5x90 = 500 + 450 = 950, 2 working sets, warm-up excluded.
const expectedAllTime = {
	[userA]: { sessions: 2, sets: 4, volumeKg: 1640 + 999 },
	[userB]: { sessions: 1, sets: 2, volumeKg: 950 },
};

type LeaderboardRow = {
	user_id: string;
	display_name: string | null;
	avatar_icon: string;
	avatar_color: string;
	sessions: number;
	sets: number;
	volume_kg: number;
};

const { data: allTime, error: allTimeError } = await clientA.rpc("leaderboard", { p_days: null });
if (allTimeError) throw allTimeError;
const rows = (allTime ?? []) as LeaderboardRow[];

const rowA = rows.find((row) => row.user_id === userA);
const rowB = rows.find((row) => row.user_id === userB);

check("leaderboard includes A", Boolean(rowA));
check("leaderboard includes B", Boolean(rowB));
check(
	"A's totals match the hand-computed numbers",
	rowA?.sessions === expectedAllTime[userA].sessions &&
		rowA?.sets === expectedAllTime[userA].sets &&
		Number(rowA?.volume_kg) === expectedAllTime[userA].volumeKg,
	JSON.stringify(rowA),
);
check(
	"B's totals match the hand-computed numbers",
	rowB?.sessions === expectedAllTime[userB].sessions &&
		rowB?.sets === expectedAllTime[userB].sets &&
		Number(rowB?.volume_kg) === expectedAllTime[userB].volumeKg,
	JSON.stringify(rowB),
);
check(
	"warm-up sets are excluded from the totals",
	// If either warm-up had counted, sets or volume above would not match the
	// hand-computed numbers, which only sum the working sets.
	rowA?.sets === 4 && rowB?.sets === 2,
);
check(
	"the leaderboard carries the avatar and name set on the profile",
	rowA?.display_name === "Smoke A" &&
		rowA?.avatar_icon === "flame" &&
		rowA?.avatar_color === "red" &&
		rowB?.display_name === "Smoke B" &&
		rowB?.avatar_icon === "trophy" &&
		rowB?.avatar_color === "blue",
);

const { data: windowed, error: windowedError } = await clientA.rpc("leaderboard", { p_days: 30 });
if (windowedError) throw windowedError;
const windowedRowA = (windowed ?? []).find((row: LeaderboardRow) => row.user_id === userA);
check(
	"p_days narrows the window: A's 400-day-old session drops out",
	windowedRowA?.sessions === 1 && windowedRowA?.sets === 3 && Number(windowedRowA?.volume_kg) === 1640,
	JSON.stringify(windowedRowA),
);

console.log("\n→ opt-out");

const { error: optOutError } = await clientB
	.from("profiles")
	.update({ public_profile: false })
	.eq("id", userB);
check("B opts out", !optOutError, optOutError?.message ?? "");

const { data: afterOptOut, error: afterOptOutError } = await clientA.rpc("leaderboard", { p_days: null });
if (afterOptOutError) throw afterOptOutError;
const stillHasA = (afterOptOut ?? []).some((row: LeaderboardRow) => row.user_id === userA);
const stillHasB = (afterOptOut ?? []).some((row: LeaderboardRow) => row.user_id === userB);
check("A still appears after B opts out", stillHasA);
check("B no longer appears once public_profile is false", !stillHasB);

console.log("\n→ unauthenticated access");

const anonClient = createClient(url, anonKey);
const { error: anonRpcError } = await anonClient.rpc("leaderboard", { p_days: null });
check(
	"the leaderboard function rejects an unauthenticated caller",
	anonRpcError !== null,
	anonRpcError?.message ?? "",
);

console.log("\n→ cleanup");

const { error: cleanupAError } = await clientA
	.from("sessions")
	.delete()
	.in("id", [sessionA.id, oldSessionA.id]);
const { error: cleanupARoutineError } = await clientA.from("routines").delete().eq("id", routineAPrivate.id);
check("A's sessions and routine deleted", !cleanupAError && !cleanupARoutineError);

const { error: cleanupBSessionError } = await clientB.from("sessions").delete().eq("id", sessionB.id);
const { error: cleanupBRoutinesError } = await clientB
	.from("routines")
	.delete()
	.in("id", [routineBPrivate.id, routineBPublic.id]);
const { error: cleanupBBodyweightError } = await clientB
	.from("bodyweight")
	.delete()
	.eq("id", bodyweightB.id);
const { error: cleanupBNoteError } = await clientB.from("exercise_notes").delete().eq("id", noteB.id);
check(
	"B's sessions, routines, bodyweight and note deleted",
	!cleanupBSessionError && !cleanupBRoutinesError && !cleanupBBodyweightError && !cleanupBNoteError,
);

// Profiles are the one row the app never lets a user delete through the UI,
// but the account itself is thrown away here, so the row would otherwise sit
// in the real leaderboard forever with public_profile back to whatever state
// this run left it in. Self-delete is allowed by RLS precisely for this.
const { error: deleteProfileAError } = await clientA.from("profiles").delete().eq("id", userA);
const { error: deleteProfileBError } = await clientB.from("profiles").delete().eq("id", userB);
check("both profiles deleted", !deleteProfileAError && !deleteProfileBError);

const { data: leftoverRoutines } = await clientA
	.from("routines")
	.select("id")
	.in("id", [routineAPrivate.id, routineBPrivate.id, routineBPublic.id]);
const { data: leftoverSessions } = await clientA
	.from("sessions")
	.select("id")
	.in("id", [sessionA.id, oldSessionA.id, sessionB.id]);
check(
	"nothing left behind",
	(leftoverRoutines ?? []).length === 0 && (leftoverSessions ?? []).length === 0,
);

/*
 * The anon key cannot delete auth.users rows — only a service role key can —
 * so the two auth users themselves are left behind, same as every other
 * smoke script in this repo. Everything they owned is gone, including their
 * profile, so neither appears anywhere in the app; they just sit under
 * Authentication > Users until removed from the dashboard.
 */
await clientA.auth.signOut();
await clientB.auth.signOut();

console.log(`\n${process.exitCode ? "failures above" : "all green"}`);
