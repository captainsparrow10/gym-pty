import { exercises } from "@gym/shared/catalog";
import { formatKg } from "@gym/shared/domain";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { Avatar } from "@/core/ui/avatar";
import { ExerciseArt } from "@/features/catalog/exercise-art";
import {
	WINDOW_LABELS as LEADERBOARD_WINDOW_LABELS,
	type LeaderboardWindow,
	useLeaderboard,
} from "@/features/leaderboard/queries";
import { useProfile } from "@/features/profile/queries";
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
import { cn } from "@/lib/utils";

const searchSchema = z.object({
	section: z.enum(["personal", "leaderboard"]).optional(),
	window: z.enum(["day", "week", "month", "all"]).optional(),
	metric: z
		.enum(["sessions", "volumeKg", "sets", "topWeightKg", "bestOneRmKg"])
		.optional(),
	board: z.enum(["week", "month", "all"]).optional(),
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
const BOARD_WINDOWS: LeaderboardWindow[] = ["week", "month", "all"];

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
	const { section = "personal" } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<>
			<AppHeader title="Rankings" />
			<AppScroll className="space-y-6">
				{/*
				 * Personal rankings answer "what do I do most"; the leaderboard
				 * answers "how do I compare". Different questions, so both stay —
				 * a section switches between them rather than one replacing the other.
				 */}
				<Tabs
					value={section}
					onValueChange={(value) =>
						navigate({
							search: (prev) => ({
								...prev,
								section: value as "personal" | "leaderboard",
							}),
						})
					}
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="personal" className="min-h-11">
							Personal
						</TabsTrigger>
						<TabsTrigger value="leaderboard" className="min-h-11">
							Leaderboard
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{section === "leaderboard" ? <LeaderboardPanel /> : <PersonalPanel />}
			</AppScroll>
		</>
	);
}

function PersonalPanel() {
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
			<div className="space-y-3">
				<div className="h-24 animate-pulse rounded-xl bg-muted" />
				<div className="h-64 animate-pulse rounded-xl bg-muted" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
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
		</div>
	);
}

/**
 * Every public profile, ranked by volume.
 *
 * Backed by `leaderboard()`, a security definer function — see
 * `supabase/migrations/20260902060000_leaderboard.sql`. It never returns a
 * row from sessions, sets or routines, only the aggregates below, so this
 * component cannot accidentally render anyone's individual training data even
 * if it wanted to.
 */
function LeaderboardPanel() {
	const { board = "month" } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: profile } = useProfile();
	const { data: entries, isPending } = useLeaderboard(board);

	if (isPending) {
		return (
			<div className="space-y-3">
				<div className="h-11 animate-pulse rounded-xl bg-muted" />
				<div className="h-64 animate-pulse rounded-xl bg-muted" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-3 gap-2">
				{BOARD_WINDOWS.map((option) => (
					<Button
						key={option}
						variant={board === option ? "default" : "outline"}
						onClick={() =>
							navigate({ search: (prev) => ({ ...prev, board: option }) })
						}
						className="h-11 px-1 text-xs sm:text-sm"
					>
						{LEADERBOARD_WINDOW_LABELS[option]}
					</Button>
				))}
			</div>

			{!entries || entries.length === 0 ? (
				<div className="rounded-xl border border-dashed p-6 text-center">
					<p className="text-muted-foreground">
						Nobody has trained in this window yet.
					</p>
				</div>
			) : (
				<ol className="space-y-2">
					{entries.map((entry, index) => {
						const isMe = entry.userId === profile?.id;
						return (
							<li
								key={entry.userId}
								className={cn(
									"flex items-center gap-3 rounded-xl border bg-card p-2 pr-3",
									isMe && "border-primary bg-primary/5",
								)}
							>
								<span
									className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums text-muted-foreground"
									aria-hidden
								>
									{index + 1}
								</span>
								<Avatar icon={entry.avatarIcon} color={entry.avatarColor} />
								<span className="min-w-0 flex-1">
									<span className="flex items-center gap-2 truncate font-medium">
										{entry.displayName ?? "Anonymous"}
										{isMe && (
											<span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase text-primary-foreground">
												You
											</span>
										)}
									</span>
									<span className="block truncate text-sm text-muted-foreground">
										{entry.sessions} sessions · {entry.sets} sets
									</span>
								</span>
								<span className="shrink-0 text-right font-medium tabular-nums">
									{formatKg(entry.volumeKg)} kg
								</span>
							</li>
						);
					})}
				</ol>
			)}
		</div>
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
