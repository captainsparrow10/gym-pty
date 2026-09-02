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
