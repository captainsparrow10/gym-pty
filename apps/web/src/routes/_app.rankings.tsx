import { exercises } from "@gym/shared/catalog";
import { formatKg } from "@gym/shared/domain";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Trophy, Users } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { Avatar } from "@/core/ui/avatar";
import { ExerciseArt } from "@/features/exercises/exercise-art";
import { CommunityRanking } from "@/features/exercises/exercise-stats";
import {
	WINDOW_LABELS as LEADERBOARD_WINDOW_LABELS,
	type LeaderboardWindow,
	useCategoryLeaderboard,
	useLeaderboard,
} from "@/features/leaderboard/queries";
import { useProfile } from "@/features/profile/queries";
import {
	bucketLabel,
	bucketOf,
	catalogSearchFor,
	GROUPING_HINTS,
	GROUPING_LABELS,
	GROUPINGS,
	type Grouping,
	slugsIn,
} from "@/features/progress/categories";
import { parseIso, useHistory } from "@/features/progress/queries";
import {
	METRIC_HINTS,
	METRIC_LABELS,
	personalRecords,
	type RankMetric,
	rankBy,
	type rankExercises,
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
	/** Which axis the ranking is cut along. */
	group: z.enum(["exercise", "muscle", "equipment", "type"]).optional(),
	/** A bucket to drill into: the muscle, equipment or type selected. */
	bucket: z.string().optional(),
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

/*
 * Everything else in the app prints a date as "3 Jul". This one printed the
 * raw ISO string, which reads as a database value rather than as a day you
 * trained.
 */
const RECORD_DATE = new Intl.DateTimeFormat("en", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

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
					<TabsList
						variant="line"
						className="mb-6 grid h-auto w-full grid-cols-2"
					>
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
	const {
		window = "month",
		metric = "sessions",
		group = "exercise",
		bucket,
	} = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: history, isPending } = useHistory();

	const scoped = useMemo(
		() => (history ? withinWindow(history, window) : []),
		[history, window],
	);
	const summary = useMemo(() => totals(scoped), [scoped]);

	/*
	 * Drilling into a bucket narrows to that category and ranks the exercises
	 * inside it — the question after "which muscle do I train most" is always
	 * "and with what". A bucket only means anything alongside the grouping that
	 * produced it, so leaving the grouping clears it.
	 */
	const inBucket = useMemo(
		() =>
			bucket && group !== "exercise"
				? scoped.filter((set) => bucketOf(set.slug, group) === bucket)
				: scoped,
		[scoped, bucket, group],
	);

	const ranked = useMemo(
		() =>
			sortByMetric(
				bucket || group === "exercise"
					? rankBy(inBucket, (set) => set.slug)
					: rankBy(inBucket, (set) => bucketOf(set.slug, group)),
				metric,
			),
		[inBucket, group, bucket, metric],
	);

	/** Rows are exercises when drilled in or grouping by exercise. */
	const rowsAreExercises = Boolean(bucket) || group === "exercise";
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
					{/*
					 * The axis first, then the metric. "Most volume" is only a
					 * question once you have said most volume *of what* — one
					 * exercise, one muscle, one machine.
					 */}
					<div className="mb-3 flex flex-wrap items-center gap-2">
						<Select
							value={group}
							onValueChange={(value) =>
								navigate({
									search: (prev) => ({
										...prev,
										group: value as Grouping,
										// A bucket belongs to the grouping that produced it.
										bucket: undefined,
									}),
								})
							}
						>
							<SelectTrigger className="h-11 w-full sm:w-52">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{GROUPINGS.map((option) => (
									<SelectItem key={option} value={option}>
										{GROUPING_LABELS[option]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{bucket && (
							<Button
								variant="outline"
								className="h-11"
								onClick={() =>
									navigate({
										search: (prev) => ({ ...prev, bucket: undefined }),
									})
								}
							>
								<ChevronLeft className="size-4" aria-hidden />
								{bucketLabel(bucket, group)}
							</Button>
						)}
					</div>

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
						{" · "}
						{bucket
							? `Inside ${bucketLabel(bucket, group)}`
							: GROUPING_HINTS[group]}
					</p>

					<ol className="space-y-2">
						{ranked.slice(0, 20).map((rank, index) => {
							const body = (
								<>
									{/* Position is the point of a ranking, so it leads. */}
									<span
										className="w-7 shrink-0 text-center font-display text-lg font-bold tabular-nums text-muted-foreground"
										aria-hidden
									>
										{index + 1}
									</span>
									{rowsAreExercises ? (
										<ExerciseArt
											slug={rank.slug}
											className="size-12 shrink-0 border-0 bg-transparent"
										/>
									) : (
										/*
										 * A category has no drawing of its own, and borrowing one
										 * of its exercises' would claim the row is that exercise.
										 * The count of movements behind the row is the honest
										 * thing to put in that space.
										 */
										<span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/40 leading-none">
											<span className="font-display text-base font-bold tabular-nums">
												{rank.exercises}
											</span>
											<span className="text-[0.625rem] uppercase text-muted-foreground">
												{rank.exercises === 1 ? "move" : "moves"}
											</span>
										</span>
									)}
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">
											{rowsAreExercises
												? (NAMES.get(rank.slug) ?? rank.slug)
												: bucketLabel(rank.slug, group)}
										</span>
										<span className="block truncate text-sm text-muted-foreground">
											{rowsAreExercises && `${MUSCLES.get(rank.slug)} · `}
											{rank.sets} sets · {formatKg(rank.volumeKg)} kg
										</span>
									</span>
									<span className="shrink-0 text-right font-medium tabular-nums">
										{metricValue(metric, rank)}
									</span>
								</>
							);

							const className =
								"flex w-full items-center gap-3 rounded-xl border bg-card p-2 pr-3 text-left transition-colors hover:border-primary";

							return (
								<li key={rank.slug}>
									{rowsAreExercises ? (
										<Link
											to="/exercises/$slug"
											params={{ slug: rank.slug }}
											className={className}
										>
											{body}
										</Link>
									) : (
										<button
											type="button"
											className={className}
											onClick={() =>
												navigate({
													search: (prev) => ({ ...prev, bucket: rank.slug }),
												})
											}
										>
											{body}
										</button>
									)}
								</li>
							);
						})}
					</ol>
				</section>
			)}

			{bucket && group !== "exercise" && (
				<CategoryBoard bucket={bucket} group={group} />
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
									{RECORD_DATE.format(parseIso(record.date))}
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
 * Who else trains this category, alongside your own ranking of it.
 *
 * Placed inside the personal panel rather than on the leaderboard tab on
 * purpose: it answers "and how does that compare", which is a question you
 * only have once you are already looking at your own numbers for a muscle or
 * a machine. Putting it on the other tab would mean choosing the category
 * twice.
 */
function CategoryBoard({ bucket, group }: { bucket: string; group: Grouping }) {
	// The catalogue is the classification; Postgres only stores slugs.
	const slugs = useMemo(() => slugsIn(bucket, group), [bucket, group]);
	const { data: entries, isPending } = useCategoryLeaderboard(slugs);
	const { data: profile } = useProfile();

	if (isPending) {
		return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
	}
	if (!entries || entries.length === 0) return null;

	/*
	 * A whole category can be unloaded — Bodyweight is 113 exercises and every
	 * one of them is stored at 0 kg. Volume is then a column of zeroes and the
	 * SQL ordering has already fallen through to reps; showing "0 kg" beside
	 * that order would just make the ranking look broken.
	 */
	const loaded = entries.some((entry) => entry.volumeKg > 0);

	return (
		<section>
			<h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide">
				<Users className="size-5 text-primary" aria-hidden />
				{bucketLabel(bucket, group)} · everyone
			</h2>
			<p className="mb-3 text-sm text-muted-foreground">
				Public profiles, by {loaded ? "total volume" : "total reps"} across{" "}
				<Link
					to="/exercises"
					search={catalogSearchFor(bucket, group)}
					className="underline underline-offset-2 hover:text-foreground"
				>
					{slugs.length} exercises
				</Link>
				. All time, not the window above.
			</p>

			<ol className="space-y-2">
				{entries.slice(0, 10).map((entry, index) => {
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
									{entry.exercises} of {slugs.length} exercises · {entry.sets}{" "}
									sets
								</span>
							</span>
							{/*
							 * Per row, not per board. A category can mix loaded and
							 * unweighted work — Chest holds the bench press and the
							 * push-up — so somebody who trains only the bodyweight half
							 * has a real 0 kg beside a real 224 sets. True, and it reads
							 * as a bug; their reps are the number that means something.
							 */}
							<span className="shrink-0 text-right text-sm font-medium tabular-nums">
								{loaded && entry.volumeKg > 0
									? `${formatKg(entry.volumeKg)} kg`
									: `${entry.reps.toLocaleString("en")} reps`}
							</span>
						</li>
					);
				})}
			</ol>
		</section>
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
	const {
		board = "month",
		group = "exercise",
		bucket,
		window = "all",
	} = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: profile } = useProfile();
	const { data: entries, isPending } = useLeaderboard(board);
	const { data: history } = useHistory();

	/*
	 * The buckets to compare on come from your own training, not from the
	 * catalogue.
	 *
	 * A picker over 302 exercises and 20 muscles would be a search box for a
	 * question nobody asks — "how do I compare on an exercise I have never
	 * done" has an obvious answer. Ranking your own history and offering the
	 * top of it means the first thing on screen is the thing you actually want
	 * to know.
	 */
	const mine = useMemo(() => {
		if (!history) return [];
		const scoped = withinWindow(history, window);
		return sortByMetric(
			group === "exercise"
				? rankBy(scoped, (set) => set.slug)
				: rankBy(scoped, (set) => bucketOf(set.slug, group)),
			"sets",
		).slice(0, 12);
	}, [history, group, window]);

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
			{/*
			 * The same axis the personal side uses, so "my chest ranking" and
			 * "everyone's chest ranking" mean the same set of exercises. Without
			 * this the leaderboard could only answer "who trains the most in
			 * total", which says nothing about whether your bench is heavy.
			 */}
			<div className="flex flex-wrap items-center gap-2">
				<Select
					value={group}
					onValueChange={(value) =>
						navigate({
							search: (prev) => ({
								...prev,
								group: value as Grouping,
								bucket: undefined,
							}),
						})
					}
				>
					<SelectTrigger className="h-11 w-full sm:w-52">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{GROUPINGS.map((option) => (
							<SelectItem key={option} value={option}>
								Compare by {GROUPING_LABELS[option].toLowerCase()}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{bucket && (
					<Button
						variant="outline"
						className="h-11"
						onClick={() =>
							navigate({ search: (prev) => ({ ...prev, bucket: undefined }) })
						}
					>
						<ChevronLeft className="size-4" aria-hidden />
						Everyone overall
					</Button>
				)}
			</div>

			{!bucket && mine.length > 0 && (
				<div>
					<p className="mb-2 text-sm text-muted-foreground">
						Pick one to see how you compare on it, or leave it for the overall
						board below.
					</p>
					<div className="-mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
						{mine.map((rank) => (
							<Button
								key={rank.slug}
								variant="outline"
								size="sm"
								className="h-10 shrink-0"
								onClick={() =>
									navigate({
										search: (prev) => ({ ...prev, bucket: rank.slug }),
									})
								}
							>
								{group === "exercise"
									? (NAMES.get(rank.slug) ?? rank.slug)
									: bucketLabel(rank.slug, group)}
							</Button>
						))}
					</div>
				</div>
			)}

			{bucket && group === "exercise" && (
				<CommunityRanking slug={bucket} window={board} />
			)}
			{bucket && group !== "exercise" && (
				<CategoryBoard bucket={bucket} group={group} />
			)}

			{bucket ? null : (
				<>
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
				</>
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
