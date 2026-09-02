import { bestOneRepMax, type LoggedSet } from "@gym/shared/domain";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/core/api/supabase";

/**
 * Every finished set, flat, with its date and exercise.
 *
 * One query feeds all the charts. The alternative — an aggregate query per
 * chart — would put the definition of "volume" in Postgres alongside the one
 * already in `@gym/shared/domain`, and two definitions of the same number
 * eventually disagree. A personal history is small enough that summing in the
 * client is free.
 */
export type HistorySet = {
	date: string;
	slug: string;
	reps: number;
	weightKg: number;
	/** Timed work — a plank, a hang — where reps and load are both zero. */
	seconds: number | null;
	warmup: boolean;
};

export function useHistory() {
	return useQuery({
		queryKey: ["progress", "history"] as const,
		queryFn: async (): Promise<HistorySet[]> => {
			const { data, error } = await supabase
				.from("sessions")
				.select(
					"date, logged_exercises(exercise_slug, sets(reps, weight_kg, seconds, warmup))",
				)
				.not("finished_at", "is", null)
				.order("date", { ascending: true });

			if (error) throw error;

			return (data ?? []).flatMap((session) =>
				(session.logged_exercises ?? []).flatMap((exercise) =>
					(exercise.sets ?? []).map((set) => ({
						date: session.date,
						slug: exercise.exercise_slug,
						reps: set.reps,
						weightKg: Number(set.weight_kg),
						seconds: set.seconds,
						warmup: set.warmup,
					})),
				),
			);
		},
	});
}

/**
 * Dates in this app are calendar days, not instants.
 *
 * A session dated 2026-08-31 happened on the 31st wherever you were; it has no
 * time zone. Both directions of the conversion have a trap, and both were hit:
 *
 *   `new Date("2026-08-31")`   parses as UTC midnight, which reads back as the
 *                              30th anywhere west of Greenwich.
 *   `date.toISOString()`       converts to UTC, so an evening in Panama is
 *                              already tomorrow.
 *
 * These two do it in local terms, and every calendar calculation goes through
 * them rather than through the `Date` string constructor.
 */
export function parseIso(iso: string): Date {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day);
}

