import { exercises } from "@gym/shared/catalog";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Moon, Play, X } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExerciseArt } from "@/features/exercises/exercise-art";
import {
	dateFromToday,
	type PlannedExercise,
	useRemoveFromDay,
	useUpcomingPlan,
} from "@/features/plan/queries";
import { summariseSets } from "@/features/plan/set-editor";
import { parseIso } from "@/features/progress/queries";
import {
	type Routine,
	useRoutines,
	useStartFromRoutine,
	WEEKDAY_LABELS,
	weekdayOf,
} from "@/features/routines/queries";
import { useActiveSession } from "@/features/session/queries";
import { cn } from "@/lib/utils";

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);

/**
 * What today is for.
 *
 * The app could already tell you everything about what you have done and
 * nothing about what you are meant to do now, which is the question you open
 * it with. A routine carries the weekdays it is planned for, so a day with
 * none is a rest day — a real answer rather than an empty screen.
 *
 * Deliberately distinguishes three states, because they mean different things:
 * a scheduled day, a rest day, and a week nobody has planned yet. The third
 * is not rest; it is a prompt.
 */
export function Today() {
	const { data: routines, isPending } = useRoutines();
	const { data: upcoming } = useUpcomingPlan();
	const today = dateFromToday(0);
	const planned = (upcoming ?? []).filter((entry) => entry.date === today);

	const {
		today: weekday,
		scheduled,
		hasWeek,
	} = useMemo(() => {
		const index = weekdayOf(new Date());
		const all = routines ?? [];
		return {
			today: index,
			scheduled: all.filter((routine) => routine.weekdays.includes(index)),
			hasWeek: all.some((routine) => routine.weekdays.length > 0),
		};
	}, [routines]);

	if (isPending) {
		return <div className="h-28 animate-pulse rounded-xl bg-muted" />;
	}

	if (!hasWeek && planned.length === 0) {
		return (
			<div className="rounded-xl border border-dashed p-5 text-center">
				<CalendarDays
					className="mx-auto mb-2 size-6 text-muted-foreground"
					aria-hidden
				/>
				<p className="mb-3 text-sm text-muted-foreground">
					No routine is scheduled to a weekday yet, so the app cannot say what
					today is for.
				</p>
				<Button asChild variant="outline" className="h-11">
					<Link to="/train" search={{ tab: "routines", routines: "mine" }}>
						Plan the week
					</Link>
				</Button>
			</div>
		);
	}

	if (scheduled.length === 0 && planned.length === 0) {
		return (
			<div className="flex items-center gap-4 rounded-xl border bg-card p-5">
				<Moon className="size-8 shrink-0 text-muted-foreground" aria-hidden />
				<div className="min-w-0">
					<p className="font-display text-lg font-semibold uppercase tracking-wide">
						Rest day
					</p>
					<p className="text-sm text-muted-foreground">
						Nothing is planned for {WEEKDAY_LABELS[weekday]}.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{scheduled.map((routine) => (
				<TodayRoutine key={routine.id} routine={routine} />
			))}
			{planned.length > 0 && <PlannedDay date={today} entries={planned} />}
		</div>
	);
}

/**
 * Exercises put on a date directly, with no routine behind them.
 *
 * Shown beside the scheduled routines rather than instead of them: a day can
 * legitimately be both — your Push routine plus the calf raises you decided on
 * yesterday — and picking one to hide would lose half the answer to "what am I
 * doing today".
 */
export function PlannedDay({
	date,
	entries,
	heading,
}: {
	date: string;
	entries: PlannedExercise[];
	heading?: string;
}) {
	const remove = useRemoveFromDay();

	return (
		<div className="rounded-xl border border-dashed bg-card">
			<div className="flex items-center gap-3 border-b border-dashed p-3">
				<div className="min-w-0 flex-1">
					<p className="truncate font-display text-lg font-semibold">
						{heading ?? "Planned for today"}
					</p>
					<p className="text-sm text-muted-foreground">
						{entries.length} {entries.length === 1 ? "exercise" : "exercises"} ·
						not a routine
					</p>
				</div>
				<Button asChild className="h-11 shrink-0">
					<Link to="/session">
						<Play className="size-4" aria-hidden />
						Log it
					</Link>
				</Button>
			</div>

			<ol className="divide-y divide-dashed">
				{entries.map((entry, index) => (
					<li key={entry.id} className="flex items-center gap-3 px-3 py-2">
						<span className="w-4 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
							{index + 1}
						</span>
						<ExerciseArt
							slug={entry.slug}
							className="size-9 shrink-0 border-0 bg-transparent"
						/>
						<Link
							to="/exercises/$slug"
							params={{ slug: entry.slug }}
							className="min-w-0 flex-1 truncate text-sm hover:underline"
						>
							{NAMES.get(entry.slug) ?? entry.slug}
						</Link>
						<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
							{summariseSets(entry.sets) || "—"}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 shrink-0 text-muted-foreground"
							aria-label={`Remove ${NAMES.get(entry.slug) ?? entry.slug} from ${date}`}
							onClick={() => remove.mutate(entry.id)}
						>
							<X className="size-3.5" aria-hidden />
						</Button>
					</li>
				))}
			</ol>
		</div>
	);
}

const DAY_HEADING = new Intl.DateTimeFormat("en", {
	weekday: "long",
	month: "short",
	day: "numeric",
});

/**
 * The next fortnight of one-off plans.
 *
 * `WeekPlan` shows the repeating shape of the week from routines. This shows
 * the things that only apply to one date, which the weekday grid structurally
 * cannot: two Thursdays are the same weekday and can hold different plans.
 */
export function UpcomingPlan() {
	const { data: upcoming, isPending } = useUpcomingPlan();
	const today = dateFromToday(0);

	const byDate = useMemo(() => {
		const days = new Map<string, PlannedExercise[]>();
		for (const entry of upcoming ?? []) {
			// Today already has its own panel above; repeating it here would read
			// as two different plans for the same day.
			if (entry.date === today) continue;
			days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
		}
		return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [upcoming, today]);

	if (isPending) {
		return <div className="h-24 animate-pulse rounded-xl bg-muted" />;
	}

	if (byDate.length === 0) {
		return (
			<p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
				Nothing planned for the coming days. Add an exercise to a date from its
				page — you do not need a routine for it.
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{byDate.map(([date, entries]) => (
				<PlannedDay
					key={date}
					date={date}
					entries={entries}
					heading={DAY_HEADING.format(parseIso(date))}
				/>
			))}
		</div>
	);
}

function TodayRoutine({ routine }: { routine: Routine }) {
	const navigate = useNavigate();
	const start = useStartFromRoutine();
	const { data: active } = useActiveSession();

	/*
	 * Starts the session and goes to it.
	 *
	 * This was a `<Link to="/train">`, which on the home screen went to a page
	 * listing the routine you had just pressed Start on, and on the train page
	 * itself went nowhere at all — the same URL you were already looking at.
	 * Start is a verb; it should do the thing.
	 */
	const begin = () =>
		start.mutate(routine, {
			onSuccess: () => navigate({ to: "/session" }),
			onError: (error) =>
				toast.error("Could not start the routine", {
					description: (error as Error).message,
				}),
		});

	return (
		<div className="rounded-xl border bg-card">
			<div className="flex items-center gap-3 border-b p-3">
				{/*
				 * The name opens the routine rather than doing nothing. Adjusting a
				 * set before you train is the common case, and it has nowhere else
				 * to happen from here.
				 */}
				<Link
					to="/routines/$id"
					params={{ id: routine.id }}
					className="min-w-0 flex-1 hover:underline"
				>
					<span className="block truncate font-display text-lg font-semibold">
						{routine.name}
					</span>
					<span className="block text-sm text-muted-foreground">
						{routine.exercises.length}{" "}
						{routine.exercises.length === 1 ? "exercise" : "exercises"} · open
						to edit
					</span>
				</Link>
				{/*
				 * A session already running is not replaced. Two open sessions is a
				 * state the schema forbids anyway — there is a partial unique index
				 * on the unfinished one — so the button goes to the session instead
				 * of failing.
				 */}
				{active ? (
					<Button asChild variant="outline" className="h-11 shrink-0">
						<Link to="/session">
							<Play className="size-4" aria-hidden />
							Continue
						</Link>
					</Button>
				) : (
					<Button
						className="h-11 shrink-0"
						onClick={begin}
						disabled={start.isPending}
					>
						<Play className="size-4" aria-hidden />
						{start.isPending ? "Starting…" : "Start"}
					</Button>
				)}
			</div>

			<ol className="divide-y">
				{routine.exercises.map((exercise, index) => (
					<li key={exercise.id} className="flex items-center gap-3 px-3 py-2">
						<span className="w-4 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
							{index + 1}
						</span>
						<ExerciseArt
							slug={exercise.slug}
							className="size-9 shrink-0 border-0 bg-transparent"
						/>
						<span className="min-w-0 flex-1 truncate text-sm">
							{NAMES.get(exercise.slug) ?? exercise.slug}
						</span>
						<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
							{summariseSets(exercise.sets) || "—"}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}

/**
 * The week at a glance: which routine falls on which day.
 *
 * Seven columns rather than a list, because the question it answers is about
 * the shape of the week — where the rest days fall, whether three hard days
 * are stacked together — and a list of routines with their days attached
 * cannot show that.
 */
export function WeekPlan() {
	const { data: routines } = useRoutines();
	const today = weekdayOf(new Date());

	const byDay = useMemo(() => {
		const days: Routine[][] = [[], [], [], [], [], [], []];
		for (const routine of routines ?? []) {
			for (const day of routine.weekdays) days[day]?.push(routine);
		}
		return days;
	}, [routines]);

	return (
		<div className="grid grid-cols-7 gap-1.5">
			{byDay.map((day, index) => (
				<div
					key={WEEKDAY_LABELS[index]}
					className={cn(
						"min-h-20 rounded-lg border bg-card p-1.5 text-center",
						index === today && "border-primary bg-primary/5",
					)}
				>
					<p
						className={cn(
							"mb-1 text-[0.625rem] uppercase tracking-wide text-muted-foreground",
							index === today && "font-semibold text-primary",
						)}
					>
						{WEEKDAY_LABELS[index]}
					</p>
					{day.length === 0 ? (
						<Moon
							className="mx-auto size-3.5 text-muted-foreground/50"
							aria-hidden
						/>
					) : (
						day.map((routine) => (
							<p
								key={routine.id}
								className="truncate text-[0.6875rem] leading-tight"
								title={routine.name}
							>
								{routine.name}
							</p>
						))
					)}
				</div>
			))}
		</div>
	);
}
