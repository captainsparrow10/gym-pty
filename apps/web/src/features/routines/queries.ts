import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { reorderPositions } from "@/core/api/reorder";
import { supabase } from "@/core/api/supabase";
import { type SetTarget, toSetTargets } from "@/features/plan/set-targets";
import { activeSessionKey } from "@/features/session/queries";

export const routinesKey = ["routines"] as const;

export type RoutineExercise = {
	id: string;
	slug: string;
	position: number;
	/**
	 * One entry per planned set, so a plan can say "8 at 60, 6 at 70, 4 at 80".
	 * The count of sets is the length of this list.
	 */
	sets: SetTarget[];
};

export type Visibility = "private" | "public";

export type Routine = {
	id: string;
	name: string;
	notes: string | null;
	/** 1-5 self-rating. Null means unrated, which is not the same as bad. */
	rating: number | null;
	visibility: Visibility;
	/** Planned weekdays, 0 = Monday .. 6 = Sunday. Empty means unscheduled. */
	weekdays: number[];
	exercises: RoutineExercise[];
};

/** The owner of a routine seen through `usePublicRoutines`, not one's own. */
export type RoutineOwner = {
	displayName: string | null;
	avatarIcon: string;
	avatarColor: string;
};

export type PublicRoutine = Routine & {
	/**
	 * Null when the owner has since set `public_profile` to false: the routine
	 * itself stays readable because its own visibility is a separate switch,
	 * but row level security no longer returns their profile row.
	 */
	owner: RoutineOwner | null;
};

/** How a routine has actually gone, gathered from the sessions run from it. */
export type RoutineStats = {
	timesPerformed: number;
	lastPerformed: string | null;
	totalVolumeKg: number;
	averageVolumeKg: number;
	averageDurationSec: number;
};

export function useRoutines() {
	return useQuery({
		queryKey: routinesKey,
		queryFn: async (): Promise<Routine[]> => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			/*
			 * Row level security alone no longer scopes this to "mine": a public
			 * routine is selectable by anyone, so without this filter the list
			 * would mix in every public routine on the site, not just the ones
			 * this user owns. `usePublicRoutines` is the query for those.
			 */
			const { data, error } = await supabase
				.from("routines")
				.select(
					"id, name, notes, rating, visibility, weekdays, routine_exercises(id, exercise_slug, position, set_targets(id, position, reps, weight_kg, rest_seconds, warmup))",
				)
				.eq("user_id", auth.user.id)
				.order("created_at", { ascending: true });

			if (error) throw error;

			return (data ?? []).map((routine) => ({
				id: routine.id,
				name: routine.name,
				notes: routine.notes,
				rating: routine.rating,
				visibility: routine.visibility as Visibility,
				weekdays: routine.weekdays ?? [],
				exercises: (routine.routine_exercises ?? [])
					.map((exercise) => ({
						id: exercise.id,
						slug: exercise.exercise_slug,
						position: exercise.position,
						sets: toSetTargets(exercise.set_targets),
					}))
					.sort((a, b) => a.position - b.position),
			}));
		},
	});
}

export const publicRoutinesKey = ["routines", "public"] as const;

/**
 * Other people's public routines, for browsing.
 *
 * `profiles` has no foreign key to `routines` — both merely reference
 * `auth.users`, so PostgREST cannot embed one in the other the way
 * `routine_exercises` embeds under `routines`. Fetching the owning profiles
 * separately and joining them in memory avoids adding a schema relationship
 * whose only purpose would be a client-side convenience.
 */
export function usePublicRoutines() {
	return useQuery({
		queryKey: publicRoutinesKey,
		queryFn: async (): Promise<PublicRoutine[]> => {
			const { data: auth } = await supabase.auth.getUser();

			const { data, error } = await supabase
				.from("routines")
				.select(
					"id, name, notes, rating, visibility, weekdays, user_id, routine_exercises(id, exercise_slug, position, set_targets(id, position, reps, weight_kg, rest_seconds, warmup))",
				)
				.eq("visibility", "public")
				.order("created_at", { ascending: false });

			if (error) throw error;

			const others = (data ?? []).filter(
				(routine) => routine.user_id !== auth.user?.id,
			);

			const ownerIds = [...new Set(others.map((routine) => routine.user_id))];
			const { data: owners } =
				ownerIds.length > 0
					? await supabase
							.from("profiles")
							.select("id, display_name, avatar_icon, avatar_color")
							.in("id", ownerIds)
					: { data: [] };
			const ownerById = new Map(
				(owners ?? []).map((owner) => [owner.id, owner]),
			);

			return others.map((routine) => {
				const owner = ownerById.get(routine.user_id);
				return {
					id: routine.id,
					name: routine.name,
					notes: routine.notes,
					rating: routine.rating,
					visibility: routine.visibility as Visibility,
					weekdays: routine.weekdays ?? [],
					exercises: (routine.routine_exercises ?? [])
						.map((exercise) => ({
							id: exercise.id,
							slug: exercise.exercise_slug,
							position: exercise.position,
							sets: toSetTargets(exercise.set_targets),
						}))
						.sort((a, b) => a.position - b.position),
					owner: owner
						? {
								displayName: owner.display_name,
								avatarIcon: owner.avatar_icon,
								avatarColor: owner.avatar_color,
							}
						: null,
				};
			});
		},
	});
}

