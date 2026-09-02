import { exercises } from "@gym/shared/catalog";
import { CalendarCheck, Download } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExerciseArt } from "@/features/exercises/exercise-art";
import { dateFromToday, useUpcomingPlan } from "@/features/plan/queries";
import { useRoutines, weekdayOf } from "@/features/routines/queries";
import { useAddExercise } from "@/features/session/queries";

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);

/**
 * What today was planned to be, offered to the session in progress.
 *
 * The session knew nothing about the plan: you could schedule a routine for
 * Wednesday and plan two extra exercises on top of it, then open the session
 * and be shown an empty list and a search box. Everything the app already knew
 * about the day was one screen away and had to be retyped.
 *
 * Offered rather than applied. Loading it automatically would be wrong the
 * first time you walked into the gym and changed your mind, and there is no
 * undo for a session that filled itself in — this is one tap either way, and
 * the tap that does nothing is the safe one.
 *
 * Both sources are merged and deduplicated: a day can have a scheduled routine
 * and loose exercises at once, and an exercise appearing in both is one
 * exercise.
 */
export function TodayPlan({
	sessionId,
	alreadyIn,
	nextPosition,
}: {
	sessionId: string;
	/** Slugs already in the session, so nothing is offered twice. */
	alreadyIn: string[];
	/** Where the session's list currently ends. */
	nextPosition: number;
}) {
	const { data: routines } = useRoutines();
	const { data: upcoming } = useUpcomingPlan();
	const add = useAddExercise();

	const planned = useMemo(() => {
		const today = dateFromToday(0);
		const weekday = weekdayOf(new Date());
		const seen = new Set(alreadyIn);
		const out: { slug: string; from: string }[] = [];

		for (const routine of routines ?? []) {
			if (!routine.weekdays.includes(weekday)) continue;
			for (const exercise of routine.exercises) {
				if (seen.has(exercise.slug)) continue;
				seen.add(exercise.slug);
				out.push({ slug: exercise.slug, from: routine.name });
			}
		}

		for (const entry of upcoming ?? []) {
			if (entry.date !== today || seen.has(entry.slug)) continue;
			seen.add(entry.slug);
			out.push({ slug: entry.slug, from: "Planned today" });
		}

		return out;
	}, [routines, upcoming, alreadyIn]);

	if (planned.length === 0) return null;

	const loadAll = async () => {
		// Sequential and with an explicit index, not parallel: the plan's order
		// is the order you meant to train in, and `(session, position)` is
		// unique, so parallel inserts would both collide and scramble it.
		for (const [offset, entry] of planned.entries()) {
			await add.mutateAsync({
				sessionId,
				slug: entry.slug,
				position: nextPosition + offset,
			});
		}
		toast.success(
			`${planned.length} ${planned.length === 1 ? "exercise" : "exercises"} loaded from today's plan`,
		);
	};

	return (
		<section className="rounded-xl border border-dashed bg-card">
			<div className="flex items-center gap-3 border-b border-dashed p-3">
				<CalendarCheck className="size-5 shrink-0 text-primary" aria-hidden />
				<div className="min-w-0 flex-1">
					<p className="font-display text-lg font-semibold uppercase tracking-wide">
						Today's plan
					</p>
					<p className="text-sm text-muted-foreground">
						{planned.length} {planned.length === 1 ? "exercise" : "exercises"}{" "}
						waiting. Load them or pick your own.
					</p>
				</div>
				<Button
					className="h-11 shrink-0"
					onClick={loadAll}
					disabled={add.isPending}
				>
					<Download className="size-4" aria-hidden />
					{add.isPending ? "Loading…" : "Load all"}
				</Button>
			</div>

			<ul className="divide-y divide-dashed">
				{planned.map((entry) => (
					<li key={entry.slug} className="flex items-center gap-3 px-3 py-2">
						<ExerciseArt
							slug={entry.slug}
							className="size-9 shrink-0 border-0 bg-transparent"
						/>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm">
								{NAMES.get(entry.slug) ?? entry.slug}
							</span>
							<span className="block truncate text-xs text-muted-foreground">
								{entry.from}
							</span>
						</span>
						<Button
							variant="outline"
							size="sm"
							className="h-9 shrink-0"
							disabled={add.isPending}
							onClick={() =>
								add.mutate({
									sessionId,
									slug: entry.slug,
									position: nextPosition,
								})
							}
						>
							Add
						</Button>
					</li>
				))}
			</ul>
		</section>
	);
}
