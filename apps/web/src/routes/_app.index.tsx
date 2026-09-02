import { exercises } from "@gym/shared/catalog";
import { formatDuration, formatKg } from "@gym/shared/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/core/api/supabase";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { Avatar } from "@/core/ui/avatar";
import { useProfile } from "@/features/profile/queries";
import { useActiveSession } from "@/features/session/queries";

export const Route = createFileRoute("/_app/")({
	component: TodayPage,
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

function TodayPage() {
	const { data: active } = useActiveSession();
	const { data: recent, isPending } = useRecentSessions();
	const { data: profile } = useProfile();

	return (
		<>
			<AppHeader
				title="Today"
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
			<AppScroll className="space-y-6 lg:grid lg:grid-cols-[1fr_2fr] lg:items-start lg:gap-8 lg:space-y-0">
				<div className="space-y-3">
					<Button asChild className="h-14 w-full text-base">
						<Link to="/session">
							<Play className="size-5" aria-hidden />
							{active ? "Continue session" : "Start training"}
						</Link>
					</Button>

					<Link
						to="/catalog"
						className="flex min-h-12 items-center justify-between rounded-xl border bg-card px-4 text-sm transition-colors hover:border-primary"
					>
						<span>Browse all {exercises.length} exercises</span>
						<ChevronRight
							className="size-4 text-muted-foreground"
							aria-hidden
						/>
					</Link>
				</div>

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
										<p className="mt-2 flex gap-4 text-xs text-muted-foreground">
											<span>{session.setCount} sets</span>
											{session.volumeKg > 0 && (
												<span>{formatKg(session.volumeKg)} kg volume</span>
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
			</AppScroll>
		</>
	);
}
