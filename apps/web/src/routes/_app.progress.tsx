import { exercises } from "@gym/shared/catalog";
import { formatKg } from "@gym/shared/domain";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Trophy } from "lucide-react";
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
import { z } from "zod";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import {
	setsPerMuscle,
	strengthOverTime,
	trackableExercises,
	useHistory,
	weeklyVolume,
} from "@/features/progress/queries";

const searchSchema = z.object({ exercise: z.string().optional() });

export const Route = createFileRoute("/_app/progress")({
	validateSearch: searchSchema,
	component: ProgressPage,
});

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

const SHORT_DATE = new Intl.DateTimeFormat("es", {
	day: "numeric",
	month: "short",
});

function shortDate(iso: string) {
	// Parsed as local, not UTC: `new Date("2026-09-02")` is UTC midnight and
	// renders as the previous day anywhere west of Greenwich.
	const [year, month, day] = iso.split("-").map(Number);
	return SHORT_DATE.format(new Date(year, month - 1, day));
}

function ProgressPage() {
	const { exercise: selected } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: history, isPending } = useHistory();

	const weekly = useMemo(
		() => (history ? weeklyVolume(history) : []),
		[history],
	);
	const muscles = useMemo(
		() => (history ? setsPerMuscle(history, (slug) => MUSCLES.get(slug)) : []),
		[history],
	);
	const trackable = useMemo(
		() => (history ? trackableExercises(history) : []),
		[history],
	);

	const focus = selected ?? trackable[0];
	const strength = useMemo(
		() => (history && focus ? strengthOverTime(history, focus) : []),
		[history, focus],
	);

	if (isPending) {
		return (
			<>
				<AppHeader title="Progress" />
				<AppScroll className="space-y-4">
					<div className="h-48 animate-pulse rounded-xl bg-muted" />
					<div className="h-48 animate-pulse rounded-xl bg-muted" />
				</AppScroll>
			</>
		);
	}

	const hasData = (history?.length ?? 0) > 0;

	return (
		<>
			<AppHeader title="Progress" />
			<AppScroll className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
				{/*
				 * Rankings has no room in the five-slot bottom bar, so on a phone
				 * this is how it is reached. The sidebar links it directly.
				 */}
				<Link
					to="/rankings"
					className="flex min-h-12 items-center justify-between rounded-xl border bg-card px-4 text-sm transition-colors hover:border-primary lg:col-span-2 lg:hidden"
				>
					<span className="flex items-center gap-2">
						<Trophy className="size-4 text-primary" aria-hidden />
						Rankings and personal records
					</span>
					<ChevronRight className="size-4 text-muted-foreground" aria-hidden />
				</Link>

				{!hasData && (
					<div className="rounded-xl border border-dashed p-6 text-center lg:col-span-2">
						<p className="text-muted-foreground">
							Charts appear once you finish your first session.
						</p>
					</div>
				)}

				{hasData && (
					<>
						<Panel
							title="Weekly volume"
							hint="Total kilos moved, warm-ups excluded."
						>
							<ChartContainer
								config={VOLUME_CONFIG}
								className="h-48 w-full lg:h-64"
							>
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
											value >= 1000
												? `${Math.round(value / 1000)}k`
												: String(value)
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
									<Bar
										dataKey="volumeKg"
										fill="var(--color-volumeKg)"
										radius={4}
									/>
								</BarChart>
							</ChartContainer>
						</Panel>

						{trackable.length > 0 && (
							<Panel
								title="Strength"
								hint="Estimated 1RM via Epley. Indicative above 12 reps."
							>
								<label htmlFor="exercise-select" className="sr-only">
									Exercise
								</label>
								<select
									id="exercise-select"
									value={focus}
									onChange={(event) =>
										navigate({ search: { exercise: event.target.value } })
									}
									className="mb-3 h-11 w-full rounded-lg border bg-card px-3 text-base"
								>
									{trackable.map((slug) => (
										<option key={slug} value={slug}>
											{NAMES.get(slug) ?? slug}
										</option>
									))}
								</select>

								<ChartContainer
									config={STRENGTH_CONFIG}
									className="h-48 w-full lg:h-64"
								>
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
				)}
			</AppScroll>
		</>
	);
}

function Panel({
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
