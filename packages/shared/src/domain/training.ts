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

/** Formats seconds as `m:ss`, used by the rest timer. */
export function formatDuration(totalSeconds: number): string {
	const safe = Math.max(0, Math.round(totalSeconds));
	const minutes = Math.floor(safe / 60);
	return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}
