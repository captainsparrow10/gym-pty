import { supabase } from "./supabase";

/**
 * Rewrites the order of an exercise list, atomically.
 *
 * One round trip into a Postgres function, not a loop of updates from here.
 * The previous version parked every row on a negative position and then wrote
 * the final ones — six or more sequential requests for a single drag, during
 * which the rows really were at negative positions. Anything that refetched in
 * that window read a scrambled list, and an interrupted run left them parked
 * permanently.
 *
 * The unique constraints on `(parent, position)` are deferrable, so the
 * function renumbers everything in one statement with uniqueness checked at
 * commit. No intermediate state is ever visible.
 */
export async function reorderPositions(
	table: "routine_exercises" | "logged_exercises",
	orderedIds: string[],
): Promise<void> {
	const fn =
		table === "logged_exercises"
			? "reorder_logged_exercises"
			: "reorder_routine_exercises";

	const { error } = await supabase.rpc(fn, { p_ids: orderedIds });
	if (error) throw error;
}

/** Moves one item within an array, returning a new one. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
	const next = items.slice();
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}
