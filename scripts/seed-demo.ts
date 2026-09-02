#!/usr/bin/env node
/**
 * Fills the database with a year of invented training, for looking at.
 *
 *   pnpm seed:demo           write it
 *   pnpm seed:demo --clear   remove everything this script created
 *
 * This is a viewing aid, not a fixture. The smoke scripts build the two or
 * three rows their assertion needs and delete them; this builds a year that
 * has to *look* like a year — progress that stalls, weeks that go missing,
 * a deload, and other people who are better than you at some lifts and worse
 * at others. Flat random numbers produce a chart that is visibly noise, which
 * tells you nothing about how the app reads when it is full.
 *
 * Needs the service role key, because it writes as several users. It is read
 * from the linked Supabase CLI and never printed:
 *
 *   SUPABASE_SERVICE_ROLE=$(supabase projects api-keys ... ) node scripts/seed-demo.ts
 *
 * The package script does that plumbing.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(
	readFileSync(path.join(ROOT, ".env"), "utf8")
		.split("\n")
		.filter((line) => line.includes("=") && !line.startsWith("#"))
		.map((line) => [
			line.slice(0, line.indexOf("=")),
			line.slice(line.indexOf("=") + 1).trim(),
		]),
);

const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
if (!serviceRole) {
	console.error(
		"SUPABASE_SERVICE_ROLE is not set. Run this through `pnpm seed:demo`.",
	);
	process.exit(1);
}

const db = createClient(env.VITE_SUPABASE_URL, serviceRole, {
	auth: { autoRefreshToken: false, persistSession: false },
});

/** Everything this script creates is tagged, so `--clear` can find it again. */
const TAG = "[demo]";
const DEMO_EMAIL_PREFIX = "demo-lifter-";
/** The one real account. Its rows are seeded but the account is never deleted. */
const OWNER_EMAIL = "javier1009rm@gmail.com";

const clearing = process.argv.includes("--clear");
const alsoPurgeSmoke = !process.argv.includes("--keep-smoke");

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/**
 * A seeded generator, so the same command twice produces the same year.
 *
 * `Math.random()` would mean the numbers move every run, and "did that chart
 * change because of my code or because the data is different" is not a
 * question worth having.
 */
function makeRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

// ---------------------------------------------------------------------------
// Training model
// ---------------------------------------------------------------------------

type Slot = { slug: string; sets: number; reps: number; warmups: number };
type Day = { name: string; slots: Slot[] };

/** Loads are per-exercise and per-lifter; these are the shapes of the days. */
const PUSH: Day = {
	name: "Push",
	slots: [
		{ slug: "bench-press", sets: 4, reps: 6, warmups: 2 },
		{ slug: "overhead-press", sets: 3, reps: 8, warmups: 1 },
		{ slug: "incline-dumbbell-press", sets: 3, reps: 10, warmups: 0 },
		{ slug: "lateral-raise", sets: 3, reps: 14, warmups: 0 },
		{ slug: "tricep-pushdown", sets: 3, reps: 12, warmups: 0 },
	],
};

const PULL: Day = {
	name: "Pull",
	slots: [
		{ slug: "barbell-row", sets: 4, reps: 8, warmups: 1 },
		{ slug: "lat-pulldown", sets: 3, reps: 10, warmups: 0 },
		{ slug: "face-pull", sets: 3, reps: 15, warmups: 0 },
		{ slug: "bicep-curl", sets: 3, reps: 12, warmups: 0 },
		{ slug: "hammer-curl", sets: 3, reps: 12, warmups: 0 },
	],
};

const LEGS: Day = {
	name: "Legs",
	slots: [
		{ slug: "squat", sets: 4, reps: 6, warmups: 2 },
		{ slug: "romanian-deadlift", sets: 3, reps: 8, warmups: 1 },
		{ slug: "leg-press", sets: 3, reps: 12, warmups: 0 },
		{ slug: "leg-curl", sets: 3, reps: 12, warmups: 0 },
		{ slug: "standing-calf-raise", sets: 4, reps: 15, warmups: 0 },
	],
};

