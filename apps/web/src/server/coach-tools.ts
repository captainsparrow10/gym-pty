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
			"Resumen del entrenamiento del usuario en los últimos N días: sesiones, series, volumen total y reparto por músculo. Usalo para responder sobre frecuencia, carga de trabajo o qué está descuidando.",
		parameters: {
			type: "object",
			properties: {
				days: {
					type: "integer",
					description: "Ventana en días. 30 si el usuario no especifica.",
				},
			},
			required: ["days"],
		},
	},
	{
		name: "get_exercise_history",
		description:
			"Historial de un ejercicio concreto: series por fecha y mejor 1RM estimado. Usalo para responder sobre progreso o estancamiento en un movimiento.",
		parameters: {
			type: "object",
			properties: {
				exercise_slug: {
					type: "string",
					description: "Slug del catálogo, por ejemplo bench-press.",
				},
			},
			required: ["exercise_slug"],
		},
	},
	{
		name: "find_exercises",
		description:
			"Busca en el catálogo de 302 ejercicios por músculo, equipamiento o texto libre. Usalo cuando pregunten qué ejercicios existen para algo, o alternativas a uno.",
		parameters: {
			type: "object",
			properties: {
				muscle: {
					type: "string",
					description: "Músculo primario, en inglés (Chest, Lats…).",
				},
				equipment: {
					type: "string",
					description:
						"Equipamiento, en inglés (Barbell, Dumbbell, Bodyweight, Machine, Cable…).",
				},
				query: { type: "string", description: "Texto libre sobre el nombre." },
			},
		},
	},
	{
		name: "list_routines",
		description:
			"Rutinas guardadas por el usuario y los ejercicios de cada una.",
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
		ventana_dias: days,
		sesiones: sessions.length,
		series_efectivas: sets,
		volumen_kg: Math.round(volume),
		series_por_musculo: Object.fromEntries(
			[...perMuscle.entries()].sort((a, b) => b[1] - a[1]),
		),
		// Stated rather than left to be inferred from an empty object.
		sin_datos: sessions.length === 0,
	};
}

async function exerciseHistory(supabase: Client, slug: string) {
	const exercise = BY_SLUG.get(slug);
	if (!exercise)
		return { error: `No existe el ejercicio "${slug}" en el catálogo.` };

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
			fecha: date,
			series: sets.map((set) => `${set.reps}x${formatKg(set.weightKg)}kg`),
			mejor_1rm_estimado_kg: Math.round(bestOneRepMax(sets) * 10) / 10,
		}));

	return {
		ejercicio: exercise.name,
		dias_entrenados: days.length,
		historial: days.slice(-12),
		sin_datos: days.length === 0,
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
		ejercicios: matches.slice(0, 20).map((exercise) => ({
			slug: exercise.slug,
			nombre: exercise.name,
			musculo: exercise.primaryMuscle,
			equipo: exercise.equipment,
			tipo: exercise.exerciseType,
		})),
	};
}

async function listRoutines(supabase: Client) {
	const { data, error } = await supabase
		.from("routines")
		.select("name, routine_exercises(exercise_slug, position)");

	if (error) throw error;

	return {
		rutinas: (data ?? []).map((routine) => ({
			nombre: routine.name,
			ejercicios: (routine.routine_exercises ?? [])
				.sort((a, b) => a.position - b.position)
				.map(
					(exercise) =>
						NAMES.get(exercise.exercise_slug) ?? exercise.exercise_slug,
				),
		})),
		sin_datos: (data ?? []).length === 0,
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
			return { error: `Herramienta desconocida: ${name}` };
	}
}
