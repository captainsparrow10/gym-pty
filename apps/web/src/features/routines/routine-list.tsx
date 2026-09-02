import { exercises } from "@gym/shared/catalog";
import {
	estimatedCalories,
	estimatedDurationSec,
	formatDuration,
	formatKg,
} from "@gym/shared/domain";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronDown,
	Clock,
	Globe,
	Lock,
	Play,
	Plus,
	Star,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/core/ui/avatar";
import { SortableItem, SortableList } from "@/core/ui/sortable";
import { useLatestBodyweight } from "@/features/body/queries";
import { ExerciseArt } from "@/features/exercises/exercise-art";
import { SetEditor, summariseSets } from "@/features/plan/set-editor";
import { useProfile } from "@/features/profile/queries";
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
	useSetRoutineWeekdays,
	useStartFromRoutine,
	WEEKDAY_LABELS,
	weekdayOf,
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
			{/*
			 * Creating comes before the list. It was underneath it, which meant the
			 * first thing you want on an empty screen was the last thing on it, and
			 * with several routines you had to scroll past all of them to add one.
			 */}
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

			{routines?.length === 0 && (
				<p className="py-6 text-center text-muted-foreground">
					No routines yet. Name one above to start.
				</p>
			)}

			{routines?.map((routine) => (
				<RoutineCard key={routine.id} routine={routine} linkToDetail />
			))}
		</div>
	);
}

