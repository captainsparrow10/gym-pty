import { exercises } from "@gym/shared/catalog";
import { formatDuration, formatKg } from "@gym/shared/domain";
import { useNavigate } from "@tanstack/react-router";
import { Globe, Lock, Play, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/core/ui/avatar";
import { SortableItem, SortableList } from "@/core/ui/sortable";
import { ExercisePicker } from "@/features/session/exercise-picker";
import { useActiveSession } from "@/features/session/queries";
import { cn } from "@/lib/utils";
import {
	type Routine,
	type RoutineOwner,
	routineErrorMessage,
	useAddRoutineExercise,
	useCreateRoutine,
	useDeleteRoutine,
	usePublicRoutines,
	useRateRoutine,
	useRemoveRoutineExercise,
	useRenameRoutine,
	useReorderRoutineExercises,
	useRoutineStats,
	useRoutines,
	useSetRoutineVisibility,
	useStartFromRoutine,
} from "./queries";

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);

export function RoutineList() {
	const { data: routines, isPending } = useRoutines();
	const create = useCreateRoutine();
	const [name, setName] = useState("");

	const submit = () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		create.mutate(trimmed, {
			onSuccess: () => setName(""),
			onError: (error: unknown) => toast.error(routineErrorMessage(error)),
		});
	};

	if (isPending) {
		return (
			<div className="space-y-2">
				<div className="h-20 animate-pulse rounded-xl bg-muted" />
				<div className="h-20 animate-pulse rounded-xl bg-muted" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{routines?.length === 0 && (
				<p className="py-6 text-center text-muted-foreground">
					No routines yet. Create one below.
				</p>
			)}

			{routines?.map((routine) => (
				<RoutineCard key={routine.id} routine={routine} />
			))}

			<form
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
				className="flex gap-2"
			>
				<label htmlFor="new-routine" className="sr-only">
					Routine name
				</label>
				<Input
					id="new-routine"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Push, Legs, Full body…"
					className="h-12"
				/>
				<Button
					type="submit"
					disabled={!name.trim() || create.isPending}
					className="h-12 shrink-0"
				>
					<Plus className="size-4" aria-hidden />
					Create
				</Button>
			</form>
		</div>
	);
}

