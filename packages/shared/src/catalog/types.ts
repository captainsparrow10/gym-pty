/**
 * Catalog types.
 *
 * The catalog is a build artifact produced by `scripts/build-catalog.ts` and
 * committed to the repository. It is never assembled at runtime.
 */

/** How a set is logged. Drives which inputs the session screen shows. */
export type ExerciseType =
	| "weight_reps"
	| "bodyweight_reps"
	| "duration"
	| "distance_duration"
	| "assisted_bodyweight";

/** Mechanical classification, from everkinetic where available. */
export type Mechanic = "compound" | "isolation" | "isometric";

export type Locale = "en" | "es";

/** Where an exercise's step-by-step instructions came from. */
export type StepsProvenance =
	| "everkinetic-id" // joined on the everkinetic id embedded in the frame attribution
	| "everkinetic-name" // joined on a normalized name match
	| "generated"; // written by Gemini in the build pipeline

export type Exercise = {
	slug: string;
	name: string;
	exerciseType: ExerciseType;
	/** Display label, e.g. "Barbell", "Bodyweight", "Cable". */
	equipment: string;
	primaryMuscle: string;
	secondaryMuscles: string[];
	isStretch: boolean;
	mechanic?: Mechanic;
	steps: string[];
	stepsFrom: StepsProvenance;
	/** everkinetic source id (4 digits) when one was matched. */
	everkineticId?: string;
};

export type Catalog = {
	locale: Locale;
	/** ISO date the artifact was generated. */
	generatedAt: string;
	exercises: Exercise[];
};

/**
 * Frame path data for one exercise, served from `/art/<slug>.json`.
 * Each entry is the `d` attribute of a single SVG path on a 512x512 viewBox.
 */
export type ExerciseArt = {
	slug: string;
	viewBox: string;
	frames: string[];
};

export const ART_VIEW_BOX = "0 0 512 512";