export function RoutineCard({
	routine,
	readOnly = false,
	owner,
	defaultExpanded = false,
	linkToDetail = false,
}: {
	routine: Routine;
	/** True when this is someone else's public routine, browsed rather than owned. */
	readOnly?: boolean;
	owner?: RoutineOwner | null;
	/** Open on its exercises, for the page that is only about this routine. */
	defaultExpanded?: boolean;
	/** In a list, the name opens the routine's own page instead of collapsing. */
	linkToDetail?: boolean;
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
	const { data: profile } = useProfile();
	const { data: weights } = useLatestBodyweight();

	/*
	 * Estimated, not measured, and labelled as such wherever it is shown. It
	 * answers "do I have time for this before work", which the measured average
	 * cannot until the routine has been done at least once.
	 */
	/*
	 * Counted from the planned sets themselves, so a ramp of five is five sets
	 * and a warm-up counts toward the clock — you do warm up, it does take time
	 * — even though it never counts toward volume.
	 */
	const estimate = estimatedDurationSec(
		routine.exercises.map((exercise) => ({
			sets: exercise.sets.length || null,
			restSeconds:
				exercise.sets.find((set) => set.restSeconds !== null)?.restSeconds ??
				null,
		})),
		profile?.restSeconds ?? 90,
	);
	const calories = estimatedCalories(estimate, weights ?? 0);
	const [expanded, setExpanded] = useState(defaultExpanded);

	// Starting a session from someone else's public routine only needs read
	// access to its exercises, which visibility already grants — the session
	// itself is always inserted under the caller's own user_id.
	const startRoutine = () =>
		start.mutate(routine, { onSuccess: () => navigate({ to: "/session" }) });

	return (
		<section className="rounded-xl border bg-card">
			{/*
			 * The name leads, and when you own the routine it is the editable field
			 * itself rather than a label with the input buried at the bottom of the
			 * expanded panel — which is where it used to be, below the exercises it
			 * names.
			 */}
			<header className="flex items-start gap-3 border-b p-3">
				<div className="min-w-0 flex-1">
					{readOnly ? (
						<h3 className="truncate font-medium">{routine.name}</h3>
					) : linkToDetail ? (
						<Link
							to="/routines/$id"
							params={{ id: routine.id }}
							className="block truncate font-display text-lg font-semibold hover:underline"
						>
							{routine.name}
						</Link>
					) : (
						<>
							<label htmlFor={`rename-${routine.id}`} className="sr-only">
								Routine name
							</label>
							<Input
								id={`rename-${routine.id}`}
								defaultValue={routine.name}
								// Committed on blur, not per keystroke: the unique-name check
								// is a round trip and does not belong on every character.
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
								className="-mx-2 h-10 border-transparent bg-transparent px-2 font-display text-lg font-semibold hover:border-input focus:border-input"
							/>
						</>
					)}

					{owner && (
						<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
							<Avatar
								icon={owner.avatarIcon}
								color={owner.avatarColor}
								size="sm"
								className="size-4"
							/>
							{owner.displayName ?? "Anonymous"}
						</span>
					)}

					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						aria-expanded={expanded}
						className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
					>
						{routine.exercises.length === 0
							? "No exercises"
							: `${routine.exercises.length} exercises`}
						<ChevronDown
							className={cn(
								"size-4 transition-transform",
								expanded && "rotate-180",
							)}
							aria-hidden
						/>
					</button>
				</div>

				{/*
				 * A session already running is not replaced — the schema forbids two
				 * open at once with a partial unique index — so the button goes to
				 * the one in progress instead of offering a start that would fail.
				 * It used to sit enabled beside a line telling you it would not work.
				 */}
				{activeSession ? (
					<Button asChild variant="outline" size="sm" className="h-11 shrink-0">
						<Link to="/session">
							<Play className="size-4" aria-hidden />
							Continue
						</Link>
					</Button>
				) : (
					<Button
						size="sm"
						className="h-11 shrink-0"
						disabled={routine.exercises.length === 0 || start.isPending}
						onClick={startRoutine}
						title={
							routine.exercises.length === 0
								? "Add an exercise first"
								: undefined
						}
					>
						<Play className="size-4" aria-hidden />
						{start.isPending ? "Starting…" : "Start"}
					</Button>
				)}
			</header>

			{!readOnly && <WeekdayPicker routine={routine} />}

			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2">
				<Rating routine={routine} readOnly={readOnly} />
				{!readOnly && <VisibilityToggle routine={routine} />}
				{/*
				 * How long it should take and roughly what it costs, both marked as
				 * estimates. Once the routine has been done, the measured average
				 * sits beside them — and where the two disagree the measurement is
				 * the one to believe.
				 */}
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Clock className="size-3.5" aria-hidden />
					<span className="tabular-nums">~{formatDuration(estimate)}</span>
					{calories > 0 && (
						<span className="tabular-nums">· ~{calories} kcal</span>
					)}
				</p>

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
				<p className="border-b px-3 py-2 text-xs text-muted-foreground">
					A session is already in progress. Finish it to start this routine
					fresh.
				</p>
			)}

			{expanded && (
				<div>
					{routine.exercises.length > 0 &&
						(readOnly ? (
							<ul className="divide-y">
								{routine.exercises.map((exercise, index) => (
									<li key={exercise.id}>
										<ExerciseRow exercise={exercise} index={index} readOnly />
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
											<ExerciseRow
												openSets={defaultExpanded}
												exercise={exercise}
												index={index}
												handle={routine.exercises.length > 1 ? handle : null}
												onRemove={() => removeExercise.mutate(exercise.id)}
											/>
										)}
									</SortableItem>
								)}
							</SortableList>
						))}

					{!readOnly && (
						<div className="flex gap-2 border-t p-3">
							<ExercisePicker
								onPick={(slug) =>
									addExercise.mutate({
										routineId: routine.id,
										slug,
										// Positions only have to be unique and ordered, so
										// appending past the highest survives gaps left by
										// deletions.
										position: (routine.exercises.at(-1)?.position ?? -1) + 1,
									})
								}
							>
								<Button variant="outline" className="h-11 flex-1">
									<Plus className="size-4" aria-hidden />
									Add exercise
								</Button>
							</ExercisePicker>

							<Button
								variant="ghost"
								className="h-11 shrink-0 text-destructive hover:text-destructive"
								onClick={() => remove.mutate(routine.id)}
							>
								<Trash2 className="size-4" aria-hidden />
								Delete
							</Button>
						</div>
					)}
				</div>
			)}
		</section>
	);
}

/**
 * One exercise inside a routine.
 *
 * Carries the illustration, because a list of names is harder to read at a
 * glance than a list of pictures — and every other list of exercises in the app
 * already shows one.
 *
 * Sets and reps are editable here. Load deliberately is not: it is the one
 * number that belongs to the person rather than to the plan, and the session
 * already prefills it from the last time the exercise was trained.
 */
