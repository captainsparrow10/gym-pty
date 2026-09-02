import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/core/api/supabase";
import { activeSessionKey } from "@/features/session/queries";

export const routinesKey = ["routines"] as const;

export type RoutineExercise = {
	id: string;
	slug: string;
	position: number;
	targetSets: number | null;
	targetReps: number | null;
};

export type Routine = {
	id: string;
	name: string;
	notes: string | null;
	exercises: RoutineExercise[];
};

export function useRoutines() {
	return useQuery({
		queryKey: routinesKey,
		queryFn: async (): Promise<Routine[]> => {
			const { data, error } = await supabase
				.from("routines")
				.select(
					"id, name, notes, routine_exercises(id, exercise_slug, position, target_sets, target_reps)",
				)
				.order("created_at", { ascending: true });

			if (error) throw error;

			return (data ?? []).map((routine) => ({
				id: routine.id,
				name: routine.name,
				notes: routine.notes,
				exercises: (routine.routine_exercises ?? [])
					.map((exercise) => ({
						id: exercise.id,
						slug: exercise.exercise_slug,
						position: exercise.position,
						targetSets: exercise.target_sets,
						targetReps: exercise.target_reps,
					}))
					.sort((a, b) => a.position - b.position),
			}));
		},
	});
}

function useRefresh() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: routinesKey });
}

export function useCreateRoutine() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (name: string) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("No hay sesión iniciada.");

			const { data, error } = await supabase
				.from("routines")
				.insert({ user_id: auth.user.id, name })
				.select("id")
				.single();

			if (error) throw error;
			return data.id;
		},
		onSuccess: refresh,
	});
}

export function useRenameRoutine() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({ id, name }: { id: string; name: string }) => {
			const { error } = await supabase
				.from("routines")
				.update({ name })
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useDeleteRoutine() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase.from("routines").delete().eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useAddRoutineExercise() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			routineId,
			slug,
			position,
		}: {
			routineId: string;
			slug: string;
			position: number;
		}) => {
			const { error } = await supabase
				.from("routine_exercises")
				.insert({ routine_id: routineId, exercise_slug: slug, position });

			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useRemoveRoutineExercise() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("routine_exercises")
				.delete()
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

/**
 * Reorders one exercise within a routine.
 *
 * `(routine_id, position)` is unique, so a straight swap would collide on the
 * first update. Both rows are parked on negative positions first, which no real
 * row ever uses, and then written to their final values.
 */
export function useSwapRoutineExercises() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			a,
			b,
		}: {
			a: { id: string; position: number };
			b: { id: string; position: number };
		}) => {
			const park = async (id: string, position: number) => {
				const { error } = await supabase
					.from("routine_exercises")
					.update({ position })
					.eq("id", id);
				if (error) throw error;
			};

			await park(a.id, -1);
			await park(b.id, -2);
			await park(a.id, b.position);
			await park(b.id, a.position);
		},
		onSuccess: refresh,
	});
}

/**
 * Opens a session preloaded with a routine's exercises.
 *
 * Written as one mutation rather than a start-then-add-each loop so a failure
 * halfway through does not leave an open session holding half a routine.
 */
export function useStartFromRoutine() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (routine: Routine) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("No hay sesión iniciada.");

			const { data: session, error: sessionError } = await supabase
				.from("sessions")
				.insert({ user_id: auth.user.id })
				.select("id")
				.single();
			if (sessionError) throw sessionError;

			if (routine.exercises.length > 0) {
				/*
				 * Every row here carries the same keys, which matters: PostgREST
				 * normalises a batch insert to the union of the keys it receives and
				 * sends an explicit NULL for whatever a row omits, so a column default
				 * never fills the gap. A row missing a `not null default` column fails
				 * the whole batch.
				 */
				const { error } = await supabase.from("logged_exercises").insert(
					routine.exercises.map((exercise, position) => ({
						session_id: session.id,
						exercise_slug: exercise.slug,
						position,
					})),
				);

				if (error) {
					// Roll back rather than leaving an empty session that would block
					// the next attempt through the one-open-session index.
					await supabase.from("sessions").delete().eq("id", session.id);
					throw error;
				}
			}

			return session.id;
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: activeSessionKey }),
	});
}