function useRefresh() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: routinesKey });
}

/** Postgres codes surface as English; these are the ones a routine can hit. */
export function routineErrorMessage(error: unknown): string {
	const code = (error as { code?: string })?.code;
	if (code === "23505") return "You already have a routine with that name.";
	return (error as Error)?.message ?? "Something went wrong.";
}

export function useCreateRoutine() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (name: string) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

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

/**
 * Per-routine history.
 *
 * Sessions carry `routine_id` when started from a routine, which is what makes
 * "how has this been going" answerable at all. Volume is summed here rather
 * than in SQL for the same reason the charts do it: one definition of the
 * number, in `@gym/shared/domain`, not a second one in Postgres.
 */
export function useRoutineStats() {
	return useQuery({
		queryKey: ["routines", "stats"] as const,
		queryFn: async (): Promise<Map<string, RoutineStats>> => {
			const { data, error } = await supabase
				.from("sessions")
				.select(
					"routine_id, date, duration_sec, logged_exercises(sets(reps, weight_kg, warmup))",
				)
				.not("routine_id", "is", null)
				.not("finished_at", "is", null);

			if (error) throw error;

			const byRoutine = new Map<string, RoutineStats>();

			for (const session of data ?? []) {
				const id = session.routine_id as string;
				const stats = byRoutine.get(id) ?? {
					timesPerformed: 0,
					lastPerformed: null,
					totalVolumeKg: 0,
					averageVolumeKg: 0,
					averageDurationSec: 0,
				};

				const volume = (session.logged_exercises ?? [])
					.flatMap((exercise) => exercise.sets ?? [])
					.filter((set) => !set.warmup)
					.reduce((total, set) => total + set.reps * Number(set.weight_kg), 0);

				stats.timesPerformed += 1;
				stats.totalVolumeKg += volume;
				stats.averageDurationSec += session.duration_sec;
				if (!stats.lastPerformed || session.date > stats.lastPerformed) {
					stats.lastPerformed = session.date;
				}
				byRoutine.set(id, stats);
			}

			for (const stats of byRoutine.values()) {
				stats.averageVolumeKg = stats.totalVolumeKg / stats.timesPerformed;
				stats.averageDurationSec =
					stats.averageDurationSec / stats.timesPerformed;
			}

			return byRoutine;
		},
	});
}

export function useRateRoutine() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			id,
			rating,
		}: {
			id: string;
			rating: number | null;
		}) => {
			const { error } = await supabase
				.from("routines")
				.update({ rating })
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useSetRoutineVisibility() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			id,
			visibility,
		}: {
			id: string;
			visibility: Visibility;
		}) => {
			const { error } = await supabase
				.from("routines")
				.update({ visibility })
				.eq("id", id);
			if (error) throw error;
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
				.update({ name: name.trim() })
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
			if (!auth.user) throw new Error("Not signed in.");

			// routine_id is what makes the routine's own history exist. Without it
			// a session started from a routine is indistinguishable from any other.
			const { data: session, error: sessionError } = await supabase
				.from("sessions")
				.insert({ user_id: auth.user.id, routine_id: routine.id })
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

/** Rewrites the order of exercises within a routine, optimistically. */
export function useReorderRoutineExercises() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (orderedIds: string[]) =>
			reorderPositions("routine_exercises", orderedIds),

		onMutate: async (orderedIds) => {
			await queryClient.cancelQueries({ queryKey: routinesKey });
			const previous = queryClient.getQueryData<Routine[]>(routinesKey);

			queryClient.setQueryData<Routine[]>(routinesKey, (current) =>
				current?.map((routine) => {
					const byId = new Map(
						routine.exercises.map((exercise) => [exercise.id, exercise]),
					);
					// Only the routine that owns these ids is affected.
					if (!orderedIds.every((id) => byId.has(id))) return routine;

					return {
						...routine,
						exercises: orderedIds.flatMap((id, position) => {
							const exercise = byId.get(id);
							return exercise ? [{ ...exercise, position }] : [];
						}),
					};
				}),
			);

			return { previous };
		},

		onError: (_error, _ids, context) => {
			queryClient.setQueryData(routinesKey, context?.previous);
		},

		onSettled: () => queryClient.invalidateQueries({ queryKey: routinesKey }),
	});
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The weekday index the app uses: 0 = Monday .. 6 = Sunday.
 *
 * `Date.getDay()` is Sunday-first, so every crossing of that boundary converts
 * here rather than inline, where the two conventions look identical and a
 * schedule silently lands a day off.
 */
export function weekdayOf(date: Date): number {
	return (date.getDay() + 6) % 7;
}

/** Sets which weekdays a routine is planned for. */
export function useSetRoutineWeekdays() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			id,
			weekdays,
		}: {
			id: string;
			weekdays: number[];
		}) => {
			const { error } = await supabase
				.from("routines")
				// Sorted and deduplicated before it leaves: the column's check
				// constraint rejects duplicates, and an unsorted array would make
				// two identical schedules compare unequal.
				.update({ weekdays: [...new Set(weekdays)].sort((a, b) => a - b) })
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}
