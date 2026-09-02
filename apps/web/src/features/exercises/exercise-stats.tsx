import { formatKg, formatTick } from "@gym/shared/domain";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Avatar } from "@/core/ui/avatar";
import {
	type LeaderboardWindow,
	useExerciseLeaderboard,
} from "@/features/leaderboard/queries";
import { useProfile } from "@/features/profile/queries";
import { exerciseHistory, useHistory } from "@/features/progress/queries";
import { cn } from "@/lib/utils";

const SHORT_DATE = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
});

function shortDate(iso: string) {
	// Parsed as local, not UTC: `new Date("2026-09-02")` is UTC midnight and
	// renders as the previous day anywhere west of Greenwich.
	const [year, month, day] = iso.split("-").map(Number);
	return SHORT_DATE.format(new Date(year, month - 1, day));
}

const CHART_CONFIG = {
	topWeightKg: { label: "Top set", color: "var(--color-primary)" },
	bestOneRmKg: { label: "Est. 1RM", color: "var(--color-muted-foreground)" },
} satisfies ChartConfig;

/**
 * What an exercise is actually measured in.
 *
 * Everything is stored in the same shape — reps, kilograms, seconds — but only
 * one of the three means anything for any given movement. Unweighted work is
 * stored at zero kilograms, so ranking a pull-up on load produces a column of
 * zeroes and an order decided by nothing. Deciding on the data rather than on
 * the catalogue's exercise type also covers a weighted pull-up, which is the
 * same slug the day someone straps a plate on.
 */
type Measure = "load" | "reps" | "time";

function measureOf(
	rows: { topWeightKg: number; topSeconds?: number }[],
): Measure {
	if (rows.some((row) => row.topWeightKg > 0)) return "load";
	if (rows.some((row) => (row.topSeconds ?? 0) > 0)) return "time";
	return "reps";
}

function Heading({ title, hint }: { title: string; hint?: string }) {
	return (
		<>
			<h2 className="mb-1 font-display text-lg font-semibold uppercase tracking-wide">
				{title}
			</h2>
			{hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
		</>
	);
}

/**
 * Your own record on one exercise: what you lifted, when, and the trend.
 *
 * Two lines rather than one. Estimated 1RM is the comparable number — it is
 * what makes 8 × 60 and 3 × 80 rankable against each other — but it is an
 * inference from a formula, and the load you actually put on the bar is not.
 * Plotting only the estimate would show progress on a day you never touched a
 * heavier weight; plotting only the load would call a set of eight and a
 * single at the same weight identical days.
 */
export function YourHistory({ slug }: { slug: string }) {
	const { data: history, isPending } = useHistory();
	const days = useMemo(
		() => (history ? exerciseHistory(history, slug) : []),
		[history, slug],
	);

	if (isPending) {
		return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
	}

	if (days.length === 0) {
		return (
			<section>
				<Heading title="Your history" />
				<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
					You have not logged this exercise yet.
				</p>
			</section>
		);
	}

	const measure = measureOf(days);
	const best =
		measure === "load"
			? days.reduce((a, b) => (b.topWeightKg > a.topWeightKg ? b : a))
			: measure === "time"
				? days.reduce((a, b) => (b.topSeconds > a.topSeconds ? b : a))
				: days.reduce((a, b) => (b.reps > a.reps ? b : a));
	const bestOneRm = Math.max(...days.map((day) => day.bestOneRmKg));
	const bestReps = Math.max(...days.map((day) => day.topSet?.reps ?? 0));
	const totalSets = days.reduce((total, day) => total + day.sets, 0);
	// Newest first: the last time you did it is the number you came here for.
	const recent = [...days].reverse();

	return (
		<section>
			<Heading title="Your history" />

			<dl className="mb-4 grid grid-cols-3 gap-2">
				{measure === "load" ? (
					<>
						<Stat label="Best set" value={`${formatKg(best.topWeightKg)} kg`} />
						<Stat label="Est. 1RM" value={`${formatKg(bestOneRm)} kg`} />
					</>
				) : measure === "time" ? (
					<>
						<Stat
							label="Longest hold"
							value={`${Math.max(...days.map((day) => day.topSeconds))}s`}
						/>
						<Stat label="Sets" value={`${totalSets}`} />
					</>
				) : (
					<>
						<Stat label="Best set" value={`${bestReps} reps`} />
						<Stat
							label="Total reps"
							value={days
								.reduce((total, day) => total + day.reps, 0)
								.toLocaleString("en")}
						/>
					</>
				)}
				<Stat label="Sessions" value={`${days.length}`} />
			</dl>

			{/*
			 * A single point is not a trend, and a two-point line reads as one
			 * whether the gap is a kilo or fifty. Below three days the list alone
			 * says more than a chart would.
			 */}
			{days.length >= 3 && measure === "load" && (
				<ChartContainer config={CHART_CONFIG} className="mb-4 h-44 w-full">
					<LineChart data={days} margin={{ left: 4, right: 8 }}>
						<CartesianGrid vertical={false} strokeOpacity={0.2} />
						<XAxis
							dataKey="date"
							tickFormatter={shortDate}
							tickLine={false}
							axisLine={false}
							interval="preserveStartEnd"
							minTickGap={24}
						/>
						<YAxis
							width={40}
							tickLine={false}
							axisLine={false}
							domain={["dataMin - 5", "dataMax + 5"]}
							tickFormatter={formatTick}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(label) => shortDate(String(label))}
									formatter={(value) => `${formatKg(Number(value))} kg`}
								/>
							}
						/>
						<Line
							dataKey="bestOneRmKg"
							stroke="var(--color-bestOneRmKg)"
							strokeWidth={2}
							strokeDasharray="4 3"
							dot={false}
						/>
						<Line
							dataKey="topWeightKg"
							stroke="var(--color-topWeightKg)"
							strokeWidth={2}
							dot={{ r: 3 }}
						/>
					</LineChart>
				</ChartContainer>
			)}

			<ol className="space-y-2">
				{recent.slice(0, 8).map((day) => (
					<li
						key={day.date}
						className={cn(
							"flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm",
							day.date === best.date && "border-primary/60",
						)}
					>
						<span className="w-16 shrink-0 tabular-nums text-muted-foreground">
							{shortDate(day.date)}
						</span>
						<span className="min-w-0 flex-1 truncate font-medium tabular-nums">
							{measure === "time"
								? `${day.topSeconds}s`
								: !day.topSet
									? "—"
									: measure === "load"
										? `${day.topSet.reps} × ${formatKg(day.topSet.weightKg)} kg`
										: `${day.topSet.reps} reps`}
						</span>
						<span className="shrink-0 tabular-nums text-muted-foreground">
							{day.sets} sets
							{measure === "load"
								? ` · ${formatKg(day.volumeKg)} kg`
								: measure === "reps"
									? ` · ${day.reps} reps`
									: ""}
						</span>
					</li>
				))}
			</ol>

			{recent.length > 8 && (
				<p className="mt-2 text-center text-xs text-muted-foreground">
					Showing the last 8 of {recent.length} sessions.
				</p>
			)}
		</section>
	);
}

