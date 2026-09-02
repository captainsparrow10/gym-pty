import { catalog } from "@gym/shared/catalog";
import { bestOneRepMax, formatKg, type LoggedSet } from "@gym/shared/domain";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/core/api/database.types";
import type { Tool } from "./gemini";

/**
 * Tools the coach can call.
 *
 * Every one of them reads. None writes.
 *
 * The brief was a consultant over the user's own data and over how the app
 * works — not an agent that changes things. A model that can only read cannot
 * quietly delete a routine because it misread a question, and the user stays
 * the one who edits their training. Adding a write tool later is a deliberate
 * decision, not a default.
 */

/**
 * A Supabase client acting as the signed-in user.
 *
 * The access token comes from the browser and goes straight into the
 * Authorization header, so row level security applies exactly as it does in the
 * client. The server never holds the service role key and therefore cannot read
 * anyone else's data even if a request is forged.
 */
export function userClient(accessToken: string) {
	return createClient<Database>(
		process.env.VITE_SUPABASE_URL ?? "",
		process.env.VITE_SUPABASE_ANON_KEY ?? "",
		{
			global: { headers: { Authorization: `Bearer ${accessToken}` } },
			auth: { persistSession: false, autoRefreshToken: false },
		},
	);
}

const NAMES = new Map(catalog.exercises.map((e) => [e.slug, e.name]));
const BY_SLUG = new Map(catalog.exercises.map((e) => [e.slug, e]));

export const TOOLS: Tool[] = [
	{
		name: "get_training_summary",
		description:
			"The user's training over the last N days: sessions, sets, total volume and the split per muscle. Use it for questions about frequency, workload, or what is being neglected.",
		parameters: {
			type: "object",
			properties: {
				days: {
					type: "integer",
					description: "Window in days. Use 30 when the user does not say.",
				},
			},
			required: ["days"],
		},
	},
	{
		name: "get_exercise_history",
		description:
			"History for one exercise: sets by date and best estimated 1RM. Use it for questions about progress or plateaus on a movement.",
		parameters: {
			type: "object",
			properties: {
				exercise_slug: {
					type: "string",
					description: "Catalogue slug, for example bench-press.",
				},
			},
			required: ["exercise_slug"],
		},
	},
	{
		name: "find_exercises",
		description:
			"Searches the 302-exercise catalogue by muscle, equipment or free text. Use it when asked what exercises exist for something, or for alternatives to one.",
		parameters: {
			type: "object",
			properties: {
				muscle: {
					type: "string",
					description: "Primary muscle, e.g. Chest, Lats.",
				},
				equipment: {
					type: "string",
					description:
						"Equipment, e.g. Barbell, Dumbbell, Bodyweight, Machine, Cable.",
				},
				query: {
					type: "string",
					description: "Free text matched against the name.",
				},
			},
		},
	},
	{
		name: "list_routines",
		description: "The user's saved routines and the exercises in each.",
		parameters: { type: "object", properties: {} },
	},
];

type Client = ReturnType<typeof userClient>;

async function trainingSummary(supabase: Client, days: number) {
	const since = new Date();
	since.setDate(since.getDate() - days);

	const { data, error } = await supabase
		.from("sessions")
		.select(
			"date, logged_exercises(exercise_slug, sets(reps, weight_kg, warmup))",
		)
		.not("finished_at", "is", null)
		.gte("date", since.toISOString().slice(0, 10));

	if (error) throw error;

	const sessions = data ?? [];
	const perMuscle = new Map<string, number>();
	let sets = 0;
	let volume = 0;

	for (const session of sessions) {
		for (const exercise of session.logged_exercises ?? []) {
			const muscle = BY_SLUG.get(exercise.exercise_slug)?.primaryMuscle;
			for (const set of exercise.sets ?? []) {
				if (set.warmup) continue;
				sets += 1;
				volume += set.reps * Number(set.weight_kg);
				if (muscle) perMuscle.set(muscle, (perMuscle.get(muscle) ?? 0) + 1);
			}
		}
	}

	return {
		window_days: days,
		sessions: sessions.length,
		working_sets: sets,
		volume_kg: Math.round(volume),
		sets_per_muscle: Object.fromEntries(
			[...perMuscle.entries()].sort((a, b) => b[1] - a[1]),
		),
		// Stated rather than left to be inferred from an empty object.
		no_data: sessions.length === 0,
	};
}

