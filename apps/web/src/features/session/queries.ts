import type { LoggedSet } from "@gym/shared/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/core/api/supabase";

export const activeSessionKey = ["session", "active"] as const;

export type SessionSet = {
	id: string;
	position: number;
	reps: number;
	weightKg: number;
	seconds: number | null;
	warmup: boolean;
};

export type SessionExercise = {
	id: string;
	slug: string;
	position: number;
	sets: SessionSet[];
};

export type ActiveSession = {
	id: string;
	startedAt: string;
	exercises: SessionExercise[];
};

/**
 * The session currently in progress, if any.
 *
 * "In progress" is `finished_at is null`, and a partial unique index guarantees
 * at most one per user. Reading it from the database rather than from client
 * state is what lets the screen survive a reload, which matters when the page
 * is open on a phone that keeps getting locked and unlocked between sets.
 */
export function useActiveSession() {
	return useQuery({
		queryKey: activeSessionKey,
		queryFn: async (): Promise<ActiveSession | null> => {
			const { data, error } = await supabase
				.from("sessions")
				.select(
					"id, started_at, logged_exercises(id, exercise_slug, position, sets(id, position, reps, weight_kg, seconds, warmup))",
				)
				.is("finished_at", null)
				.order("position", { referencedTable: "logged_exercises" })
				.maybeSingle();

			if (error) throw error;
			if (!data) return null;

			return {
				id: data.id,
				startedAt: data.started_at,
				exercises: (data.logged_exercises ?? [])
					.map((exercise) => ({
						id: exercise.id,
						slug: exercise.exercise_slug,
						position: exercise.position,
						sets: (exercise.sets ?? [])
							.map((set) => ({
								id: set.id,
								position: set.position,
								reps: set.reps,
								weightKg: Number(set.weight_kg),
								seconds: set.seconds,
								warmup: set.warmup,
							}))
							.sort((a, b) => a.position - b.position),
					}))
					.sort((a, b) => a.position - b.position),
			};
		},
	});
}

/** Invalidates the active session after any write. */
function useRefresh() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: activeSessionKey });
}

export function useStartSession() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async () => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("No hay sesión iniciada.");

			const { data, error } = await supabase
				.from("sessions")
				.insert({ user_id: auth.user.id })
				.select("id")
				.single();

			if (error) throw error;
			return data.id;
		},
		onSuccess: refresh,
	});
}

export function useFinishSession() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			id,
			startedAt,
		}: {
			id: string;
			startedAt: string;
		}) => {
			const durationSec = Math.max(
				0,
				Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
			);

			const { error } = await supabase
				.from("sessions")
				.update({
					finished_at: new Date().toISOString(),
					duration_sec: durationSec,
				})
				.eq("id", id);

			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

/** Discards an empty session rather than leaving a zero-set entry in history. */
export function useDiscardSession() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase.from("sessions").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useAddExercise() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			sessionId,
			slug,
			position,
		}: {
			sessionId: string;
			slug: string;
			position: number;
		}) => {
			const { error } = await supabase
				.from("logged_exercises")
				.insert({ session_id: sessionId, exercise_slug: slug, position });

			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useRemoveExercise() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("logged_exercises")
				.delete()
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useLogSet() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			loggedExerciseId,
			position,
			set,
		}: {
			loggedExerciseId: string;
			position: number;
			set: LoggedSet;
		}) => {
			const { error } = await supabase.from("sets").insert({
				logged_exercise_id: loggedExerciseId,
				position,
				reps: set.reps,
				weight_kg: set.weightKg,
				seconds: set.seconds ?? null,
				warmup: set.warmup ?? false,
			});

			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useDeleteSet() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase.from("sets").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

/**
 * The last time this exercise was worked, whatever session that was.
 *
 * Shown next to the inputs while logging: the single most useful number when
 * deciding what to put on the bar is what you did last time.
 */
export function useLastPerformance(slug: string | null) {
	return useQuery({
		enabled: Boolean(slug),
		queryKey: ["session", "last", slug] as const,
		queryFn: async (): Promise<SessionSet[]> => {
			const { data, error } = await supabase
				.from("logged_exercises")
				.select(
					"id, sets(position, reps, weight_kg, seconds, warmup), sessions!inner(finished_at)",
				)
				.eq("exercise_slug", slug as string)
				.not("sessions.finished_at", "is", null)
				.order("finished_at", { referencedTable: "sessions", ascending: false })
				.limit(1);

			if (error) throw error;

			const sets = data?.[0]?.sets ?? [];
			return sets
				.map((set) => ({
					id: `${set.position}`,
					position: set.position,
					reps: set.reps,
					weightKg: Number(set.weight_kg),
					seconds: set.seconds,
					warmup: set.warmup,
				}))
				.sort((a, b) => a.position - b.position);
		},
	});
}

/**
 * Adds an exercise to the session, opening one if none is running.
 *
 * Written as a single mutation so the entry point from the catalogue is one
 * tap. Starting a session and then adding to it as two separate steps would
 * leave an empty session behind whenever the second half failed, and an empty
 * session blocks the next attempt through the one-open-session index.
 */
export function useAddToSession() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (slug: string) => {
			const { data: existing, error: readError } = await supabase
				.from("sessions")
				.select("id, logged_exercises(exercise_slug, position)")
				.is("finished_at", null)
				.maybeSingle();
			if (readError) throw readError;

			let sessionId = existing?.id;
			let position = 0;

			if (existing) {
				const already = (existing.logged_exercises ?? []).some(
					(exercise) => exercise.exercise_slug === slug,
				);
				// Already there: nothing to do, and adding a duplicate row would only
				// split the sets for one movement across two cards.
				if (already) return { sessionId: existing.id, added: false };

				position =
					Math.max(
						-1,
						...(existing.logged_exercises ?? []).map((e) => e.position),
					) + 1;
			} else {
				const { data: auth } = await supabase.auth.getUser();
				if (!auth.user) throw new Error("No hay sesión iniciada.");

				const { data: created, error: createError } = await supabase
					.from("sessions")
					.insert({ user_id: auth.user.id })
					.select("id")
					.single();
				if (createError) throw createError;
				sessionId = created.id;
			}

			const { error } = await supabase.from("logged_exercises").insert({
				session_id: sessionId as string,
				exercise_slug: slug,
				position,
			});

			if (error) {
				// Undo the session this call opened, rather than leaving an empty one
				// that would block the next attempt.
				if (!existing && sessionId) {
					await supabase.from("sessions").delete().eq("id", sessionId);
				}
				throw error;
			}

			return { sessionId: sessionId as string, added: true };
		},
		onSuccess: refresh,
	});
}