function RoutineCard({
	routine,
	readOnly = false,
	owner,
}: {
	routine: Routine;
	/** True when this is someone else's public routine, browsed rather than owned. */
	readOnly?: boolean;
	owner?: RoutineOwner | null;
}) {
	const navigate = useNavigate();
	const { data: allStats } = useRoutineStats();
	const stats = allStats?.get(routine.id);
	const { data: activeSession } = useActiveSession();
	const addExercise = useAddRoutineExercise();
	const removeExercise = useRemoveRoutineExercise();
	const reorder = useReorderRoutineExercises();
	const remove = useDeleteRoutine();
	const rename = useRenameRoutine();
	const start = useStartFromRoutine();
	const [expanded, setExpanded] = useState(false);

	// Starting a session from someone else's public routine only needs read
	// access to its exercises, which visibility already grants — the session
	// itself is always inserted under the caller's own user_id.
	const startRoutine = () =>
		start.mutate(routine, { onSuccess: () => navigate({ to: "/session" }) });

	return (
		<section className="rounded-xl border bg-card">
			<header className="flex items-center gap-2 p-3">
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					aria-expanded={expanded}
					className="min-w-0 flex-1 text-left"
				>
					<h3 className="truncate font-medium">{routine.name}</h3>
					{owner && (
						<span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
							<Avatar
								icon={owner.avatarIcon}
								color={owner.avatarColor}
								size="sm"
								className="size-4"
							/>
							{owner.displayName ?? "Anonymous"}
						</span>
					)}
					<p className="text-sm text-muted-foreground">
						{routine.exercises.length === 0
							? "No exercises"
							: `${routine.exercises.length} exercises`}
					</p>
				</button>

				<Button
					size="sm"
					className="h-11 shrink-0"
					disabled={routine.exercises.length === 0 || start.isPending}
					onClick={startRoutine}
					// An open session would be replaced, and the one-open-session index
					// would reject the insert anyway, so the reason is stated up front.
					title={
						activeSession ? "You already have a session in progress" : undefined
					}
				>
					<Play className="size-4" aria-hidden />
					Start
				</Button>
			</header>

			{/*
			 * Rating and history sit outside the collapsed state: they are the
			 * reason to open a routine at all, so hiding them behind the toggle
			 * would defeat the point.
			 */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-3 py-2">
				<Rating routine={routine} readOnly={readOnly} />
				{!readOnly && <VisibilityToggle routine={routine} />}
				{stats ? (
					<p className="text-xs text-muted-foreground">
						Last {stats.lastPerformed} · avg {formatKg(stats.averageVolumeKg)}{" "}
						kg · {formatDuration(stats.averageDurationSec)}
					</p>
				) : (
					<p className="text-xs text-muted-foreground">Not performed yet</p>
				)}
			</div>

			{activeSession && routine.exercises.length > 0 && (
				<p className="border-t px-3 py-2 text-xs text-muted-foreground">
					Finish the session in progress before starting this routine.
				</p>
			)}

			{expanded && (
				<div className="border-t">
					{routine.exercises.length > 0 &&
						(readOnly ? (
							<ul className="divide-y">
								{routine.exercises.map((exercise, index) => (
									<li
										key={exercise.id}
										className="flex items-center gap-2 px-3 py-2 text-sm"
									>
										<span className="w-5 shrink-0 text-center tabular-nums text-muted-foreground">
											{index + 1}
										</span>
										<span className="min-w-0 flex-1 truncate">
											{NAMES.get(exercise.slug) ?? exercise.slug}
										</span>
									</li>
								))}
							</ul>
						) : (
							<SortableList
								items={routine.exercises}
								onReorder={(next) =>
									reorder.mutate(next.map((exercise) => exercise.id))
								}
								className="divide-y"
							>
								{(exercise, index) => (
									<SortableItem key={exercise.id} id={exercise.id}>
										{(handle) => (
											<div className="flex items-center gap-1 bg-card pr-2">
												{routine.exercises.length > 1 ? (
													handle
												) : (
													<span className="w-3" />
												)}
												{/* The order of a routine is the routine. */}
												<span className="w-5 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
													{index + 1}
												</span>
												<span className="min-w-0 flex-1 truncate py-2 text-sm">
													{NAMES.get(exercise.slug) ?? exercise.slug}
												</span>
												<Button
													variant="ghost"
													size="icon"
													className="size-9 shrink-0 text-muted-foreground"
													aria-label={`Remove ${NAMES.get(exercise.slug) ?? exercise.slug}`}
													onClick={() => removeExercise.mutate(exercise.id)}
												>
													<Trash2 className="size-3.5" aria-hidden />
												</Button>
											</div>
										)}
									</SortableItem>
								)}
							</SortableList>
						))}

					{!readOnly && (
						<>
							<div className="border-t p-3">
								<label
									htmlFor={`rename-${routine.id}`}
									className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground"
								>
									Name
								</label>
								<div className="flex gap-2">
									<Input
										id={`rename-${routine.id}`}
										defaultValue={routine.name}
										// Committed on blur rather than on every keystroke: a
										// unique-name check is not something to run per character.
										onBlur={(event) => {
											const next = event.target.value.trim();
											if (!next || next === routine.name) {
												event.target.value = routine.name;
												return;
											}
											rename.mutate(
												{ id: routine.id, name: next },
												{
													onError: (error: unknown) => {
														toast.error(routineErrorMessage(error));
														event.target.value = routine.name;
													},
												},
											);
										}}
										className="h-11"
									/>
								</div>
							</div>

							<div className="flex gap-2 border-t p-3">
								<ExercisePicker
									onPick={(slug) =>
										addExercise.mutate({
											routineId: routine.id,
											slug,
											// Positions only have to be unique and ordered, so appending
											// past the highest survives gaps left by deletions.
											position: (routine.exercises.at(-1)?.position ?? -1) + 1,
										})
									}
								>
									<Button variant="outline" className="h-11 flex-1">
										<Plus className="size-4" aria-hidden />
										Add
									</Button>
								</ExercisePicker>

								<Button
									variant="ghost"
									className="h-11 shrink-0 text-destructive hover:text-destructive"
									onClick={() => remove.mutate(routine.id)}
								>
									<Trash2 className="size-4" aria-hidden />
									Delete routine
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</section>
	);
}

/**
 * Private/public switch for one routine.
 *
 * A two-state segmented control rather than a checkbox: "private" and
 * "public" are both things a person actively picks, not an on/off of a single
 * default the way the leaderboard opt-out is.
 */
function VisibilityToggle({ routine }: { routine: Routine }) {
	const setVisibility = useSetRoutineVisibility();

	return (
		<div className="flex items-center overflow-hidden rounded-lg border text-xs">
			{(
				[
					{ value: "private" as const, label: "Private", icon: Lock },
					{ value: "public" as const, label: "Public", icon: Globe },
				] satisfies {
					value: Routine["visibility"];
					label: string;
					icon: typeof Lock;
				}[]
			).map(({ value, label, icon: Icon }) => (
				<button
					key={value}
					type="button"
					aria-pressed={routine.visibility === value}
					disabled={setVisibility.isPending}
					onClick={() =>
						value !== routine.visibility &&
						setVisibility.mutate({ id: routine.id, visibility: value })
					}
					className={cn(
						"flex h-8 items-center gap-1 px-2 transition-colors",
						routine.visibility === value
							? "bg-primary text-primary-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<Icon className="size-3" aria-hidden />
					{label}
				</button>
			))}
		</div>
	);
}

/**
 * Other people's public routines, browsable but not editable.
 *
 * Reuses `RoutineCard` in its read-only mode rather than a second card: the
 * layout — name, exercise count, rating, Start button, expandable exercise
 * list — is identical, only the owner-only controls disappear.
 */
export function PublicRoutineList() {
	const { data: routines, isPending } = usePublicRoutines();

	if (isPending) {
		return (
			<div className="space-y-2">
				<div className="h-20 animate-pulse rounded-xl bg-muted" />
				<div className="h-20 animate-pulse rounded-xl bg-muted" />
			</div>
		);
	}

	if (!routines || routines.length === 0) {
		return (
			<p className="py-6 text-center text-muted-foreground">
				Nobody has made a routine public yet.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{routines.map((routine) => (
				<RoutineCard
					key={routine.id}
					routine={routine}
					readOnly
					owner={routine.owner}
				/>
			))}
		</div>
	);
}

/**
 * Five-star self rating.
 *
 * Real radio inputs, visually hidden behind the star icons, rather than buttons
 * carrying `role="radio"`. These are mutually exclusive values in a group and
 * the platform already has an element that says so — with arrow-key navigation
 * and correct announcement for free.
 *
 * Clicking the current rating clears it. Unrated is a real state, distinct from
 * a low rating, and a radio group has no other way back to it.
 */
function Rating({
	routine,
	readOnly = false,
}: {
	routine: Routine;
	readOnly?: boolean;
}) {
	const rate = useRateRoutine();
	const value = routine.rating ?? 0;

	// Someone else's rating of their own routine is public metadata already
	// visible in the row — showing it makes sense, letting a browser change it
	// does not, so it renders as plain stars rather than a live radio group.
	if (readOnly) {
		return (
			<div
				role="img"
				className="flex items-center gap-0.5"
				aria-label={`Rated ${value} of 5`}
			>
				{[1, 2, 3, 4, 5].map((star) => (
					<Star
						key={star}
						className={cn(
							"size-4",
							star <= value
								? "fill-primary text-primary"
								: "text-muted-foreground",
						)}
						aria-hidden
					/>
				))}
			</div>
		);
	}

	return (
		<fieldset className="flex items-center gap-0.5">
			<legend className="sr-only">Rating for {routine.name}</legend>
			{[1, 2, 3, 4, 5].map((star) => (
				<label
					key={star}
					className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
				>
					<input
						type="radio"
						name={`rating-${routine.id}`}
						value={star}
						checked={value === star}
						onChange={() => rate.mutate({ id: routine.id, rating: star })}
						onClick={() => {
							if (value === star) rate.mutate({ id: routine.id, rating: null });
						}}
						className="sr-only"
					/>
					<span className="sr-only">
						{star} {star === 1 ? "star" : "stars"}
					</span>
					<Star
						className={cn(
							"size-4",
							star <= value && "fill-primary text-primary",
						)}
						aria-hidden
					/>
				</label>
			))}
		</fieldset>
	);
}
