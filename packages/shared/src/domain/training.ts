/**
 * Training calculations.
 *
 * Pure functions over plain data, with no dependency on React, the database or
 * the UI. This is the layer that survives if the app is ever rebuilt on a
 * different stack.
 */

export type LoggedSet = {
	/** Repetitions performed. Zero for duration-only work. */
	reps: number;
	/** Load in kilograms. Zero for unweighted bodyweight sets. */
	weightKg: number;
	/** Seconds held, for planks, hangs and other timed work. */
	seconds?: number;
	/** A set taken to failure or logged as a warm-up is excluded from PRs. */
	warmup?: boolean;
};

export type LoggedExercise = {
	slug: string;
	sets: LoggedSet[];
};

export type Session = {
	id: string;
	/** ISO date, `YYYY-MM-DD`. */
	date: string;
	durationSec: number;
	exercises: LoggedExercise[];
};

/** Load moved by a single set, in kilograms. */
export function setVolume(set: LoggedSet): number {
	return set.reps * set.weightKg;
}

export function exerciseVolume(exercise: LoggedExercise): number {
	return exercise.sets.reduce((total, set) => total + setVolume(set), 0);
}

export function sessionVolume(session: Session): number {
	return session.exercises.reduce((total, exercise) => total + exerciseVolume(exercise), 0);
}

export function sessionSetCount(session: Session): number {
	return session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}

/**
 * Estimated one-rep max, Epley formula: `w x (1 + reps / 30)`.
 *
 * Epley is the common choice for the 1-10 rep range most logging falls in. It
 * drifts high past roughly 12 reps, so treat high-rep estimates as indicative.
 * A single rep returns the load itself, which is the true 1RM rather than an
 * estimate.
 */
export function estimatedOneRepMax(set: LoggedSet): number {
	if (set.reps <= 0 || set.weightKg <= 0) return 0;
	if (set.reps === 1) return set.weightKg;
	return set.weightKg * (1 + set.reps / 30);
}

/** Heaviest load in a set list, ignoring warm-ups. */
export function topWeight(sets: LoggedSet[]): number {
	return sets.reduce((best, set) => (set.warmup ? best : Math.max(best, set.weightKg)), 0);
}

/** Best estimated 1RM across a set list, ignoring warm-ups. */
export function bestOneRepMax(sets: LoggedSet[]): number {
	return sets.reduce(
		(best, set) => (set.warmup ? best : Math.max(best, estimatedOneRepMax(set))),
		0,
	);
}

/**
 * Formats a load for display: no trailing zeros, at most one decimal.
 * 52.5 stays "52.5", 60.0 becomes "60".
 */
export function formatKg(value: number): string {
	return Number.parseFloat(value.toFixed(1)).toString();
}

/**
 * Formats an axis tick.
 *
 * Recharts derives ticks by dividing a `["dataMin - n", "dataMax + n"]` domain,
 * which produces values like 133.33333333333331. Rendered into a 40px axis the
 * label is clipped from the left and reads as "333334" — a number that is not
 * on the chart and cannot be reached by any weight.
 */
export function formatTick(value: number): string {
	return Math.round(value).toLocaleString("en");
}

