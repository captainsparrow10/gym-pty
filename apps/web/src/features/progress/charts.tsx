import { exercises } from "@gym/shared/catalog";
import { formatKg, formatTick } from "@gym/shared/domain";
import { useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	type HistorySet,
	setsPerMuscle,
	strengthOverTime,
	trackableExercises,
	weeklyVolume,
} from "@/features/progress/queries";
import { TrainingCalendar } from "@/features/progress/training-calendar";

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);
const MUSCLES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.primaryMuscle]),
);

const VOLUME_CONFIG = {
	volumeKg: { label: "Volume", color: "var(--color-primary)" },
} satisfies ChartConfig;

const STRENGTH_CONFIG = {
	oneRmKg: { label: "Est. 1RM", color: "var(--color-primary)" },
} satisfies ChartConfig;

const SETS_CONFIG = {
	sets: { label: "Sets", color: "var(--color-primary)" },
} satisfies ChartConfig;

const SHORT_DATE = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
});

function shortDate(iso: string) {
	// Parsed as local, not UTC: `new Date("2026-09-02")` is UTC midnight and
	// renders as the previous day anywhere west of Greenwich.
	const [year, month, day] = iso.split("-").map(Number);
	return SHORT_DATE.format(new Date(year, month - 1, day));
}

/**
 * The charts, lifted out of the page that used to own them.
 *
 * They moved from `/progress` to the home screen, which is where the question
 * they answer actually gets asked. Extracted rather than pasted so the route
 * stays a composition of panels and the chart code has one home.
 *
 * The selected exercise stays in the URL, so the route passes it in and takes
 * the change back: a component that navigates on its own is a component that
 * cannot be reused on a screen with different search params.
 */
export function ProgressCharts({
	history,
	selected,
	onSelect,
}: {
	history: HistorySet[];
	selected?: string;
	onSelect: (slug: string) => void;
}) {
	const weekly = useMemo(() => weeklyVolume(history), [history]);
	const muscles = useMemo(
		() => setsPerMuscle(history, (slug) => MUSCLES.get(slug)),
		[history],
	);
	const trackable = useMemo(() => trackableExercises(history), [history]);

	const focus = selected ?? trackable[0];
	const strength = useMemo(
		() => (focus ? strengthOverTime(history, focus) : []),
		[history, focus],
	);

	if (history.length === 0) {
		return (
			<div className="rounded-xl border border-dashed p-6 text-center">
				<p className="text-muted-foreground">
					Charts appear once you finish your first session.
				</p>
			</div>
		);
	}

	return (
		<>
			{/*
			 * The calendar first. "Did I show up" is the question the
			 * charts cannot answer — a twelve-week bar chart hides the
			 * three weeks off in March, and a line of estimated 1RM says
			 * nothing about the days between its points.
			 */}
			<Panel
				title="Training year"
				hint="Every day you trained, shaded by volume."
			>
				<TrainingCalendar history={history ?? []} />
			</Panel>

			<Panel title="Weekly volume" hint="Total kilos moved, warm-ups excluded.">
				<ChartContainer config={VOLUME_CONFIG} className="h-56 w-full">
					<BarChart data={weekly} margin={{ left: 4, right: 4 }}>
						<CartesianGrid vertical={false} strokeOpacity={0.2} />
						<XAxis
							dataKey="week"
							tickFormatter={shortDate}
							tickLine={false}
							axisLine={false}
							// Twelve labels do not fit on a phone; recharts drops the
							// ones that would collide.
							interval="preserveStartEnd"
							minTickGap={24}
						/>
						<YAxis
							width={44}
							tickLine={false}
							axisLine={false}
							tickFormatter={(value: number) =>
								value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
							}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(label) => shortDate(String(label))}
									formatter={(value) => `${formatKg(Number(value))} kg`}
								/>
							}
						/>
						<Bar dataKey="volumeKg" fill="var(--color-volumeKg)" radius={4} />
					</BarChart>
				</ChartContainer>
			</Panel>

			{trackable.length > 0 && (
				<Panel
					title="Strength"
					hint="Estimated 1RM via Epley. Indicative above 12 reps."
				>
					<Select value={focus} onValueChange={onSelect}>
						<SelectTrigger aria-label="Exercise" className="mb-3 h-11 w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{trackable.map((slug) => (
								<SelectItem key={slug} value={slug}>
									{NAMES.get(slug) ?? slug}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<ChartContainer config={STRENGTH_CONFIG} className="h-56 w-full">
						<LineChart data={strength} margin={{ left: 4, right: 8 }}>
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
								dataKey="oneRmKg"
								stroke="var(--color-oneRmKg)"
								strokeWidth={2}
								dot={{ r: 3 }}
							/>
						</LineChart>
					</ChartContainer>
				</Panel>
			)}

			<Panel title="Sets per muscle" hint="Where the work is going.">
				<ChartContainer
					config={SETS_CONFIG}
					className="w-full"
					style={{ height: Math.max(160, muscles.length * 28) }}
				>
					<BarChart
						data={muscles}
						layout="vertical"
						margin={{ left: 4, right: 12 }}
					>
						<CartesianGrid horizontal={false} strokeOpacity={0.2} />
						<XAxis type="number" tickLine={false} axisLine={false} />
						{/* Horizontal bars: twenty muscle names never fit as vertical
							    axis labels on a phone. */}
						<YAxis
							type="category"
							dataKey="muscle"
							width={96}
							tickLine={false}
							axisLine={false}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<Bar dataKey="sets" fill="var(--color-sets)" radius={4} />
					</BarChart>
				</ChartContainer>
			</Panel>
		</>
	);
}

export function Panel({
	title,
	hint,
	children,
	className,
}: {
	title: string;
	hint?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={className}>
			<h2 className="font-display text-lg font-semibold uppercase tracking-wide">
				{title}
			</h2>
			{hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
			{children}
		</section>
	);
}
