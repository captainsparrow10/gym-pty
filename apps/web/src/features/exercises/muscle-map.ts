import { MUSCLES } from "@gym/shared/catalog";
import type { Muscle } from "react-body-highlighter";

/**
 * Bridge between two independent muscle vocabularies.
 *
 * The catalog uses training language ("Lats", "Posterior Chain", "Core"); the
 * body model uses anatomical regions it can actually shade ("upper-back",
 * "gluteal", "abs"). Neither is a subset of the other, so the mapping is
 * explicit and lossy in places, which is documented per entry rather than
 * hidden behind a fuzzy match.
 *
 * The model has no separate latissimus region, so "Lats" and "Back" both shade
 * "upper-back". Clicking that region therefore filters on both, which is why
 * the catalog takes a list of muscles rather than one.
 */
const CATALOG_TO_BODY: Record<string, Muscle[]> = {
	Chest: ["chest"],
	Shoulders: ["front-deltoids"],
	"Rear Delts": ["back-deltoids"],
	Triceps: ["triceps"],
	Biceps: ["biceps"],
	Forearms: ["forearm"],
	Back: ["upper-back"],
	Lats: ["upper-back"],
	"Upper Back": ["upper-back", "trapezius"],
	"Lower Back": ["lower-back"],
	Core: ["abs", "obliques"],
	Quads: ["quadriceps"],
	Hamstrings: ["hamstring"],
	Glutes: ["gluteal"],
	Calves: ["calves"],
	Adductors: ["adductor"],
	Hips: ["abductors"],
	// Compound groupings that shade several regions at once.
	"Posterior Chain": ["hamstring", "gluteal", "lower-back"],
	Legs: ["quadriceps", "hamstring", "calves", "gluteal"],
	// Warm-ups and stretches are whole-body; shading everything would be noise.
	Mobility: [],
};

/** Body regions a catalog muscle should shade. */
export function bodyRegionsFor(catalogMuscle: string): Muscle[] {
	return CATALOG_TO_BODY[catalogMuscle] ?? [];
}

/**
 * Reverse index: which catalog muscles a body region stands for.
 * Built from the forward map so the two can never drift apart.
 */
const BODY_TO_CATALOG = new Map<Muscle, string[]>();
for (const catalogMuscle of MUSCLES) {
	for (const region of bodyRegionsFor(catalogMuscle)) {
		BODY_TO_CATALOG.set(region, [
			...(BODY_TO_CATALOG.get(region) ?? []),
			catalogMuscle,
		]);
	}
}

export function catalogMusclesFor(region: Muscle): string[] {
	return BODY_TO_CATALOG.get(region) ?? [];
}

/** Catalog muscles with no region on the model, so nothing is silently lost. */
export const UNMAPPED_MUSCLES = MUSCLES.filter(
	(m) => bodyRegionsFor(m).length === 0,
);