const UPPER: Day = {
	name: "Upper",
	slots: [
		{ slug: "deadlift", sets: 3, reps: 5, warmups: 2 },
		{ slug: "incline-bench-press", sets: 4, reps: 8, warmups: 1 },
		{ slug: "pull-up", sets: 4, reps: 8, warmups: 0 },
		{ slug: "dip", sets: 3, reps: 10, warmups: 0 },
		{ slug: "plank", sets: 3, reps: 0, warmups: 0 },
	],
};

const BODYWEIGHT_DAY: Day = {
	name: "Calisthenics",
	slots: [
		{ slug: "pull-up", sets: 5, reps: 8, warmups: 0 },
		{ slug: "dip", sets: 4, reps: 12, warmups: 0 },
		{ slug: "push-up", sets: 4, reps: 20, warmups: 0 },
		{ slug: "chin-up", sets: 3, reps: 8, warmups: 0 },
		{ slug: "plank", sets: 3, reps: 0, warmups: 0 },
	],
};

type Lifter = {
	email: string;
	name: string;
	icon: string;
	color: string;
	/** Weeks of history. Not everyone has been here a year. */
	weeks: number;
	/** Training days per week, before missed sessions. */
	frequency: number;
	/** Chance of skipping a planned session. */
	flake: number;
	split: Day[];
	/** Starting load, as a multiple of each exercise's reference weight. */
	strength: number;
	/** How fast the loads climb. Beginners move faster than they will later. */
	progress: number;
	public: boolean;
	seed: number;
};

/**
 * Reference loads: roughly what a trained but unremarkable lifter uses, in kg.
 * Every lifter scales these by their own `strength`.
 *
 * Bodyweight movements sit at zero and stay there — the app stores zero for
 * unweighted work, and a pull-up logged at 70 kg would be a lie the rankings
 * would then repeat.
 */
const REFERENCE: Record<string, number> = {
	"bench-press": 80,
	"incline-bench-press": 65,
	"incline-dumbbell-press": 28,
	"overhead-press": 50,
	"lateral-raise": 10,
	"tricep-pushdown": 30,
	"barbell-row": 70,
	"lat-pulldown": 60,
	"face-pull": 25,
	"bicep-curl": 15,
	"hammer-curl": 16,
	squat: 100,
	"romanian-deadlift": 80,
	"leg-press": 160,
	"leg-curl": 45,
	"standing-calf-raise": 70,
	deadlift: 130,
	"pull-up": 0,
	dip: 0,
	"push-up": 0,
	"chin-up": 0,
	plank: 0,
};

const LIFTERS: Lifter[] = [
	// The owner is seeded like everyone else but is matched by email rather
	// than created, and is never deleted by --clear.
	{
		email: OWNER_EMAIL,
		name: "Javier",
		icon: "flame",
		color: "orange",
		weeks: 52,
		frequency: 4,
		flake: 0.12,
		split: [PUSH, PULL, LEGS, UPPER],
		strength: 1,
		progress: 1,
		public: true,
		seed: 20260902,
	},
	{
		email: `${DEMO_EMAIL_PREFIX}marta@example.com`,
		name: "Marta",
		icon: "zap",
		color: "purple",
		weeks: 52,
		frequency: 5,
		flake: 0.05,
		split: [PUSH, PULL, LEGS, UPPER, LEGS],
		strength: 0.82,
		progress: 1.1,
		public: true,
		seed: 11,
	},
	{
		// Strongest lifter, lowest volume: tops a 1RM board and not the global one.
		email: `${DEMO_EMAIL_PREFIX}diego@example.com`,
		name: "Diego",
		icon: "anchor",
		color: "red",
		weeks: 52,
		frequency: 3,
		flake: 0.1,
		split: [PUSH, LEGS, PULL],
		strength: 1.35,
		progress: 0.5,
		public: true,
		seed: 22,
	},
	{
		// The mirror of Diego: most total volume, nowhere near the heaviest.
		email: `${DEMO_EMAIL_PREFIX}ivan@example.com`,
		name: "Iván",
		icon: "rocket",
		color: "blue",
		weeks: 52,
		frequency: 6,
		flake: 0.03,
		split: [PUSH, PULL, LEGS, UPPER, PUSH, PULL],
		strength: 0.9,
		progress: 0.8,
		public: true,
		seed: 33,
	},
	{
		email: `${DEMO_EMAIL_PREFIX}sofia@example.com`,
		name: "Sofía",
		icon: "star",
		color: "green",
		weeks: 40,
		frequency: 4,
		flake: 0.08,
		split: [LEGS, PULL, LEGS, PUSH],
		strength: 0.75,
		progress: 1.2,
		public: true,
		seed: 44,
	},
	{
		// Three months in, climbing fast — the shape a beginner's chart has.
		email: `${DEMO_EMAIL_PREFIX}nico@example.com`,
		name: "Nico",
		icon: "target",
		color: "yellow",
		weeks: 13,
		frequency: 3,
		flake: 0.15,
		split: [PUSH, PULL, LEGS],
		strength: 0.55,
		progress: 2.4,
		public: true,
		seed: 55,
	},
	{
		email: `${DEMO_EMAIL_PREFIX}lucia@example.com`,
		name: "Lucía",
		icon: "trophy",
		color: "green",
		weeks: 30,
		frequency: 4,
		flake: 0.07,
		split: [BODYWEIGHT_DAY, PULL, BODYWEIGHT_DAY, LEGS],
		strength: 0.7,
		progress: 1,
		public: true,
		seed: 66,
	},
	{
		// Big gaps and a long plateau. Someone has to be the realistic one.
		email: `${DEMO_EMAIL_PREFIX}rafa@example.com`,
		name: "Rafa",
		icon: "dumbbell",
		color: "red",
		weeks: 52,
		frequency: 2,
		flake: 0.35,
		split: [PUSH, LEGS],
		strength: 1.05,
		progress: 0.25,
		public: true,
		seed: 77,
	},
	{
		// One private profile, so the leaderboard's opt-out is visible too.
		email: `${DEMO_EMAIL_PREFIX}ale@example.com`,
		name: "Ale",
		icon: "star",
		color: "blue",
		weeks: 45,
		frequency: 4,
		flake: 0.1,
		split: [PUSH, PULL, LEGS, UPPER],
		strength: 1.15,
		progress: 0.9,
		public: false,
		seed: 88,
	},
];

