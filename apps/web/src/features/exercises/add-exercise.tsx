import { useNavigate } from "@tanstack/react-router";
import { CalendarPlus, ChevronDown, ListPlus, Play, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { dateFromToday, useAddToDay } from "@/features/plan/queries";
import { parseIso } from "@/features/progress/queries";
import {
	useAddRoutineExercise,
	useCreateRoutine,
	useRoutines,
} from "@/features/routines/queries";
import { useAddToSession } from "@/features/session/queries";

const DAY = new Intl.DateTimeFormat("en", { weekday: "long" });

/**
 * Where an exercise can go from its own page.
 *
 * There used to be one button, "Add to session", which opened a session if
 * none was running and jumped straight to the logging screen. That is the
 * right thing exactly once — when you are standing in the gym about to do it —
 * and the wrong thing every other time you look an exercise up.
 *
 * Four destinations, because they are genuinely different intentions:
 *
 *   the session   doing it now
 *   today         doing it later today, without opening a session yet
 *   another day   deciding Thursday is deadlifts, with no routine involved
 *   a routine     adding it to something you repeat
 *
 * The session stays the primary button because it is the one with a deadline;
 * the rest live behind the split so they do not compete with it.
 */
export function AddExercise({ slug, name }: { slug: string; name: string }) {
	const navigate = useNavigate();
	const addToSession = useAddToSession();
	const addToDay = useAddToDay();
	const addToRoutine = useAddRoutineExercise();
	const createRoutine = useCreateRoutine();
	const { data: routines } = useRoutines();

	const [naming, setNaming] = useState(false);
	const [newName, setNewName] = useState("");

	const startNow = () =>
		addToSession.mutate(slug, {
			onSuccess: (result) => {
				toast.success(
					result.added
						? `${name} added to the session`
						: `${name} is already in the session`,
				);
				navigate({ to: "/session" });
			},
			onError: (error) =>
				toast.error("Could not add exercise", {
					description: (error as Error).message,
				}),
		});

	const planFor = (offset: number) => {
		const date = dateFromToday(offset);
		addToDay.mutate(
			{ slug, date },
			{
				onSuccess: (result) => {
					const when =
						offset === 0
							? "today"
							: offset === 1
								? "tomorrow"
								: DAY.format(parseIso(date));
					toast.success(
						result.added
							? `${name} planned for ${when}`
							: `${name} is already planned for ${when}`,
						{
							description: result.added
								? "No routine needed — it is just on that day."
								: undefined,
						},
					);
				},
				onError: (error) =>
					toast.error("Could not plan it", {
						description: (error as Error).message,
					}),
			},
		);
	};

	const appendTo = (routineId: string, routineName: string, count: number) =>
		addToRoutine.mutate(
			{ routineId, slug, position: count },
			{
				onSuccess: () => toast.success(`${name} added to ${routineName}`),
				onError: (error) =>
					toast.error("Could not add it", {
						description: (error as Error).message,
					}),
			},
		);

	const createAndAdd = () => {
		const trimmed = newName.trim();
		if (!trimmed) return;

		createRoutine.mutate(trimmed, {
			// Returns the id itself, not a row.
			onSuccess: (routineId) => {
				appendTo(routineId, trimmed, 0);
				setNaming(false);
				setNewName("");
			},
			onError: (error) =>
				toast.error("Could not create the routine", {
					description: (error as Error).message,
				}),
		});
	};

	// The next three days by name, so "Thursday" is a choice rather than a date
	// picker for something two taps away.
	const upcoming = [2, 3, 4].map((offset) => ({
		offset,
		label: DAY.format(parseIso(dateFromToday(offset))),
	}));

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Button
					className="h-12 flex-1"
					onClick={startNow}
					disabled={addToSession.isPending}
				>
					<Play className="size-4" aria-hidden />
					{addToSession.isPending ? "Adding…" : "Do it now"}
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="h-12 shrink-0 px-3">
							<Plus className="size-4" aria-hidden />
							<ChevronDown className="size-4" aria-hidden />
							<span className="sr-only">Add {name} somewhere else</span>
						</Button>
					</DropdownMenuTrigger>

					<DropdownMenuContent align="end" className="w-60">
						<DropdownMenuLabel className="flex items-center gap-2">
							<CalendarPlus className="size-3.5" aria-hidden />
							Plan for a day
						</DropdownMenuLabel>
						<DropdownMenuItem onSelect={() => planFor(0)}>
							Today
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => planFor(1)}>
							Tomorrow
						</DropdownMenuItem>
						{upcoming.map((day) => (
							<DropdownMenuItem
								key={day.offset}
								onSelect={() => planFor(day.offset)}
							>
								{day.label}
							</DropdownMenuItem>
						))}

						<DropdownMenuSeparator />

						<DropdownMenuLabel className="flex items-center gap-2">
							<ListPlus className="size-3.5" aria-hidden />
							Add to a routine
						</DropdownMenuLabel>
						{(routines ?? []).length === 0 ? (
							<DropdownMenuItem disabled>No routines yet</DropdownMenuItem>
						) : (
							(routines ?? []).map((routine) => (
								<DropdownMenuItem
									key={routine.id}
									onSelect={() =>
										appendTo(routine.id, routine.name, routine.exercises.length)
									}
								>
									<span className="truncate">{routine.name}</span>
								</DropdownMenuItem>
							))
						)}
						<DropdownMenuItem
							onSelect={(event) => {
								// The menu would close and unmount the field with it.
								event.preventDefault();
								setNaming(true);
							}}
						>
							<Plus className="size-3.5" aria-hidden />
							New routine…
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{naming && (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						createAndAdd();
					}}
					className="flex gap-2"
				>
					<Input
						autoFocus
						value={newName}
						onChange={(event) => setNewName(event.target.value)}
						placeholder="Routine name"
						aria-label="New routine name"
						className="h-11"
					/>
					<Button
						type="submit"
						className="h-11 shrink-0"
						disabled={!newName.trim() || createRoutine.isPending}
					>
						Create and add
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="h-11 shrink-0"
						onClick={() => setNaming(false)}
					>
						Cancel
					</Button>
				</form>
			)}
		</div>
	);
}
