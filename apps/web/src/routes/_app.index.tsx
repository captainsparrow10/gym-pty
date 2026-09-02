import { exercises } from "@gym/shared/catalog";
import {
	estimatedCalories,
	formatDuration,
	formatKg,
} from "@gym/shared/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { supabase } from "@/core/api/supabase";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { Avatar } from "@/core/ui/avatar";
import { Measurements } from "@/features/body/measurements";
import { useLatestBodyweight } from "@/features/body/queries";
import { useProfile } from "@/features/profile/queries";
import { Panel, ProgressCharts } from "@/features/progress/charts";
import { useHistory } from "@/features/progress/queries";
import { Today, UpcomingPlan, WeekPlan } from "@/features/routines/today";
import { useActiveSession } from "@/features/session/queries";

const searchSchema = z.object({ exercise: z.string().optional() });

export const Route = createFileRoute("/_app/")({
	validateSearch: searchSchema,
	component: HomePage,
});

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);

type RecentSession = {
	id: string;
	date: string;
	durationSec: number;
	setCount: number;
	volumeKg: number;
	exerciseNames: string[];
};

/**
 * The last few finished sessions.
 *
 * Volume is summed here rather than in SQL: the arithmetic already lives in
 * `@gym/shared/domain` and duplicating it as a Postgres expression would give
 * two definitions of the same number that can disagree.
 */
function useRecentSessions() {
	return useQuery({
		queryKey: ["sessions", "recent"] as const,
		queryFn: async (): Promise<RecentSession[]> => {
			const { data, error } = await supabase
				.from("sessions")
				.select(
					"id, date, duration_sec, logged_exercises(exercise_slug, position, sets(reps, weight_kg))",
				)
				.not("finished_at", "is", null)
				.order("date", { ascending: false })
				.limit(5);

			if (error) throw error;

			return (data ?? []).map((session) => {
				const loggedExercises = session.logged_exercises ?? [];
				const allSets = loggedExercises.flatMap(
					(exercise) => exercise.sets ?? [],
				);

				return {
					id: session.id,
					date: session.date,
					durationSec: session.duration_sec,
					setCount: allSets.length,
					volumeKg: allSets.reduce(
						(total, set) => total + set.reps * Number(set.weight_kg),
						0,
					),
					exerciseNames: loggedExercises
						.slice()
						.sort((a, b) => a.position - b.position)
						.map(
							(exercise) =>
								NAMES.get(exercise.exercise_slug) ?? exercise.exercise_slug,
						),
				};
			});
		},
	});
}

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
	weekday: "long",
	day: "numeric",
	month: "short",
});

function formatDate(iso: string) {
	// Parsed as a local date: `new Date("2026-09-02")` is UTC midnight, which
	// renders as the previous day in every timezone west of Greenwich.
	const [year, month, day] = iso.split("-").map(Number);
	return DATE_FORMAT.format(new Date(year, month - 1, day));
}

/**
 * The home screen.
 *
 * It used to be a start button and a list of recent sessions, with everything
 * worth knowing about yourself on a separate Progress tab that you had to
 * remember to open. The two answer the same question from opposite ends —
 * "what am I doing today" and "how has it been going" — and splitting them
 * meant the screen you land on told you the least.
 */
function HomePage() {
	const { exercise } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: active } = useActiveSession();
	const { data: recent, isPending } = useRecentSessions();
	const { data: history } = useHistory();
	const { data: profile } = useProfile();
	const { data: bodyweight } = useLatestBodyweight();

	return (
		<>
			<AppHeader
				title="Home"
				action={
					// The sidebar links Profile directly from 1024px up; below that
					// this is the way in, the same place a top-right avatar
					// conventionally opens account settings.
					<Link
						to="/profile"
						aria-label="Profile"
						className="rounded-full lg:hidden"
					>
						{profile && (
							<Avatar icon={profile.avatarIcon} color={profile.avatarColor} />
						)}
					</Link>
				}
			/>
			{/*
			 * Two explicit columns, each a stack of its own.
			 *
			 * Before this every panel was a direct child of a two-column grid and
			 * auto-placement decided which side each landed on — so the order read
			 * across rather than down and a tall panel dragged a short one with it.
			 *
			 * `minmax(0, …)` on both tracks rather than `1fr` and `2fr`. A bare
			 * `fr` track has an automatic minimum, which means it refuses to shrink
			 * below its widest child: the training calendar was 814px and pushed
			 * the whole page into a horizontal scroll instead of being made to fit.
			 */}
			<AppScroll className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start lg:gap-8 lg:space-y-0">
				<div className="min-w-0 space-y-6">
					<div className="space-y-3">
						<Button asChild className="h-14 w-full text-base">
							<Link to="/session">
								<Play className="size-5" aria-hidden />
								{active ? "Continue session" : "Start training"}
							</Link>
						</Button>

						<Link
							to="/exercises"
							className="flex min-h-12 items-center justify-between rounded-xl border bg-card px-4 text-sm transition-colors hover:border-primary"
						>
							<span>Browse all {exercises.length} exercises</span>
							<ChevronRight
								className="size-4 text-muted-foreground"
								aria-hidden
							/>
						</Link>
					</div>

					<Panel title="Today" hint="What the week has planned for you.">
						<Today />
					</Panel>

					<Panel title="This week" hint="Where the rest days fall.">
						<WeekPlan />
					</Panel>

					<Panel
						title="Coming up"
						hint="Days you have planned without a routine."
					>
						<UpcomingPlan />
					</Panel>

					<section>
						<h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">
							Recent sessions
						</h2>

						{isPending ? (
							<div className="space-y-2">
								<div className="h-20 animate-pulse rounded-xl bg-muted" />
								<div className="h-20 animate-pulse rounded-xl bg-muted" />
							</div>
						) : recent && recent.length > 0 ? (
							<ul className="space-y-2">
								{recent.map((session) => (
									<li key={session.id}>
										<article className="rounded-xl border bg-card p-3">
											<div className="flex items-baseline justify-between gap-2">
												<h3 className="font-medium capitalize">
													{formatDate(session.date)}
												</h3>
												<span className="shrink-0 text-sm text-muted-foreground">
													{formatDuration(session.durationSec)}
												</span>
											</div>
											<p className="mt-1 truncate text-sm text-muted-foreground">
												{session.exerciseNames.join(" · ") || "No exercises"}
											</p>
											<p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
												<span>{session.setCount} sets</span>
												{session.volumeKg > 0 && (
													<span>{formatKg(session.volumeKg)} kg volume</span>
												)}
												{/*
												 * Prefixed with a tilde and only shown when a weigh-in
												 * exists. `MET x bodyweight x hours` needs a mass, and
												 * inventing one would produce a confident number about
												 * somebody else.
												 */}
												{bodyweight !== null && bodyweight !== undefined && (
													<span>
														~
														{estimatedCalories(session.durationSec, bodyweight)}{" "}
														kcal
													</span>
												)}
											</p>
										</article>
									</li>
								))}
							</ul>
						) : (
							<div className="rounded-xl border border-dashed p-6 text-center">
								<p className="text-muted-foreground">
									No sessions yet. Start your first one above.
								</p>
							</div>
						)}
					</section>
				</div>

				<div className="min-w-0 space-y-6">
					<Panel
						title="Your body"
						hint="The scale moves for reasons training does not. A tape measure does not."
					>
						<Measurements />
					</Panel>

					<ProgressCharts
						history={history ?? []}
						selected={exercise}
						onSelect={(slug) => navigate({ search: { exercise: slug } })}
					/>
				</div>
			</AppScroll>
		</>
	);
}