function ExerciseRow({
	exercise,
	index,
	handle,
	onRemove,
	readOnly = false,
	openSets = false,
}: {
	exercise: Routine["exercises"][number];
	index: number;
	handle?: React.ReactNode;
	onRemove?: () => void;
	readOnly?: boolean;
	/**
	 * Start with the sets showing.
	 *
	 * Collapsed is right in a list, where the summary is what you scan. On the
	 * routine's own page the sets are the reason you opened it, and one more
	 * tap per exercise to see them is a tap for nothing.
	 */
	openSets?: boolean;
}) {
	const name = NAMES.get(exercise.slug) ?? exercise.slug;

	const [expanded, setExpanded] = useState(openSets);
	const summary = summariseSets(exercise.sets);
	const warmups = exercise.sets.filter((set) => set.warmup).length;

	return (
		<div className="bg-card">
			<div className="flex items-center gap-2 py-2 pr-2">
				{handle ?? <span className="w-3" />}
				{/* The order of a routine is the routine. */}
				<span className="w-5 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
					{index + 1}
				</span>
				<ExerciseArt
					slug={exercise.slug}
					name={name}
					className="size-10 shrink-0 border-0 bg-transparent"
				/>

				{readOnly ? (
					<>
						<span className="min-w-0 flex-1 truncate text-sm">{name}</span>
						<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
							{summary || "—"}
						</span>
					</>
				) : (
					<>
						{/*
						 * The summary is the whole row's label, and it opens the sets.
						 * Three inline inputs could only ever say "every set the same",
						 * which is the limitation this replaced.
						 */}
						<button
							type="button"
							className="min-w-0 flex-1 text-left"
							aria-expanded={expanded}
							onClick={() => setExpanded((open) => !open)}
						>
							<span className="block truncate text-sm">{name}</span>
							<span className="block truncate text-xs tabular-nums text-muted-foreground">
								{summary || "No sets planned"}
								{warmups > 0 &&
									` · ${warmups} warm-up${warmups === 1 ? "" : "s"}`}
							</span>
						</button>
						<ChevronDown
							className={cn(
								"size-4 shrink-0 text-muted-foreground transition-transform",
								expanded && "rotate-180",
							)}
							aria-hidden
						/>
					</>
				)}

				{onRemove && (
					<Button
						variant="ghost"
						size="icon"
						className="size-9 shrink-0 text-muted-foreground"
						aria-label={`Remove ${name}`}
						onClick={onRemove}
					>
						<Trash2 className="size-3.5" aria-hidden />
					</Button>
				)}
			</div>

			{expanded && !readOnly && (
				<div className="pb-3 pl-10 pr-2">
					<SetEditor
						parent={{ routineExerciseId: exercise.id }}
						sets={exercise.sets}
					/>
				</div>
			)}
		</div>
	);
}

/**
 * Private/public switch for one routine.
 *
 * A two-state segmented control rather than a checkbox: "private" and
 * "public" are both things a person actively picks, not an on/off of a single
 * default the way the leaderboard opt-out is.
 */
/**
 * Which weekdays this routine is planned for.
 *
 * Seven toggles rather than a dropdown: the whole set is seven items, they are
 * not mutually exclusive, and the answer people want to see is the shape of
 * the week — which is visible here and would not be behind a menu.
 *
 * A routine with no day is not an error. It is one you keep around and run
 * when you feel like it, and only the scheduled ones make a rest day mean
 * something.
 */
function WeekdayPicker({ routine }: { routine: Routine }) {
	const setWeekdays = useSetRoutineWeekdays();
	const today = weekdayOf(new Date());

	const toggle = (day: number) =>
		setWeekdays.mutate({
			id: routine.id,
			weekdays: routine.weekdays.includes(day)
				? routine.weekdays.filter((d) => d !== day)
				: [...routine.weekdays, day],
		});

	return (
		<fieldset className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
			<legend className="sr-only">Weekdays for {routine.name}</legend>
			<span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
				Days
			</span>
			{WEEKDAY_LABELS.map((label, day) => {
				const on = routine.weekdays.includes(day);
				return (
					<button
						key={label}
						type="button"
						aria-pressed={on}
						onClick={() => toggle(day)}
						className={cn(
							// 44px is the touch minimum, but seven of them across a phone
							// would not fit; 36 with generous spacing is the compromise the
							// rest of the compact controls already make.
							"size-9 rounded-md border text-xs font-medium tabular-nums transition-colors",
							on
								? "border-primary bg-primary text-primary-foreground"
								: "text-muted-foreground hover:border-primary",
							day === today && !on && "border-primary/50",
						)}
					>
						{label.slice(0, 1)}
						<span className="sr-only">{label}</span>
					</button>
				);
			})}
		</fieldset>
	);
}

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
