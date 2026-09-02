import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TablesInsert } from "@/core/api/database.types";
import { supabase } from "@/core/api/supabase";
import { toIso } from "@/features/progress/queries";

/**
 * The measurements the app tracks, in the order a tape measure goes down a
 * body. The order is the form's order, so it reads as a sequence rather than
 * as an alphabetised list of columns.
 */
export const MEASUREMENTS = [
	{ key: "bodyFatPct", column: "body_fat_pct", label: "Body fat", unit: "%" },
	{ key: "neckCm", column: "neck_cm", label: "Neck", unit: "cm" },
	{
		key: "shouldersCm",
		column: "shoulders_cm",
		label: "Shoulders",
		unit: "cm",
	},
	{ key: "chestCm", column: "chest_cm", label: "Chest", unit: "cm" },
	{ key: "waistCm", column: "waist_cm", label: "Waist", unit: "cm" },
	{ key: "hipsCm", column: "hips_cm", label: "Hips", unit: "cm" },
	{ key: "leftArmCm", column: "left_arm_cm", label: "Arm (L)", unit: "cm" },
	{ key: "rightArmCm", column: "right_arm_cm", label: "Arm (R)", unit: "cm" },
	{
		key: "leftForearmCm",
		column: "left_forearm_cm",
		label: "Forearm (L)",
		unit: "cm",
	},
	{
		key: "rightForearmCm",
		column: "right_forearm_cm",
		label: "Forearm (R)",
		unit: "cm",
	},
	{
		key: "leftThighCm",
		column: "left_thigh_cm",
		label: "Thigh (L)",
		unit: "cm",
	},
	{
		key: "rightThighCm",
		column: "right_thigh_cm",
		label: "Thigh (R)",
		unit: "cm",
	},
	{ key: "leftCalfCm", column: "left_calf_cm", label: "Calf (L)", unit: "cm" },
	{
		key: "rightCalfCm",
		column: "right_calf_cm",
		label: "Calf (R)",
		unit: "cm",
	},
] as const;

export type MeasurementKey = (typeof MEASUREMENTS)[number]["key"];

export type Measurement = { date: string } & Partial<
	Record<MeasurementKey, number>
>;

const KEY = ["body"] as const;

function useRefresh() {
	const client = useQueryClient();
	return () => client.invalidateQueries({ queryKey: KEY });
}

/*
 * Written out rather than joined from MEASUREMENTS.
 *
 * The Supabase client parses the select string at the type level, so a
 * template literal degrades the whole row to an error type and every field
 * access below becomes a cast. Spelling it out costs one line of duplication
 * and buys a typed row — and if the two ever drift, the field loop below stops
 * compiling rather than silently returning undefined.
 */
const COLUMNS =
	"date, body_fat_pct, neck_cm, shoulders_cm, chest_cm, waist_cm, hips_cm, left_arm_cm, right_arm_cm, left_forearm_cm, right_forearm_cm, left_thigh_cm, right_thigh_cm, left_calf_cm, right_calf_cm" as const;

/** Every measurement session, oldest first, so a chart can plot it directly. */
export function useMeasurements() {
	return useQuery({
		queryKey: [...KEY, "all"] as const,
		queryFn: async (): Promise<Measurement[]> => {
			const { data, error } = await supabase
				.from("body_measurements")
				.select(COLUMNS)
				.order("date");

			if (error) throw error;

			return (data ?? []).map((row) => {
				const entry: Measurement = { date: row.date };
				for (const field of MEASUREMENTS) {
					// `numeric` comes back from PostgREST as a string, and a missing
					// measurement must stay missing rather than becoming 0 — a zero
					// waist would plot as a collapse rather than as a gap.
					const raw = row[field.column];
					if (raw !== null && raw !== undefined) {
						entry[field.key] = Number(raw);
					}
				}
				return entry;
			});
		},
	});
}

/**
 * Writes one day's measurements, replacing that day rather than appending.
 *
 * `(user_id, date)` is unique and this upserts on it, matching how weighing in
 * twice on the same morning behaves: the second reading is a correction, not a
 * second data point.
 */
export function useSaveMeasurements() {
	const refresh = useRefresh();

	return useMutation({
		mutationFn: async ({
			date,
			values,
		}: {
			date?: string;
			values: Partial<Record<MeasurementKey, number | null>>;
		}) => {
			const { data: auth } = await supabase.auth.getUser();
			if (!auth.user) throw new Error("Not signed in.");

			const row: TablesInsert<"body_measurements"> = {
				user_id: auth.user.id,
				date: date ?? toIso(new Date()),
			};
			for (const field of MEASUREMENTS) {
				if (field.key in values) {
					row[field.column] = values[field.key] ?? null;
				}
			}

			const { error } = await supabase
				.from("body_measurements")
				.upsert(row, { onConflict: "user_id,date" });
			if (error) throw error;
		},
		onSuccess: refresh,
	});
}

export type MeasurementTrend = {
	key: MeasurementKey;
	label: string;
	unit: string;
	latest: number;
	/** Change since the first reading. Null when there is only one. */
	change: number | null;
	first: string;
};

/**
 * Latest value and total change per measurement.
 *
 * Change against the first reading rather than the previous one: a tape
 * measure comes out every few weeks, and the difference between two adjacent
 * readings is mostly how tightly you pulled it. Over months it is signal.
 */
export function summarise(history: Measurement[]): MeasurementTrend[] {
	if (history.length === 0) return [];

	return MEASUREMENTS.flatMap((field) => {
		const readings = history.filter((entry) => entry[field.key] !== undefined);
		if (readings.length === 0) return [];

		const first = readings[0];
		const last = readings.at(-1) as Measurement;
		const latest = last[field.key] as number;
		const earliest = first[field.key] as number;

		return [
			{
				key: field.key,
				label: field.label,
				unit: field.unit,
				latest,
				change: readings.length > 1 ? latest - earliest : null,
				first: first.date,
			},
		];
	});
}

/**
 * The most recent weigh-in, in kilograms.
 *
 * Needed by the calorie estimate, which is `MET x bodyweight x hours` and is
 * meaningless without a mass. Returns null rather than a guess when nothing
 * has been logged: an invented 75 kg would produce a confident number about
 * somebody else.
 */
export function useLatestBodyweight() {
	return useQuery({
		queryKey: [...KEY, "bodyweight", "latest"] as const,
		queryFn: async (): Promise<number | null> => {
			const { data, error } = await supabase
				.from("bodyweight")
				.select("weight_kg")
				.order("date", { ascending: false })
				.limit(1)
				.maybeSingle();

			if (error) throw error;
			return data ? Number(data.weight_kg) : null;
		},
	});
}
