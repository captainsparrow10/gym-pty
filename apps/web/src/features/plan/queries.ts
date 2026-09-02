import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/core/api/supabase";
import { type SetTarget, toSetTargets } from "@/features/plan/set-targets";
import { toIso } from "@/features/progress/queries";

export type PlannedExercise = {
	id: string;
	date: string;
	slug: string;
	position: number;
	sets: SetTarget[];
	note: string | null;
};

const KEY = ["plan"] as const;

function useRefresh() {
	const client = useQueryClient();
	return () => client.invalidateQueries({ queryKey: KEY });
}

/** ISO date `days` from today, in local terms. */
export function dateFromToday(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return toIso(date);
}

/**
 * Everything planned from today onwards.
 *
 * Deliberately not "everything": a plan for last Tuesday is history, and the
 * question this answers is what is coming. Past plans stay in the table —
 * deleting them would lose the record of what you meant to do on a day you
 * then trained differently — they are simply not what the planner shows.
 */
export function useUpcomingPlan(days = 14) {
	return useQuery({
		queryKey: [...KEY, "upcoming", days] as const,
		queryFn: async (): Promise<PlannedExercise[]> => {
			const { data, error } = await supabase
				.from("planned_exercises")
				.select(
					"id, date, exercise_slug, position, note, set_targets(id, position, reps, weight_kg, rest_seconds, warmup)",
				)
				.gte("date", dateFromToday(0))
				.lte("date", dateFromToday(days))
				.order("date")
				.order("position");

			if (error) throw error;

			return (data ?? []).map((row) => ({
				id: row.id,
				date: row.date,
				slug: row.exercise_slug,
				position: row.position,
				sets: toSetTargets(row.set_targets),
				note: row.note,
			}));
		},
	});
}

/** What is planned for one date. */
export function usePlanFor(date: string) {
	return useQuery({
		queryKey: [...KEY, "day", date] as const,
		queryFn: async (): Promise<PlannedExercise[]> => {
			const { data, error } = await supabase
				.from("planned_exercises")
				.select(
					"id, date, exercise_slug, position, note, set_targets(id, position, reps, weight_kg, rest_seconds, warmup)",
				)
				.eq("date", date)
				.order("position");

			if (error) throw error;

			return (data ?? []).map((row) => ({
				id: row.id,
				date: row.date,
				slug: row.exercise_slug,
				position: row.position,
				sets: toSetTargets(row.set_targets),
				note: row.note,
			}));
		},
	});
}

/** Postgres unique violation: this exercise is already on that day. */
const DUPLICATE = "23505";

export type AddToDayResult = { added: boolean };

/**
 * Puts one exercise on one date.
 *
 * Returns `added: false` rather than throwing when it is already there, so the
 * caller can say "already planned" instead of showing an error for something
 * that is not one. The same shape `useAddToSession` returns, because it is the
 * same situation.
 */
export function useAddToDay() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			slug,
			date,
		}: {
			slug: string;
			date: string;
		}): Promise<AddToDayResult> => {
			const { data: session } = await supabase.auth.getUser();
			const userId = session.user?.id;
			if (!userId) throw new Error("Not signed in");

			// Appended, not inserted at the top: a plan is read in the order you
			// built it. `position` is the count rather than max+1 because gaps are
			// allowed and either lands it at the end.
			const { count } = await supabase
				.from("planned_exercises")
				.select("id", { count: "exact", head: true })
				.eq("date", date);

			const { error } = await supabase.from("planned_exercises").insert({
				user_id: userId,
				date,
				exercise_slug: slug,
				position: count ?? 0,
			});

			if (error) {
				if (error.code === DUPLICATE) return { added: false };
				throw error;
			}
			return { added: true };
		},
		onSuccess: refresh,
	});
}

export function useRemoveFromDay() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("planned_exercises")
				.delete()
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}
