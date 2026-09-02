import { bestOneRepMax, type LoggedSet } from "@gym/shared/domain";
import type { HistorySet } from "./queries";

/**
 * Rankings over the training history.
 *
 * "What do I do most, and how much am I moving" is a different question from
 * "am I getting stronger", which is what the charts answer. A ranking sorts
 * exercises against each other; a chart tracks one over time.
 *
 * Everything here is a pure function over the same flat set list the charts
 * use, so there is one query and one definition of every number.
 */

export type Window = "day" | "week" | "month" | "all";

export const WINDOW_LABELS: Record<Window, string> = {
	day: "Today",
	week: "This week",
	month: "This month",
	all: "All time",
};

/** ISO date, local, of the first day in the window. */
function windowStart(window: Window): string | null {
	if (window === "all") return null;

	const date = new Date();
	if (window === "week") {
		// Monday-first, matching the weekly volume chart.
		date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	} else if (window === "month") {
		date.setDate(1);
	}

	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate(),
	).padStart(2, "0")}`;
}

export function withinWindow(
	history: HistorySet[],
	window: Window,
): HistorySet[] {
	const start = windowStart(window);
	// Warm-ups are excluded everywhere: they inflate set counts and volume
	// without representing work.
	const working = history.filter((set) => !set.warmup);
	return start ? working.filter((set) => set.date >= start) : working;
}

export type ExerciseRank = {
	/** The slug when ranking exercises, otherwise the category's own name. */
	slug: string;
	/** Distinct exercises behind this row. One, unless the row is a category. */
	exercises: number;
	/** Distinct days this exercise was trained. */
	sessions: number;
	sets: number;
	reps: number;
	volumeKg: number;
	topWeightKg: number;
	bestOneRmKg: number;
	lastDate: string | null;
};

/**
 * Ranks the history by whatever key the caller groups on.
 *
 * `rankExercises` is this with the identity key. The generalisation exists so
 * a muscle ranking and an exercise ranking are computed by the same code from
 * the same sets — two implementations of "volume" eventually disagree, and the
 * category totals have to add up to the exercise totals or the page is lying.
 *
 * `topWeightKg` and `bestOneRmKg` stay the max over the group. For a category
 * that means the heaviest thing you did anywhere in it, which is the only
 * reading of "heaviest load for Legs" that means anything.
 */
export function rankBy(
	history: HistorySet[],
	keyOf: (set: HistorySet) => string,
): ExerciseRank[] {
	const groups = new Map<
		string,
		{ sets: LoggedSet[]; dates: Set<string>; slugs: Set<string> }
	>();

	for (const set of history) {
		const key = keyOf(set);
		const entry = groups.get(key) ?? {
			sets: [],
			dates: new Set<string>(),
			slugs: new Set<string>(),
		};
		entry.sets.push({ reps: set.reps, weightKg: set.weightKg });
		entry.dates.add(set.date);
		entry.slugs.add(set.slug);
		groups.set(key, entry);
	}

	return [...groups.entries()].map(([slug, entry]) => ({
		slug,
		exercises: entry.slugs.size,
		sessions: entry.dates.size,
		sets: entry.sets.length,
		reps: entry.sets.reduce((total, set) => total + set.reps, 0),
		volumeKg: entry.sets.reduce(
			(total, set) => total + set.reps * set.weightKg,
			0,
		),
		topWeightKg: entry.sets.reduce(
			(best, set) => Math.max(best, set.weightKg),
			0,
		),
		bestOneRmKg: bestOneRepMax(entry.sets),
		lastDate: [...entry.dates].sort().at(-1) ?? null,
	}));
}

export function rankExercises(history: HistorySet[]): ExerciseRank[] {
	return rankBy(history, (set) => set.slug);
}

export type RankMetric =
	| "sessions"
	| "volumeKg"
	| "sets"
	| "topWeightKg"
	| "bestOneRmKg";

export const METRIC_LABELS: Record<RankMetric, string> = {
	sessions: "Most trained",
	volumeKg: "Most volume",
	sets: "Most sets",
	topWeightKg: "Heaviest load",
	bestOneRmKg: "Best est. 1RM",
};

export const METRIC_HINTS: Record<RankMetric, string> = {
	sessions: "Days you trained it",
	volumeKg: "Reps times load, added up",
	sets: "Working sets, warm-ups excluded",
	topWeightKg: "Heaviest single set",
	bestOneRmKg: "Epley, from your best set",
};

export function sortByMetric(
	ranks: ExerciseRank[],
	metric: RankMetric,
): ExerciseRank[] {
	return (
		ranks
			.filter((rank) => rank[metric] > 0)
			// Ties broken by volume, so two exercises trained the same number of
			// days are not ordered arbitrarily.
			.sort((a, b) => b[metric] - a[metric] || b.volumeKg - a.volumeKg)
	);
}

export type Totals = {
	sessions: number;
	sets: number;
	reps: number;
	volumeKg: number;
	exercises: number;
};

export function totals(history: HistorySet[]): Totals {
	return {
		sessions: new Set(history.map((set) => set.date)).size,
		sets: history.length,
		reps: history.reduce((total, set) => total + set.reps, 0),
		volumeKg: history.reduce(
			(total, set) => total + set.reps * set.weightKg,
			0,
		),
		exercises: new Set(history.map((set) => set.slug)).size,
	};
}

export type PersonalRecord = {
	slug: string;
	weightKg: number;
	reps: number;
	date: string;
};

/**
 * Heaviest set ever recorded per exercise.
 *
 * Ties go to the higher rep count: eight reps at 100 kg beats five at the same
 * load, and is the more recent achievement worth showing.
 */
export function personalRecords(history: HistorySet[]): PersonalRecord[] {
	const best = new Map<string, PersonalRecord>();

	for (const set of history) {
		if (set.weightKg <= 0) continue;
		const current = best.get(set.slug);
		const better =
			!current ||
			set.weightKg > current.weightKg ||
			(set.weightKg === current.weightKg && set.reps > current.reps);

		if (better) {
			best.set(set.slug, {
				slug: set.slug,
				weightKg: set.weightKg,
				reps: set.reps,
				date: set.date,
			});
		}
	}

	return [...best.values()].sort((a, b) => b.weightKg - a.weightKg);
}
