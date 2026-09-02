import { exercises } from "@gym/shared/catalog";
import { TYPE_LABELS } from "@/features/exercises/filter-sheet";

/**
 * The axes a ranking can be cut along.
 *
 * These are the catalogue's own facets, the same three the catalogue filter
 * offers, so "my chest ranking" and "chest in the catalogue" mean the same set
 * of exercises. Deriving them from `exercises` rather than listing them by
 * hand is what keeps that true when the catalogue is rebuilt — a new muscle or
 * a new piece of equipment appears here without anyone remembering to add it.
 */
export type Grouping = "exercise" | "muscle" | "equipment" | "type";

export const GROUPINGS: Grouping[] = [
	"exercise",
	"muscle",
	"equipment",
	"type",
];

export const GROUPING_LABELS: Record<Grouping, string> = {
	exercise: "Exercise",
	muscle: "Muscle",
	equipment: "Equipment",
	type: "Type",
};

export const GROUPING_HINTS: Record<Grouping, string> = {
	exercise: "Every movement you have logged.",
	muscle: "Grouped by the muscle each exercise trains first.",
	equipment: "Grouped by what you did it on.",
	type: "Grouped by how the exercise is logged.",
};

const BY_SLUG = new Map(exercises.map((exercise) => [exercise.slug, exercise]));

/**
 * Which bucket a slug falls into, for one grouping.
 *
 * An exercise that is not in the catalogue — a slug that outlived a rebuild,
 * or one written by a smoke script — still has to land somewhere, or its
 * training silently vanishes from a total it belongs in.
 */
export function bucketOf(slug: string, grouping: Grouping): string {
	const exercise = BY_SLUG.get(slug);
	if (!exercise) return grouping === "exercise" ? slug : "Unknown";

	switch (grouping) {
		case "exercise":
			return slug;
		case "muscle":
			return exercise.primaryMuscle;
		case "equipment":
			return exercise.equipment;
		case "type":
			return exercise.exerciseType;
	}
}

/** How a bucket reads. Only the machine-shaped type values need translating. */
export function bucketLabel(bucket: string, grouping: Grouping): string {
	if (grouping === "exercise") return BY_SLUG.get(bucket)?.name ?? bucket;
	if (grouping === "type") return TYPE_LABELS[bucket] ?? bucket;
	return bucket;
}

/**
 * Every catalogue slug in a bucket.
 *
 * This is what the community board is given, because Postgres stores a slug
 * and knows nothing about muscles or equipment. Deliberately the whole
 * catalogue rather than only what you have logged: the board ranks everyone,
 * and an exercise you have never touched still belongs to the category.
 */
export function slugsIn(bucket: string, grouping: Grouping): string[] {
	if (grouping === "exercise") return [bucket];
	return exercises
		.filter((exercise) => bucketOf(exercise.slug, grouping) === bucket)
		.map((exercise) => exercise.slug);
}

/** The catalogue's search param for a bucket, so a ranking row can link into it. */
export function catalogSearchFor(
	bucket: string,
	grouping: Grouping,
): { muscle?: string[]; equipment?: string[]; type?: string[] } {
	switch (grouping) {
		case "muscle":
			return { muscle: [bucket] };
		case "equipment":
			return { equipment: [bucket] };
		case "type":
			return { type: [bucket] };
		case "exercise":
			return {};
	}
}