export function toIso(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate(),
	).padStart(2, "0")}`;
}

/** ISO date of the Monday that starts the week containing `iso`. */
export function weekStart(iso: string): string {
	const date = parseIso(iso);
	// getDay() is 0 for Sunday; shift so Monday starts the week.
	const offset = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - offset);
	return toIso(date);
}

export type WeeklyPoint = {
	week: string;
	volumeKg: number;
	sets: number;
};

/** Volume and set count per week, oldest first, gaps included as zero. */
export function weeklyVolume(history: HistorySet[], weeks = 12): WeeklyPoint[] {
	const totals = new Map<string, WeeklyPoint>();

	for (const set of history) {
		if (set.warmup) continue;
		const week = weekStart(set.date);
		const point = totals.get(week) ?? { week, volumeKg: 0, sets: 0 };
		point.volumeKg += set.reps * set.weightKg;
		point.sets += 1;
		totals.set(week, point);
	}

	// A missing week is a real signal — it means nothing was trained — so the
	// series is built from a continuous range rather than only from the weeks
	// that happen to have data.
	// Built through `toIso`/`parseIso`, not through `new Date(string)` and
	// `toISOString()`. Those two shifted every key one day back, so the series
	// asked for Sundays while the totals were filed under Mondays: every lookup
	// missed and the whole chart read zero. It was invisible with a couple of
	// weeks of data, where one empty bar looks like a week off.
	const monday = parseIso(weekStart(toIso(new Date())));
	const series: WeeklyPoint[] = [];

	for (let i = weeks - 1; i >= 0; i--) {
		const date = new Date(monday);
		date.setDate(date.getDate() - i * 7);
		const key = toIso(date);
		series.push(totals.get(key) ?? { week: key, volumeKg: 0, sets: 0 });
	}

	return series;
}

export type MuscleShare = {
	muscle: string;
	sets: number;
};

/** Working sets per primary muscle, for spotting what is being neglected. */
export function setsPerMuscle(
	history: HistorySet[],
	primaryMuscleOf: (slug: string) => string | undefined,
): MuscleShare[] {
	const totals = new Map<string, number>();

	for (const set of history) {
		if (set.warmup) continue;
		const muscle = primaryMuscleOf(set.slug);
		if (!muscle) continue;
		totals.set(muscle, (totals.get(muscle) ?? 0) + 1);
	}

	return [...totals.entries()]
		.map(([muscle, sets]) => ({ muscle, sets }))
		.sort((a, b) => b.sets - a.sets);
}

export type StrengthPoint = {
	date: string;
	oneRmKg: number;
};

/** Best estimated 1RM per training day for one exercise. */
export function strengthOverTime(
	history: HistorySet[],
	slug: string,
): StrengthPoint[] {
	const byDate = new Map<string, LoggedSet[]>();

	for (const set of history) {
		if (set.slug !== slug || set.warmup) continue;
		const sets = byDate.get(set.date) ?? [];
		sets.push({ reps: set.reps, weightKg: set.weightKg });
		byDate.set(set.date, sets);
	}

	return [...byDate.entries()]
		.map(([date, sets]) => ({ date, oneRmKg: bestOneRepMax(sets) }))
		.filter((point) => point.oneRmKg > 0)
		.sort((a, b) => a.date.localeCompare(b.date));
}

/** Exercises with enough history to plot, most-trained first. */
export function trackableExercises(history: HistorySet[]): string[] {
	const days = new Map<string, Set<string>>();

	for (const set of history) {
		if (set.warmup || set.weightKg <= 0) continue;
		const dates = days.get(set.slug) ?? new Set<string>();
		dates.add(set.date);
		days.set(set.slug, dates);
	}

	return [...days.entries()]
		.filter(([, dates]) => dates.size >= 2)
		.sort((a, b) => b[1].size - a[1].size)
		.map(([slug]) => slug);
}

export type ExerciseDay = {
	date: string;
	sets: number;
	reps: number;
	volumeKg: number;
	topWeightKg: number;
	bestOneRmKg: number;
	topSeconds: number;
	/** The heaviest set of the day, which is what you actually remember doing. */
	topSet: { reps: number; weightKg: number } | null;
};

/**
 * One exercise, one row per training day, newest last.
 *
 * `strengthOverTime` already returns estimated 1RM per day for the chart. This
 * keeps the load and the set that produced it as well, because a 1RM is an
 * inference and "8 × 60" is what happened.
 *
 * Warm-ups are excluded, as everywhere else, so a light first set cannot show
 * up as a bad day.
 */
export function exerciseHistory(
	history: HistorySet[],
	slug: string,
): ExerciseDay[] {
	const byDate = new Map<string, HistorySet[]>();

	for (const set of history) {
		if (set.slug !== slug || set.warmup) continue;
		byDate.set(set.date, [...(byDate.get(set.date) ?? []), set]);
	}

	return [...byDate.entries()]
		.map(([date, sets]) => {
			const working: LoggedSet[] = sets.map((set) => ({
				reps: set.reps,
				weightKg: set.weightKg,
			}));
			// Heaviest first, and on a tie the one with more reps — the harder of
			// two sets at the same load.
			const [topSet] = [...sets].sort(
				(a, b) => b.weightKg - a.weightKg || b.reps - a.reps,
			);

			return {
				date,
				sets: sets.length,
				reps: sets.reduce((total, set) => total + set.reps, 0),
				volumeKg: sets.reduce(
					(total, set) => total + set.reps * set.weightKg,
					0,
				),
				topWeightKg: Math.max(...sets.map((set) => set.weightKg)),
				topSeconds: Math.max(0, ...sets.map((set) => set.seconds ?? 0)),
				bestOneRmKg: bestOneRepMax(working),
				topSet: topSet
					? { reps: topSet.reps, weightKg: topSet.weightKg }
					: null,
			};
		})
		.sort((a, b) => a.date.localeCompare(b.date));
}