/**
 * How everyone else does this exercise.
 *
 * Ranked on estimated 1RM, not on load. Two people with 100 kg on the bar are
 * not doing the same thing if one did a single and the other did eight, and
 * ranking on weight alone would call them equal.
 *
 * For a movement nobody loads there is no 1RM to rank on — unweighted work is
 * stored at zero kilograms — so the board switches to total reps, or to the
 * longest hold for timed work. The order comes from SQL either way; this only
 * decides which number to show.
 *
 * Only public profiles appear, and the data comes from a security definer
 * function that returns aggregates and nothing else — see
 * `supabase/migrations/20260902090000_exercise_leaderboard.sql`. Nothing here
 * can reach another person's individual sets.
 */
export function CommunityRanking({
	slug,
	window = "all",
}: {
	slug: string;
	window?: LeaderboardWindow;
}) {
	const { data: entries, isPending } = useExerciseLeaderboard(slug, window);
	const { data: profile } = useProfile();
	const measure = measureOf(entries ?? []);

	if (isPending) {
		return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
	}

	if (!entries || entries.length === 0) {
		return (
			<section>
				<Heading title="How others do it" />
				<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
					Nobody with a public profile has logged this exercise yet.
				</p>
			</section>
		);
	}

	return (
		<section>
			<Heading
				title="How others do it"
				hint={`Public profiles, ranked by ${
					measure === "load"
						? "estimated 1RM"
						: measure === "time"
							? "longest hold"
							: "total reps"
				}.`}
			/>

			<ol className="space-y-2">
				{entries.slice(0, 10).map((entry, index) => {
					const isMe = entry.userId === profile?.id;
					return (
						<li
							key={entry.userId}
							className={cn(
								"flex items-center gap-3 rounded-lg border bg-card p-2 pr-3",
								isMe && "border-primary bg-primary/5",
							)}
						>
							<span
								className="w-6 shrink-0 text-center font-display font-bold tabular-nums text-muted-foreground"
								aria-hidden
							>
								{index + 1}
							</span>
							<Avatar
								icon={entry.avatarIcon}
								color={entry.avatarColor}
								size="sm"
							/>
							<span className="min-w-0 flex-1">
								<span className="flex items-center gap-2 truncate text-sm font-medium">
									{entry.displayName ?? "Anonymous"}
									{isMe && (
										<span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase text-primary-foreground">
											You
										</span>
									)}
								</span>
								<span className="block truncate text-xs tabular-nums text-muted-foreground">
									{measure === "load"
										? `Best set ${formatKg(entry.topWeightKg)} kg`
										: `${entry.sessions} sessions`}{" "}
									· {entry.sets} sets
								</span>
							</span>
							<span className="shrink-0 text-right text-sm font-medium tabular-nums">
								{measure === "load"
									? `${formatKg(entry.bestOneRmKg)} kg`
									: measure === "time"
										? `${entry.topSeconds}s`
										: `${entry.reps.toLocaleString("en")} reps`}
							</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border bg-card px-3 py-2">
			<dt className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd className="font-display text-lg font-semibold tabular-nums">
				{value}
			</dd>
		</div>
	);
}