async function exerciseHistory(supabase: Client, slug: string) {
	const exercise = BY_SLUG.get(slug);
	if (!exercise) return { error: `No exercise "${slug}" in the catalogue.` };

	const { data, error } = await supabase
		.from("logged_exercises")
		.select("sets(reps, weight_kg, warmup), sessions!inner(date, finished_at)")
		.eq("exercise_slug", slug)
		.not("sessions.finished_at", "is", null);

	if (error) throw error;

	const byDate = new Map<string, LoggedSet[]>();
	for (const row of data ?? []) {
		const date = (row.sessions as unknown as { date: string }).date;
		const sets = byDate.get(date) ?? [];
		for (const set of row.sets ?? []) {
			if (set.warmup) continue;
			sets.push({ reps: set.reps, weightKg: Number(set.weight_kg) });
		}
		byDate.set(date, sets);
	}

	const days = [...byDate.entries()]
		.filter(([, sets]) => sets.length > 0)
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([date, sets]) => ({
			date,
			sets: sets.map((set) => `${set.reps}x${formatKg(set.weightKg)}kg`),
			best_estimated_1rm_kg: Math.round(bestOneRepMax(sets) * 10) / 10,
		}));

	return {
		exercise: exercise.name,
		days_trained: days.length,
		history: days.slice(-12),
		no_data: days.length === 0,
	};
}

function findExercises(args: {
	muscle?: string;
	equipment?: string;
	query?: string;
}) {
	const normalize = (value: string) =>
		value
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");

	const tokens = args.query
		? normalize(args.query).split(/\s+/).filter(Boolean)
		: [];

	const matches = catalog.exercises.filter((exercise) => {
		if (
			args.muscle &&
			normalize(exercise.primaryMuscle) !== normalize(args.muscle)
		)
			return false;
		if (
			args.equipment &&
			normalize(exercise.equipment) !== normalize(args.equipment)
		)
			return false;
		if (tokens.length === 0) return true;
		const haystack = normalize(
			`${exercise.name} ${exercise.equipment} ${exercise.primaryMuscle}`,
		);
		return tokens.every((token) => haystack.includes(token));
	});

	return {
		total: matches.length,
		// Capped: a hundred names in the context is noise, and the model only
		// needs enough to make a recommendation.
		exercises: matches.slice(0, 20).map((exercise) => ({
			slug: exercise.slug,
			name: exercise.name,
			muscle: exercise.primaryMuscle,
			equipment: exercise.equipment,
			type: exercise.exerciseType,
		})),
	};
}

async function listRoutines(supabase: Client) {
	const { data: auth } = await supabase.auth.getUser();

	/*
	 * A public routine is now selectable by anyone, so without this filter the
	 * coach would mix other people's routines into what it tells this user
	 * about "your routines".
	 */
	const { data, error } = await supabase
		.from("routines")
		.select("name, routine_exercises(exercise_slug, position)")
		.eq("user_id", auth.user?.id ?? "");

	if (error) throw error;

	return {
		routines: (data ?? []).map((routine) => ({
			name: routine.name,
			exercises: (routine.routine_exercises ?? [])
				.sort((a, b) => a.position - b.position)
				.map(
					(exercise) =>
						NAMES.get(exercise.exercise_slug) ?? exercise.exercise_slug,
				),
		})),
		no_data: (data ?? []).length === 0,
	};
}

export async function runTool(
	supabase: Client,
	name: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	switch (name) {
		case "get_training_summary":
			return trainingSummary(supabase, Number(args.days) || 30);
		case "get_exercise_history":
			return exerciseHistory(supabase, String(args.exercise_slug ?? ""));
		case "find_exercises":
			return findExercises(
				args as { muscle?: string; equipment?: string; query?: string },
			);
		case "list_routines":
			return listRoutines(supabase);
		default:
			return { error: `Unknown tool: ${name}` };
	}
}
