import { formatKg } from "@gym/shared/domain";
import { Fragment, useMemo } from "react";
import {
	type HistorySet,
	parseIso,
	toIso,
	weekStart,
} from "@/features/progress/queries";
import { cn } from "@/lib/utils";

const MONTH = new Intl.DateTimeFormat("en", { month: "short" });
const FULL_DATE = new Intl.DateTimeFormat("en", {
	weekday: "long",
	month: "long",
	day: "numeric",
});

/** Monday-first, matching `weekStart` and the weekly volume chart. */
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

type Day = { iso: string; sets: number; volumeKg: number };

/**
 * Five steps of orange by volume, plus an untrained ground.
 *
 * Quantiles rather than fixed kilo thresholds. A fixed scale is calibrated to
 * one person: 20,000 kg is a heavy day for someone and a warm-up for someone
 * else, and either way most of the year lands in one bucket and the calendar
 * turns into a single flat colour. Ranking each day against your own year
 * keeps all five steps in use whatever the numbers are.
 */
function heatScale(volumes: number[]): (volume: number) => number {
	const sorted = volumes.filter((v) => v > 0).sort((a, b) => a - b);
	if (sorted.length === 0) return () => 0;

	const cuts = [0.2, 0.4, 0.6, 0.8].map(
		(q) => sorted[Math.floor(q * (sorted.length - 1))],
	);

	return (volume) => {
		if (volume <= 0) return 0;
		let level = 1;
		for (const cut of cuts) if (volume > cut) level++;
		return level;
	};
}

const HEAT = [
	"bg-muted/40",
	"bg-primary/25",
	"bg-primary/45",
	"bg-primary/65",
	"bg-primary/85",
	"bg-primary",
];

/**
 * A year of training days, one square each.
 *
 * The charts answer "how much" and "am I getting stronger". This answers
 * "did I show up", which neither of them can: a twelve-week bar chart hides
 * the three weeks off in March, and a line of estimated 1RM says nothing at
 * all about the days between its points.
 *
 * Laid out in columns of seven, Monday at the top, the way a year reads at a
 * glance — a gap is a visible hole rather than a number that failed to appear.
 */
export function TrainingCalendar({ history }: { history: HistorySet[] }) {
	const { weeks, months, days, total } = useMemo(() => {
		const byDate = new Map<string, Day>();

		for (const set of history) {
			if (set.warmup) continue;
			const day = byDate.get(set.date) ?? {
				iso: set.date,
				sets: 0,
				volumeKg: 0,
			};
			day.sets += 1;
			day.volumeKg += set.reps * set.weightKg;
			byDate.set(set.date, day);
		}

		// 53 Mondays back, so the grid always covers a full year and ends on the
		// week in progress. Built in local time — `new Date("2026-08-31")` is UTC
		// midnight and lands on the previous day west of Greenwich, which is the
		// bug that silently emptied the weekly volume chart.
		const lastMonday = parseIso(weekStart(toIso(new Date())));
		const columns: Day[][] = [];
		const labels: { index: number; text: string }[] = [];
		let previousMonth = -1;

		for (let w = 52; w >= 0; w--) {
			const monday = new Date(lastMonday);
			monday.setDate(monday.getDate() - w * 7);

			const column: Day[] = [];
			for (let d = 0; d < 7; d++) {
				const date = new Date(monday);
				date.setDate(date.getDate() + d);
				const iso = toIso(date);
				column.push(byDate.get(iso) ?? { iso, sets: 0, volumeKg: 0 });
			}

			// One label per month, on the column where it starts.
			if (monday.getMonth() !== previousMonth) {
				previousMonth = monday.getMonth();
				labels.push({ index: columns.length, text: MONTH.format(monday) });
			}
			columns.push(column);
		}

		return {
			weeks: columns,
			months: labels,
			days: byDate.size,
			total: [...byDate.values()].reduce((sum, day) => sum + day.volumeKg, 0),
		};
	}, [history]);

	const level = useMemo(
		() => heatScale(weeks.flat().map((day) => day.volumeKg)),
		[weeks],
	);

	const today = toIso(new Date());

	return (
		<div>
			{/*
			 * One grid: a gutter column plus 53 week columns, seven rows deep.
			 *
			 * Two flex stacks side by side could not stay aligned. A day cell is
			 * square by ratio, so its height follows the column width, while the
			 * weekday labels beside it had a height of their own — the two columns
			 * ended up different heights and every label landed between rows. In a
			 * grid the rows are shared, so a label is in the same row as the days
			 * it names by construction rather than by arithmetic.
			 *
			 * `minmax(0, 1fr)` on the week columns: a bare `1fr` refuses to shrink
			 * below its content and the year overflowed into a scrollbar.
			 */}
			<div
				className="grid w-full gap-[2px]"
				style={{
					gridTemplateColumns: `1.25rem repeat(${weeks.length}, minmax(0, 1fr))`,
					gridTemplateRows: "auto repeat(7, minmax(0, 1fr))",
				}}
			>
				{/* Month labels, each starting on the column its month starts in. */}
				<span />
				{weeks.map((column, index) => (
					<span
						key={`label-${column[0].iso}`}
						className="overflow-visible whitespace-nowrap text-[0.625rem] leading-4 text-muted-foreground"
					>
						{months.find((month) => month.index === index)?.text ?? ""}
					</span>
				))}

				{WEEKDAY_INITIALS.map((initial, day) => (
					<Fragment key={`row-${initial}-${day}`}>
						<span
							className="flex items-center pr-1 text-[0.625rem] leading-none text-muted-foreground"
							aria-hidden
						>
							{day % 2 === 0 ? initial : ""}
						</span>
						{weeks.map((column) => {
							const entry = column[day];
							return (
								<span
									key={entry.iso}
									title={
										entry.sets > 0
											? `${FULL_DATE.format(parseIso(entry.iso))} — ${entry.sets} sets, ${formatKg(entry.volumeKg)} kg`
											: `${FULL_DATE.format(parseIso(entry.iso))} — rest`
									}
									className={cn(
										"aspect-square w-full rounded-[2px]",
										HEAT[level(entry.volumeKg)],
										entry.iso === today && "ring-1 ring-foreground",
										// A square dated after today is not a rest day, it has
										// not happened. Shading it like one would claim you
										// already missed it.
										entry.iso > today && "opacity-30",
									)}
								/>
							);
						})}
					</Fragment>
				))}
			</div>

			<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<span className="tabular-nums">
					{days} training days · {formatKg(total)} kg this year
				</span>
				<span className="flex items-center gap-1">
					Less
					{HEAT.map((className) => (
						<span
							key={className}
							className={cn("size-2.5 shrink-0 rounded-[2px]", className)}
							aria-hidden
						/>
					))}
					More
				</span>
			</div>
		</div>
	);
}