/** Loads move in 2.5 kg steps on a barbell, and dumbbells in 2 kg. */
function roundLoad(kg: number, slug: string): number {
	if (kg <= 0) return 0;
	const step = slug.includes("dumbbell") || slug.includes("curl") ? 2 : 2.5;
	return Math.max(step, Math.round(kg / step) * step);
}

/**
 * How much of a year's progress has landed by week `w`.
 *
 * Not a straight line. Fast at the start, flattening as it goes, with a
 * plateau across weeks 30-38 and a deload every eight weeks. A linear ramp is
 * the giveaway that data was generated, and it also makes the app's own charts
 * useless to look at: every exercise would show the same clean diagonal.
 */
function progressFactor(week: number, weeks: number, rate: number): number {
	const t = weeks <= 1 ? 1 : week / (weeks - 1);
	// Diminishing returns: most of the gain in the first third.
	let gain = (1 - (1 - t) ** 2) * 0.32 * rate;
	// A plateau in the back half of a long run.
	if (weeks > 40 && week >= 30 && week <= 38) {
		gain = progressLevel(30, weeks, rate);
	}
	// Deload weeks: back off, then come back higher.
	if (week > 0 && week % 8 === 0) gain -= 0.06 * rate;
	return 1 + gain;
}

function progressLevel(week: number, weeks: number, rate: number): number {
	const t = weeks <= 1 ? 1 : week / (weeks - 1);
	return (1 - (1 - t) ** 2) * 0.32 * rate;
}

