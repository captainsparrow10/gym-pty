import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/core/api/supabase";
import type { AvatarColorName, AvatarIconName } from "@/core/ui/avatar";

export type LeaderboardEntry = {
	userId: string;
	displayName: string | null;
	avatarIcon: AvatarIconName;
	avatarColor: AvatarColorName;
	sessions: number;
	sets: number;
	volumeKg: number;
};

export type LeaderboardWindow = "week" | "month" | "all";

export const WINDOW_LABELS: Record<LeaderboardWindow, string> = {
	week: "This week",
	month: "This month",
	all: "All time",
};

const WINDOW_DAYS: Record<LeaderboardWindow, number | undefined> = {
	week: 7,
	month: 30,
	all: undefined,
};

/**
 * The global leaderboard.
 *
 * This calls a security definer function rather than selecting from a table:
 * it is the one sanctioned way to see anything about another user's training,
 * and it only ever returns aggregates — never a session, a set, or a routine
 * that was not made public. See `supabase/migrations/20260902060000_leaderboard.sql`.
 */
export function useLeaderboard(window: LeaderboardWindow) {
	return useQuery({
		queryKey: ["leaderboard", window] as const,
		queryFn: async (): Promise<LeaderboardEntry[]> => {
			const days = WINDOW_DAYS[window];
			const { data, error } = await supabase.rpc(
				"leaderboard",
				days === undefined ? {} : { p_days: days },
			);
			if (error) throw error;

			return (data ?? [])
				.map((row) => ({
					userId: row.user_id,
					displayName: row.display_name,
					avatarIcon: row.avatar_icon as AvatarIconName,
					avatarColor: row.avatar_color as AvatarColorName,
					sessions: row.sessions,
					sets: row.sets,
					// `numeric` columns come back from PostgREST as strings; the
					// generated type says `number` but does not make it one.
					volumeKg: Number(row.volume_kg),
				}))
				.sort((a, b) => b.volumeKg - a.volumeKg);
		},
	});
}

export type ExerciseRankEntry = {
	userId: string;
	displayName: string | null;
	avatarIcon: AvatarIconName;
	avatarColor: AvatarColorName;
	sessions: number;
	sets: number;
	reps: number;
	volumeKg: number;
	topWeightKg: number;
	bestOneRmKg: number;
	topSeconds: number;
	lastPerformed: string | null;
};

/**
 * The leaderboard for one exercise.
 *
 * Ranked on estimated 1RM rather than on load: two people who both put 100 kg
 * on the bar are not doing the same thing if one did a single and the other
 * did eight, and load alone would call them equal. Volume breaks the tie,
 * because at equal strength the one who did more work did more work.
 *
 * For a movement nobody loads, all of that is zero and the ranking falls
 * through to reps, then to hold time. A pull-up board ranked on kilograms is a
 * list of ties in arbitrary order, and a plank board doubly so.
 *
 * Same guarantees as `useLeaderboard` — a security definer function returning
 * aggregates only, so nothing here can reach an individual set.
 * See `supabase/migrations/20260902090000_exercise_leaderboard.sql`.
 */
export function useExerciseLeaderboard(
	slug: string,
	window: LeaderboardWindow = "all",
) {
	return useQuery({
		queryKey: ["leaderboard", "exercise", slug, window] as const,
		queryFn: async (): Promise<ExerciseRankEntry[]> => {
			const days = WINDOW_DAYS[window];
			const { data, error } = await supabase.rpc("exercise_leaderboard", {
				p_slug: slug,
				...(days === undefined ? {} : { p_days: days }),
			});
			if (error) throw error;

			return (data ?? []).map((row) => ({
				userId: row.user_id,
				displayName: row.display_name,
				avatarIcon: row.avatar_icon as AvatarIconName,
				avatarColor: row.avatar_color as AvatarColorName,
				sessions: row.sessions,
				sets: row.sets,
				reps: row.reps,
				// `numeric` comes back from PostgREST as a string; the generated
				// type says `number` but does not make it one.
				volumeKg: Number(row.volume_kg),
				topWeightKg: Number(row.top_weight_kg),
				bestOneRmKg: Number(row.best_one_rm_kg),
				topSeconds: row.top_seconds,
				lastPerformed: row.last_performed,
			}));
		},
	});
}

export type CategoryRankEntry = {
	userId: string;
	displayName: string | null;
	avatarIcon: AvatarIconName;
	avatarColor: AvatarColorName;
	sessions: number;
	sets: number;
	reps: number;
	volumeKg: number;
	topWeightKg: number;
	bestOneRmKg: number;
	/** Distinct exercises from the category this person actually trains. */
	exercises: number;
	lastPerformed: string | null;
};

/**
 * The leaderboard for a category — a muscle, a piece of equipment, a type.
 *
 * The category is resolved to slugs here rather than in Postgres, because the
 * classification lives in `packages/shared/catalog` and duplicating it in the
 * database would give the app two versions that silently drift apart on the
 * next catalogue rebuild. The function only knows how to aggregate over a set
 * of slugs.
 *
 * Ranked on volume, unlike the single-exercise board. A category is a body of
 * work rather than one lift; the heaviest single set across thirty movements
 * says less about it than the total does.
 *
 * See `supabase/migrations/20260902110000_category_leaderboard.sql`.
 */
export function useCategoryLeaderboard(
	slugs: string[],
	window: LeaderboardWindow = "all",
) {
	const days = WINDOW_DAYS[window];

	return useQuery({
		// Sorted, so two callers that resolved the same category in a different
		// order share one cache entry instead of fetching it twice.
		queryKey: ["leaderboard", "category", [...slugs].sort(), window] as const,
		enabled: slugs.length > 0,
		queryFn: async (): Promise<CategoryRankEntry[]> => {
			const { data, error } = await supabase.rpc("category_leaderboard", {
				p_slugs: slugs,
				...(days === undefined ? {} : { p_days: days }),
			});
			if (error) throw error;

			return (data ?? []).map((row) => ({
				userId: row.user_id,
				displayName: row.display_name,
				avatarIcon: row.avatar_icon as AvatarIconName,
				avatarColor: row.avatar_color as AvatarColorName,
				sessions: row.sessions,
				sets: row.sets,
				reps: row.reps,
				// `numeric` comes back from PostgREST as a string.
				volumeKg: Number(row.volume_kg),
				topWeightKg: Number(row.top_weight_kg),
				bestOneRmKg: Number(row.best_one_rm_kg),
				exercises: row.exercises,
				lastPerformed: row.last_performed,
			}));
		},
	});
}
