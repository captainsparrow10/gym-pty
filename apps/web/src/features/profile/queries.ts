import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/core/api/supabase";
import type { AvatarColorName, AvatarIconName } from "@/core/ui/avatar";

export const profileKey = ["profile"] as const;

export type Profile = {
	id: string;
	displayName: string | null;
	avatarIcon: AvatarIconName;
	avatarColor: AvatarColorName;
	/** Whether this profile appears in the leaderboard and is readable by others. */
	publicProfile: boolean;
	/** Default rest between sets, when a plan does not say. */
	restSeconds: number;
};

export function useProfile() {
	return useQuery({
		queryKey: profileKey,
		queryFn: async (): Promise<Profile> => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			/*
			 * `id = auth.uid()` no longer scopes this on its own: row level
			 * security now also returns every other public profile, so `.single()`
			 * would fail once more than one exists. The explicit filter is what
			 * makes this "my profile" rather than "a profile".
			 */
			const { data, error } = await supabase
				.from("profiles")
				.select(
					"id, display_name, avatar_icon, avatar_color, public_profile, rest_seconds",
				)
				.eq("id", auth.user.id)
				.single();

			if (error) throw error;

			return {
				id: data.id,
				displayName: data.display_name,
				avatarIcon: data.avatar_icon as AvatarIconName,
				avatarColor: data.avatar_color as AvatarColorName,
				publicProfile: data.public_profile,
				restSeconds: data.rest_seconds,
			};
		},
	});
}

function useRefresh() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: profileKey });
}

export function useUpdateDisplayName() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (displayName: string) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			const { error } = await supabase
				.from("profiles")
				.update({ display_name: displayName.trim() || null })
				.eq("id", auth.user.id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useUpdateAvatar() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			icon,
			color,
		}: {
			icon: AvatarIconName;
			color: AvatarColorName;
		}) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			const { error } = await supabase
				.from("profiles")
				.update({ avatar_icon: icon, avatar_color: color })
				.eq("id", auth.user.id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useSetPublicProfile() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (publicProfile: boolean) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			const { error } = await supabase
				.from("profiles")
				.update({ public_profile: publicProfile })
				.eq("id", auth.user.id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

/**
 * Default rest between sets.
 *
 * The column has existed since the first schema and was never editable: the
 * session used a hardcoded 90 until recently, and once it started reading this
 * there was still nowhere to change it. A plan's own rest still wins over it;
 * this is what applies when nothing else says.
 */
export function useUpdateRestSeconds() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (restSeconds: number) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			const { error } = await supabase
				.from("profiles")
				.update({ rest_seconds: restSeconds })
				.eq("id", auth.user.id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}