function isoDate(daysAgo: number): string {
	const d = new Date();
	d.setDate(d.getDate() - daysAgo);
	return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

type SetRow = {
	logged_exercise_id: string;
	position: number;
	reps: number;
	weight_kg: number;
	seconds: number | null;
	warmup: boolean;
	completed_at: string;
};

/**
 * Inserts in chunks with every column named on every row.
 *
 * PostgREST normalises a batch to the union of its keys and sends an explicit
 * NULL for anything a row omitted, so a column default never applies inside a
 * batch — `warmup not null default false` fails the whole insert if one row
 * leaves it out. Naming every column on every row is what makes batching safe.
 */
async function insertAll<T extends object>(table: string, rows: T[]) {
	for (let i = 0; i < rows.length; i += 500) {
		const { error } = await db.from(table).insert(rows.slice(i, i + 500));
		if (error) throw new Error(`${table}: ${error.message}`);
	}
}

async function findUserByEmail(email: string) {
	// listUsers has no server-side email filter in this client version.
	for (let page = 1; page <= 10; page++) {
		const { data, error } = await db.auth.admin.listUsers({
			page,
			perPage: 200,
		});
		if (error) throw error;
		const found = data.users.find((u) => u.email === email);
		if (found) return found;
		if (data.users.length < 200) return undefined;
	}
	return undefined;
}

async function seedLifter(lifter: Lifter) {
	let user = await findUserByEmail(lifter.email);

	if (!user) {
		if (lifter.email === OWNER_EMAIL) {
			console.log(`  ! ${OWNER_EMAIL} not found — skipping the owner`);
			return null;
		}
		const { data, error } = await db.auth.admin.createUser({
			email: lifter.email,
			password: `demo-${lifter.seed}-passphrase`,
			email_confirm: true,
		});
		if (error) throw error;
		user = data.user;
	}

	await db
		.from("profiles")
		.update({
			display_name: lifter.name,
			avatar_icon: lifter.icon,
			avatar_color: lifter.color,
			public_profile: lifter.public,
		})
		.eq("id", user.id);

	const random = makeRandom(lifter.seed);
	const sessions: Record<string, unknown>[] = [];
	const plan: { key: string; day: Day; week: number }[] = [];

	// One pass to lay out the calendar, so session rows can be inserted in a
	// single batch and their ids matched back to what was planned for each.
	let dayIndex = 0;
	for (let week = 0; week < lifter.weeks; week++) {
		// Two weeks off somewhere in a long year. Everyone has them.
		const away = lifter.weeks > 40 && (week === 21 || week === 22);
		if (away) continue;

		for (let n = 0; n < lifter.frequency; n++) {
			if (random() < lifter.flake) continue;

			const daysAgo =
				(lifter.weeks - 1 - week) * 7 + Math.floor((n * 7) / lifter.frequency);
			if (daysAgo < 0) continue;

			const day = lifter.split[dayIndex % lifter.split.length];
			dayIndex++;
			const key = `${daysAgo}`;

			// One session per day: `sessions` has no uniqueness on (user, date),
			// but two on the same day would read as a bug in the app, not as data.
			if (plan.some((p) => p.key === key)) continue;

			plan.push({ key, day, week });
			sessions.push({
				user_id: user.id,
				date: isoDate(daysAgo),
				started_at: `${isoDate(daysAgo)}T18:00:00Z`,
				finished_at: `${isoDate(daysAgo)}T${19 + (random() < 0.5 ? 0 : 1)}:${String(Math.floor(random() * 60)).padStart(2, "0")}:00Z`,
				duration_sec: 3300 + Math.floor(random() * 2400),
				notes: `${TAG} ${day.name}`,
			});
		}
	}

	const { data: written, error: sessionError } = await db
		.from("sessions")
		.insert(sessions)
		.select("id, date");
	if (sessionError) throw sessionError;

	const byDate = new Map((written ?? []).map((s) => [s.date, s.id]));

	const loggedRows: Record<string, unknown>[] = [];
	const slotsByKey = new Map<string, Slot[]>();

	for (const entry of plan) {
		const sessionId = byDate.get(isoDate(Number(entry.key)));
		if (!sessionId) continue;
		slotsByKey.set(sessionId, entry.day.slots);
		entry.day.slots.forEach((slot, position) => {
			loggedRows.push({
				session_id: sessionId,
				exercise_slug: slot.slug,
				position,
			});
		});
	}

	const { data: logged, error: loggedError } = await db
		.from("logged_exercises")
		.insert(loggedRows)
		.select("id, session_id, exercise_slug, position");
	if (loggedError) throw loggedError;

	// Map each logged exercise back to the week it belongs to, for the load.
	const weekOf = new Map<string, number>();
	for (const entry of plan) {
		const sessionId = byDate.get(isoDate(Number(entry.key)));
		if (sessionId) weekOf.set(sessionId, entry.week);
	}

	const setRows: SetRow[] = [];
	for (const row of logged ?? []) {
		const slots = slotsByKey.get(row.session_id) ?? [];
		const slot = slots[row.position];
		if (!slot) continue;

		const week = weekOf.get(row.session_id) ?? 0;
		const reference = REFERENCE[slot.slug] ?? 0;
		const factor = progressFactor(week, lifter.weeks, lifter.progress);
		const working = roundLoad(reference * lifter.strength * factor, slot.slug);
		const date = isoDate(0);

		let position = 0;

		// Warm-ups ramp to the working weight and are flagged, which is what
		// keeps them out of volume, records and every leaderboard.
		for (let w = 0; w < slot.warmups; w++) {
			const share = 0.5 + (0.25 * w) / Math.max(1, slot.warmups - 1 || 1);
			setRows.push({
				logged_exercise_id: row.id,
				position: position++,
				reps: slot.reps + 4,
				weight_kg: roundLoad(working * share, slot.slug),
				seconds: null,
				warmup: true,
				completed_at: `${date}T18:${String(position * 3).padStart(2, "0")}:00Z`,
			});
		}

		for (let s = 0; s < slot.sets; s++) {
			// Reps fall off across the working sets, and a good day now and then
			// adds one. Identical sets every time is the other tell.
			const fatigue = s === 0 ? 0 : -Math.floor(random() * 2);
			const goodDay = random() < 0.15 ? 1 : 0;

			if (reference === 0 && slot.reps === 0) {
				// Timed work: plank, in seconds.
				setRows.push({
					logged_exercise_id: row.id,
					position: position++,
					reps: 0,
					weight_kg: 0,
					seconds: 45 + Math.floor(factor * 30) + Math.floor(random() * 15),
					warmup: false,
					completed_at: `${date}T18:${String(position * 3).padStart(2, "0")}:00Z`,
				});
				continue;
			}

			setRows.push({
				logged_exercise_id: row.id,
				position: position++,
				reps: Math.max(1, slot.reps + fatigue + goodDay),
				weight_kg: reference === 0 ? 0 : working,
				seconds: null,
				warmup: false,
				completed_at: `${date}T18:${String(position * 3).padStart(2, "0")}:00Z`,
			});
		}
	}

	await insertAll("sets", setRows);

	// Bodyweight, weekly, drifting with noise rather than climbing cleanly.
	const start = 74 + lifter.strength * 6;
	const bodyweight = [];
	for (let week = 0; week < lifter.weeks; week += 1) {
		const daysAgo = (lifter.weeks - 1 - week) * 7;
		bodyweight.push({
			user_id: user.id,
			date: isoDate(daysAgo),
			weight_kg:
				Math.round(
					(start + (week / lifter.weeks) * 4 + (random() - 0.5) * 1.4) * 10,
				) / 10,
		});
	}
	await insertAll("bodyweight", bodyweight);

	// Routines, named after the days actually trained, and laid across the week
	// in the same rotation the sessions follow. Without weekdays the "today"
	// panel has nothing to show and every day reads as rest, which is not what
	// a year of training looks like.
	const routineNames = [...new Set(lifter.split.map((d) => d.name))];
	const weekdaysFor = (name: string): number[] => {
		const days: number[] = [];
		// Spread the split across Mon..Sun in rotation, leaving the remainder as
		// rest days — a five-day split rests twice, a six-day split once.
		for (let day = 0; day < lifter.frequency && day < 7; day++) {
			if (lifter.split[day % lifter.split.length].name === name) days.push(day);
		}
		return days;
	};

	const { data: routines } = await db
		.from("routines")
		.insert(
			routineNames.map((name) => ({
				user_id: user.id,
				name,
				notes: `${TAG} auto`,
				rating: 3 + Math.floor(random() * 3),
				visibility: random() < 0.6 ? "public" : "private",
				weekdays: weekdaysFor(name),
			})),
		)
		.select("id, name");

	const routineExercises: Record<string, unknown>[] = [];
	const plannedSets: { slug: string; slot: Slot }[] = [];

	for (const routine of routines ?? []) {
		const day = lifter.split.find((d) => d.name === routine.name);
		if (!day) continue;
		day.slots.forEach((slot, position) => {
			routineExercises.push({
				routine_id: routine.id,
				exercise_slug: slot.slug,
				position,
			});
			plannedSets.push({ slug: slot.slug, slot });
		});
	}

	const { data: written2 } = await db
		.from("routine_exercises")
		.insert(routineExercises)
		.select("id, exercise_slug, routine_id");

	/*
	 * One row per planned set, not one target for the exercise.
	 *
	 * A plan can now say a ramp, so the seed writes what the lifter would
	 * actually have written: the working sets at the load they finished the
	 * year on, plus the warm-ups the split calls for, flagged as warm-ups so
	 * they stay out of volume exactly as logged warm-ups do.
	 */
	const setTargets: Record<string, unknown>[] = [];
	for (const row of written2 ?? []) {
		const slot = plannedSets.find((entry) => entry.slug === row.exercise_slug);
		if (!slot) continue;

		const reference = REFERENCE[row.exercise_slug] ?? 0;
		const working =
			reference === 0
				? null
				: roundLoad(
						reference *
							lifter.strength *
							progressFactor(lifter.weeks - 1, lifter.weeks, lifter.progress),
						row.exercise_slug,
					);

		let position = 0;
		for (let w = 0; w < slot.slot.warmups; w++) {
			setTargets.push({
				routine_exercise_id: row.id,
				position: position++,
				reps: slot.slot.reps + 4,
				weight_kg: working ? roundLoad(working * 0.6, row.exercise_slug) : null,
				warmup: true,
			});
		}
		for (let n = 0; n < slot.slot.sets; n++) {
			setTargets.push({
				routine_exercise_id: row.id,
				position: position++,
				reps: slot.slot.reps || null,
				weight_kg: working,
				warmup: false,
			});
		}
	}
	await insertAll("set_targets", setTargets);

	return {
		name: lifter.name,
		sessions: sessions.length,
		sets: setRows.length,
		volume: Math.round(
			setRows
				.filter((s) => !s.warmup)
				.reduce((total, s) => total + s.reps * s.weight_kg, 0),
		),
	};
}

// ---------------------------------------------------------------------------
// Clearing
// ---------------------------------------------------------------------------

async function clear() {
	console.log("→ removing demo data");

	const owner = await findUserByEmail(OWNER_EMAIL);
	if (owner) {
		// Only the tagged rows: anything the owner logged by hand stays.
		const { data: mine } = await db
			.from("sessions")
			.select("id")
			.eq("user_id", owner.id)
			.like("notes", `${TAG}%`);
		if (mine?.length) {
			await db
				.from("sessions")
				.delete()
				.in(
					"id",
					mine.map((s) => s.id),
				);
		}
		const { data: routines } = await db
			.from("routines")
			.select("id")
			.eq("user_id", owner.id)
			.like("notes", `${TAG}%`);
		if (routines?.length) {
			await db
				.from("routines")
				.delete()
				.in(
					"id",
					routines.map((r) => r.id),
				);
		}
		await db.from("bodyweight").delete().eq("user_id", owner.id);
		console.log(`  ✓ ${OWNER_EMAIL}: ${mine?.length ?? 0} sessions removed`);
	}

	const { data } = await db.auth.admin.listUsers({ perPage: 500 });
	const doomed = (data?.users ?? []).filter(
		(u) =>
			u.email?.startsWith(DEMO_EMAIL_PREFIX) ||
			(alsoPurgeSmoke && u.email?.startsWith("smoke-")),
	);

	for (const user of doomed) {
		// Everything cascades from auth.users.
		await db.auth.admin.deleteUser(user.id);
	}
	console.log(`  ✓ ${doomed.length} demo and test accounts deleted`);
}

// ---------------------------------------------------------------------------

if (clearing) {
	await clear();
	console.log("\n✓ cleared");
} else {
	// Start from a clean slate so re-running does not stack a second year on
	// top of the first.
	await clear();

	console.log("\n→ seeding a year");
	const results = [];
	for (const lifter of LIFTERS) {
		const result = await seedLifter(lifter);
		if (result) {
			results.push(result);
			console.log(
				`  ✓ ${result.name.padEnd(7)} ${String(result.sessions).padStart(3)} sessions  ` +
					`${String(result.sets).padStart(5)} sets  ${result.volume.toLocaleString("en")} kg`,
			);
		}
	}

	console.log(
		`\n✓ ${results.reduce((n, r) => n + r.sessions, 0)} sessions, ` +
			`${results.reduce((n, r) => n + r.sets, 0)} sets`,
	);
	console.log("  Undo with: pnpm seed:demo --clear");
}
