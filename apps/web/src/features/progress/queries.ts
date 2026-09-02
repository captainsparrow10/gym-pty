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
	warmup: boolean;
};

export function useHistory() {
	return useQuery({
		queryKey: ["progress", "history"] as const,
		queryFn: async (): Promise<HistorySet[]> => {
			const { data, error } = await supabase
				.from("sessions")
				.select(
					"date, logged_exercises(exercise_slug, sets(reps, weight_kg, warmup))",
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
						warmup: set.warmup,
					})),
				),
			);
		},
	});
}

/** ISO date of the Monday that starts the week containing `iso`. */
export function weekStart(iso: string): string {
	const [year, month, day] = iso.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	// getDay() is 0 for Sunday; shift so Monday starts the week.
	const offset = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - offset);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
		date.getDate(),
	).padStart(2, "0")}`;
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
	const today = new Date();
	const monday = new Date(weekStart(today.toISOString().slice(0, 10)));
	const series: WeeklyPoint[] = [];

	for (let i = weeks - 1; i >= 0; i--) {
		const date = new Date(monday);
		date.setDate(date.getDate() - i * 7);
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate(),
		).padStart(2, "0")}`;
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
