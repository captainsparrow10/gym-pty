import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppScroll } from "@/core/ui/app-frame";
import { useRoutines, useStartFromRoutine } from "@/features/routines/queries";
import { RoutineCard } from "@/features/routines/routine-list";
import { useActiveSession } from "@/features/session/queries";

export const Route = createFileRoute("/_app/routines/$id")({
	component: RoutinePage,
});

/**
 * One routine, on its own screen.
 *
 * Pressing Start used to go straight to the session, which is the right thing
 * when you are already in the gym and the wrong thing every other time: a
 * routine is something you look at, adjust and only then run. The set-by-set
 * editor lives here, where there is room for it, rather than squeezed into a
 * row of a list.
 *
 * The card is the same component the list renders, opened on its exercises.
 * A second editor written for this page would be a second place to fix every
 * bug in the first one.
 */
function RoutinePage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data: routines, isPending } = useRoutines();
	const { data: active } = useActiveSession();
	const start = useStartFromRoutine();

	const routine = routines?.find((entry) => entry.id === id);

	const begin = () => {
		if (!routine) return;
		start.mutate(routine, {
			onSuccess: () => navigate({ to: "/session" }),
			onError: (error) =>
				toast.error("Could not start the routine", {
					description: (error as Error).message,
				}),
		});
	};

	return (
		<>
			<header className="border-b">
				<div className="flex items-center gap-2 px-2 py-2 lg:mx-auto lg:w-full lg:max-w-7xl lg:px-6">
					<Button
						asChild
						variant="ghost"
						size="icon"
						className="size-11 shrink-0"
					>
						<Link to="/train" search={{ tab: "routines", routines: "mine" }}>
							<ArrowLeft className="size-5" aria-hidden />
							<span className="sr-only">Back to routines</span>
						</Link>
					</Button>
					<h1 className="min-w-0 flex-1 truncate font-display text-2xl font-bold uppercase tracking-wide">
						{routine?.name ?? "Routine"}
					</h1>

					{routine &&
						(active ? (
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
						))}
				</div>
			</header>

			<AppScroll className="space-y-4">
				{isPending ? (
					<div className="h-64 animate-pulse rounded-xl bg-muted" />
				) : routine ? (
					<RoutineCard routine={routine} defaultExpanded />
				) : (
					<div className="rounded-xl border border-dashed p-6 text-center">
						<p className="mb-3 text-muted-foreground">
							That routine does not exist, or it is not yours.
						</p>
						<Button asChild variant="outline" className="h-11">
							<Link to="/train" search={{ tab: "routines", routines: "mine" }}>
								Back to routines
							</Link>
						</Button>
					</div>
				)}
			</AppScroll>
		</>
	);
}