/** Formats seconds as `m:ss`, used by the rest timer. */
export function formatDuration(totalSeconds: number): string {
	const safe = Math.max(0, Math.round(totalSeconds));
	const minutes = Math.floor(safe / 60);
	return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Estimates
//
// Everything below is an estimate and is named so. They are useful for
// comparing one session against another; they are not measurements, and the
// UI has to say which is which. A number that looks measured but is inferred
// is worse than no number.
// ---------------------------------------------------------------------------

/** Seconds a working set takes, before rest. */
const SECONDS_PER_SET = 40;

/**
 * How long a plan should take, in seconds.
 *
 * Sets times the time a set takes, plus the rest after each one but the last —
 * you do not rest after the final set, you leave.
 *
 * `SECONDS_PER_SET` is a flat 40. Real time under load is roughly three
 * seconds a rep, but a plan often does not say how many reps, and the error
 * from guessing reps is larger than the error from a flat average. When an
 * exercise names its reps this could be refined; until then a single honest
 * constant beats a formula that looks precise.
 */
export function estimatedDurationSec(
	items: { sets: number | null; restSeconds: number | null }[],
	defaultRestSeconds: number,
	defaultSets = 3,
): number {
	return items.reduce((total, item) => {
		const sets = item.sets ?? defaultSets;
		const rest = item.restSeconds ?? defaultRestSeconds;
		return total + sets * SECONDS_PER_SET + Math.max(0, sets - 1) * rest;
	}, 0);
}

/**
 * Rough energy cost of a session, in kilocalories.
 *
 * `MET x bodyweight(kg) x hours`, the standard estimate. Resistance training
 * sits at a MET of about 5 for vigorous effort and 3.5 for moderate; 4.5 is
 * the middle of that and the honest resolution of this method — the same
 * session done with long rests and short ones burns different amounts and this
 * cannot tell them apart.
 *
 * Deliberately not adjusted by volume or load. Doing so would produce a number
 * that changes with the weight on the bar and still has no more claim to being
 * right, which is the worst of both: it would look responsive and be no more
 * accurate. Treat it as a way to compare a long session with a short one.
 */
const RESISTANCE_MET = 4.5;

export function estimatedCalories(
	durationSec: number,
	bodyweightKg: number,
): number {
	if (durationSec <= 0 || bodyweightKg <= 0) return 0;
	return Math.round(RESISTANCE_MET * bodyweightKg * (durationSec / 3600));
}

/**
 * What to put on the bar next, from what you did last time.
 *
 * Double progression, which is what most linear programmes actually run:
 * you add reps inside a range at a fixed load, and only when the top of the
 * range is reached on every set does the load go up. Adding weight every
 * session is the beginner version and stops working within weeks; adding it
 * only when the reps are there keeps working for much longer.
 *
 * Returns null rather than a guess when there is nothing to go on — no
 * history, or unweighted work where there is no load to add. A suggestion the
 * app is not entitled to make is worse than no suggestion.
 *
 * The increment is the smallest jump the equipment allows, not a percentage:
 * gyms have 1.25 kg plates, and "add 2.5%" of 42.5 kg is a number you cannot
 * load.
 */
export type Progression = {
	/** What to do next: hold the load and chase reps, or add weight. */
	action: "add-reps" | "add-weight";
	weightKg: number;
	reps: number;
	/** How much heavier than last time. Zero while chasing reps. */
	incrementKg: number;
};

export function suggestProgression(
	lastSets: LoggedSet[],
	options: { minReps?: number; maxReps?: number; incrementKg?: number } = {},
): Progression | null {
	const working = lastSets.filter((set) => !set.warmup && set.reps > 0);
	if (working.length === 0) return null;

	const load = topWeight(working);
	// Unweighted work progresses by reps, sets or leverage, none of which this
	// function models. Saying nothing is the honest answer.
	if (load <= 0) return null;

	const { minReps = 6, maxReps = 10, incrementKg = 2.5 } = options;

	// Only the sets at the top load count. A back-off set at a lighter weight
	// is not evidence about whether the top set is ready to go up.
	const topSets = working.filter((set) => set.weightKg === load);
	const clearedTop = topSets.every((set) => set.reps >= maxReps);

	if (clearedTop) {
		return {
			action: "add-weight",
			weightKg: load + incrementKg,
			// Reps restart at the bottom of the range: the load is heavier, so the
			// reps that were there at the old weight will not be.
			reps: minReps,
			incrementKg,
		};
	}

	const lowest = Math.min(...topSets.map((set) => set.reps));
	return {
		action: "add-reps",
		weightKg: load,
		reps: Math.min(maxReps, lowest + 1),
		incrementKg: 0,
	};
}
