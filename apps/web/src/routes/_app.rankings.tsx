import { exercises } from "@gym/shared/catalog";
import { formatKg } from "@gym/shared/domain";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { ExerciseArt } from "@/features/catalog/exercise-art";
import { useHistory } from "@/features/progress/queries";
import {
	METRIC_HINTS,
	METRIC_LABELS,
	personalRecords,
	type RankMetric,
	rankExercises,
	sortByMetric,
	totals,
	WINDOW_LABELS,
	type Window,
	withinWindow,
} from "@/features/progress/rankings";

const searchSchema = z.object({
	window: z.enum(["day", "week", "month", "all"]).optional(),
	metric: z
		.enum(["sessions", "volumeKg", "sets", "topWeightKg", "bestOneRmKg"])
		.optional(),
});

export const Route = createFileRoute("/_app/rankings")({
	validateSearch: searchSchema,
	component: RankingsPage,
});

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);
const MUSCLES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.primaryMuscle]),
);

const WINDOWS: Window[] = ["day", "week", "month", "all"];
const METRICS: RankMetric[] = [
	"sessions",
	"volumeKg",
	"sets",
	"topWeightKg",
	"bestOneRmKg",
];

/** How a metric reads for one exercise. */
function metricValue(
	metric: RankMetric,
	rank: ReturnType<typeof rankExercises>[number],
): string {
	switch (metric) {
		case "sessions":
			return `${rank.sessions} ${rank.sessions === 1 ? "day" : "days"}`;
		case "sets":
			return `${rank.sets} sets`;
		case "volumeKg":
			return `${formatKg(rank.volumeKg)} kg`;
		case "topWeightKg":
			return `${formatKg(rank.topWeightKg)} kg`;
		case "bestOneRmKg":
			return `${formatKg(rank.bestOneRmKg)} kg`;
	}
}

function RankingsPage() {
	const { window = "month", metric = "sessions" } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: history, isPending } = useHistory();

	const scoped = useMemo(
		() => (history ? withinWindow(history, window) : []),
		[history, window],
	);
	const summary = useMemo(() => totals(scoped), [scoped]);
	const ranked = useMemo(
		() => sortByMetric(rankExercises(scoped), metric),
		[scoped, metric],
	);
	// Records are lifetime by definition; a window would make them meaningless.
	const records = useMemo(
		() =>
			history ? personalRecords(history.filter((set) => !set.warmup)) : [],
		[history],
	);

	if (isPending) {
		return (
			<>
				<AppHeader title="Rankings" />
				<AppScroll className="space-y-3">
					<div className="h-24 animate-pulse rounded-xl bg-muted" />
					<div className="h-64 animate-pulse rounded-xl bg-muted" />
				</AppScroll>
			</>
		);
	}

	return (
		<>
			<AppHeader title="Rankings" />
			<AppScroll className="space-y-6">
				<div className="grid grid-cols-4 gap-2">
					{WINDOWS.map((option) => (
						<Button
							key={option}
							variant={window === option ? "default" : "outline"}
							onClick={() =>
								navigate({ search: (prev) => ({ ...prev, window: option }) })
							}
							className="h-11 px-1 text-xs sm:text-sm"
						>
							{WINDOW_LABELS[option]}
						</Button>
					))}
				</div>

				<section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Stat label="Sessions" value={String(summary.sessions)} />
					<Stat label="Working sets" value={String(summary.sets)} />
					<Stat label="Reps" value={String(summary.reps)} />
					<Stat label="Volume" value={`${formatKg(summary.volumeKg)} kg`} />
				</section>

				{summary.sets === 0 ? (
					<div className="rounded-xl border border-dashed p-6 text-center">
						<p className="text-muted-foreground">
							Nothing logged in this window yet.
						</p>
					</div>
				) : (
					<section>
						<div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
							{METRICS.map((option) => (
								<Button
									key={option}
									size="sm"
									variant={metric === option ? "default" : "outline"}
									onClick={() =>
										navigate({
											search: (prev) => ({ ...prev, metric: option }),
										})
									}
									className="h-10 shrink-0"
								>
									{METRIC_LABELS[option]}
								</Button>
							))}
						</div>

						<p className="mb-3 text-sm text-muted-foreground">
							{METRIC_HINTS[metric]}
						</p>

						<ol className="space-y-2">
							{ranked.slice(0, 20).map((rank, index) => (
								<li key={rank.slug}>
									<Link
										to="/catalog/$slug"
										params={{ slug: rank.slug }}
										className="flex items-center gap-3 rounded-xl border bg-card p-2 pr-3 transition-colors hover:border-primary"
									>
										{/* Position is the point of a ranking, so it leads. */}
										<span
											className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums text-muted-foreground"
											aria-hidden
										>
											{index + 1}
										</span>
										<ExerciseArt
											slug={rank.slug}
											className="size-12 shrink-0 border-0 bg-transparent"
										/>
										<span className="min-w-0 flex-1">
											<span className="block truncate font-medium">
												{NAMES.get(rank.slug) ?? rank.slug}
											</span>
											<span className="block truncate text-sm text-muted-foreground">
												{MUSCLES.get(rank.slug)} · {rank.sets} sets ·{" "}
												{formatKg(rank.volumeKg)} kg
											</span>
										</span>
										<span className="shrink-0 text-right font-medium tabular-nums">
											{metricValue(metric, rank)}
										</span>
									</Link>
								</li>
							))}
						</ol>
					</section>
				)}

				{records.length > 0 && (
					<section>
						<h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide">
							<Trophy className="size-5 text-primary" aria-hidden />
							Personal records
						</h2>
						<p className="mb-3 text-sm text-muted-foreground">
							Heaviest set ever, for every exercise. Not affected by the window
							above.
						</p>

						<ol className="space-y-2">
							{records.slice(0, 10).map((record) => (
								<li
									key={record.slug}
									className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2"
								>
									<span className="min-w-0 flex-1 truncate">
										{NAMES.get(record.slug) ?? record.slug}
									</span>
									<span className="shrink-0 tabular-nums">
										{record.reps} × {formatKg(record.weightKg)} kg
									</span>
									<span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
										{record.date}
									</span>
								</li>
							))}
						</ol>
					</section>
				)}
			</AppScroll>
		</>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border bg-card p-3">
			<p className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</p>
			<p className="font-display text-2xl font-bold tabular-nums">{value}</p>
		</div>
	);
}
