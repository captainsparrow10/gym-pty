import { supabase } from "./supabase";

/**
 * Rewrites the `position` column of an ordered list.
 *
 * Both `routine_exercises` and `logged_exercises` carry a unique constraint on
 * `(parent_id, position)`, so writing the new order directly collides the
 * moment two rows want a slot the other still holds. Every row is parked on a
 * negative position first — a range no real row uses — and then written to its
 * final value.
 *
 * The alternative, a Postgres function doing it in one transaction, would be
 * atomic. This is not: an interrupted reorder leaves rows parked on negatives
 * and the list reads in a scrambled order until it is reordered again. For a
 * handful of exercises in a personal app that is an acceptable trade against
 * keeping the ordering logic in one place the app can read.
 */
export async function reorderPositions(
	table: "routine_exercises" | "logged_exercises",
	orderedIds: string[],
): Promise<void> {
	// Park everything out of the way, keeping relative order so a failure here
	// is at least recoverable by eye.
	for (const [index, id] of orderedIds.entries()) {
		const { error } = await supabase
			.from(table)
			.update({ position: -(index + 1) })
			.eq("id", id);
		if (error) throw error;
	}

	for (const [index, id] of orderedIds.entries()) {
		const { error } = await supabase
			.from(table)
			.update({ position: index })
			.eq("id", id);
		if (error) throw error;
	}
}

/** Moves one item within an array, returning a new one. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
	const next = items.slice();
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}
