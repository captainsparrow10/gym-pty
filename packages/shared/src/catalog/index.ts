import catalogEn from "./catalog.en.json" with { type: "json" };
import type { Catalog } from "./types.ts";

export type {
	Catalog,
	Exercise,
	ExerciseArt,
	ExerciseType,
	Locale,
	Mechanic,
	StepsProvenance,
} from "./types.ts";
export { ART_VIEW_BOX } from "./types.ts";

/**
 * The English catalog, produced by `scripts/build-catalog.ts` and committed.
 * 124 KB, so it ships in the bundle; the artwork does not.
 */
export const catalog = catalogEn as Catalog;
export const exercises = catalog.exercises;

/** Lowercase, strip accents and punctuation. Mirrors the build pipeline. */
export function normalizeSearch(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Distinct values of a field, sorted, for building filter chips. */
function distinct(pick: (e: Catalog["exercises"][number]) => string): string[] {
	return [...new Set(exercises.map(pick))].sort();
}

export const EQUIPMENT = distinct((e) => e.equipment);
export const MUSCLES = distinct((e) => e.primaryMuscle);
