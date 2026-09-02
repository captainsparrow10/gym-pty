import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TablesUpdate } from "@/core/api/database.types";
import { supabase } from "@/core/api/supabase";

/**
 * One planned set.
 *
 * A routine exercise and an exercise planned for a date want exactly the same
 * thing, so they share one table and this one type. Everything except the
 * position is optional: "three sets, whatever feels right" is a real plan, and
 * so is "8 at 60, 6 at 70, 4 at 80".
 */
export type SetTarget = {
	id: string;
	position: number;
	reps: number | null;
	weightKg: number | null;
	restSeconds: number | null;
	warmup: boolean;
};

/** The columns, in the order the editor shows them. */
export const SET_TARGET_COLUMNS =
	"id, position, reps, weight_kg, rest_seconds, warmup" as const;

type Row = {
	id: string;
	position: number;
	reps: number | null;
	weight_kg: number | string | null;
	rest_seconds: number | null;
	warmup: boolean;
};

export function toSetTargets(rows: Row[] | null | undefined): SetTarget[] {
	return (rows ?? [])
		.map((row) => ({
			id: row.id,
			position: row.position,
			reps: row.reps,
			// `numeric` arrives from PostgREST as a string.
			weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
			restSeconds: row.rest_seconds,
			warmup: row.warmup,
		}))
		.sort((a, b) => a.position - b.position);
}

/** Which parent a set belongs to. Exactly one, enforced by the table. */
export type SetParent =
	| { routineExerciseId: string }
	| { plannedExerciseId: string };

const parentColumns = (parent: SetParent) =>
	"routineExerciseId" in parent
		? { routine_exercise_id: parent.routineExerciseId }
		: { planned_exercise_id: parent.plannedExerciseId };

/**
 * Both parents invalidate together.
 *
 * A set target is always read through its parent — a routine or a day — never
 * on its own, so there is no cache entry of its own to update. Invalidating
 * both is one extra refetch of something already in memory, and it is what
 * keeps a set edited on the day plan from going stale in the routine that
 * shares the screen.
 */
function useRefresh() {
	const client = useQueryClient();
	return () => {
		client.invalidateQueries({ queryKey: ["routines"] });
		client.invalidateQueries({ queryKey: ["plan"] });
	};
}

export function useAddSetTarget() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			parent,
			position,
			copyFrom,
		}: {
			parent: SetParent;
			position: number;
			/** The set to duplicate, so adding a fourth set of eight is one tap. */
			copyFrom?: SetTarget;
		}) => {
			const { error } = await supabase.from("set_targets").insert({
				...parentColumns(parent),
				position,
				reps: copyFrom?.reps ?? null,
				weight_kg: copyFrom?.weightKg ?? null,
				rest_seconds: copyFrom?.restSeconds ?? null,
				warmup: copyFrom?.warmup ?? false,
			});
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useUpdateSetTarget() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			id,
			...values
		}: {
			id: string;
			reps?: number | null;
			weightKg?: number | null;
			restSeconds?: number | null;
			warmup?: boolean;
		}) => {
			const patch: TablesUpdate<"set_targets"> = {};
			if ("reps" in values) patch.reps = values.reps;
			if ("weightKg" in values) patch.weight_kg = values.weightKg;
			if ("restSeconds" in values) patch.rest_seconds = values.restSeconds;
			if ("warmup" in values) patch.warmup = values.warmup;

			const { error } = await supabase
				.from("set_targets")
				.update(patch)
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export function useRemoveSetTarget() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("set_targets")
				.delete()
				.eq("id", id);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

/**
 * Replaces every set of one exercise with `count` copies of the same target.
 *
 * The shorthand for the common case: most plans are "4 x 8 at 80" and typing
 * four identical rows to say so would be worse than what this replaced. The
 * rows are still individually editable afterwards, which is the whole point —
 * this writes the starting shape, it is not a second representation of it.
 */
export function useSetUniformTargets() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			parent,
			existing,
			count,
			reps,
			weightKg,
		}: {
			parent: SetParent;
			existing: SetTarget[];
			count: number;
			reps: number | null;
			weightKg: number | null;
		}) => {
			const column =
				"routineExerciseId" in parent
					? "routine_exercise_id"
					: "planned_exercise_id";
			const parentId =
				"routineExerciseId" in parent
					? parent.routineExerciseId
					: parent.plannedExerciseId;

			// Deleted first, in one statement, then reinserted. The unique index on
			// (parent, position) is deferrable, so both halves land in the same
			// transaction without colliding on a position that is briefly taken
			// twice.
			if (existing.length > 0) {
				const { error } = await supabase
					.from("set_targets")
					.delete()
					.eq(column, parentId);
				if (error) throw error;
			}

			if (count <= 0) return;

			const { error } = await supabase.from("set_targets").insert(
				Array.from({ length: count }, (_, index) => ({
					...parentColumns(parent),
					position: index,
					reps,
					weight_kg: weightKg,
					// Rest and warm-up are per-set decisions the shorthand does not
					// make; they start empty and are set on the rows.
					rest_seconds: null,
					warmup: false,
				})),
			);
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}
