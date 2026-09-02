import { exercises } from "@gym/shared/catalog";
import {
	bestOneRepMax,
	exerciseVolume,
	formatDuration,
	formatKg,
	type LoggedSet,
	suggestProgression,
} from "@gym/shared/domain";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Check,
	ClipboardList,
	Pencil,
	Plus,
	Timer,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { SortableItem, SortableList } from "@/core/ui/sortable";
import { ExerciseArt } from "@/features/exercises/exercise-art";
import { useProfile } from "@/features/profile/queries";
import { useRoutines } from "@/features/routines/queries";
import { ExercisePicker } from "@/features/session/exercise-picker";
import {
	type SessionExercise,
	useActiveSession,
	useAddExercise,
	useDeleteSet,
	useDiscardSession,
	useFinishSession,
	useLastPerformance,
	useLogSet,
	useRemoveExercise,
	useReorderSessionExercises,
	useStartSession,
} from "@/features/session/queries";
import { RestTimer } from "@/features/session/rest-timer";
import { TodayPlan } from "@/features/session/today-plan";
import { useWakeLock } from "@/features/session/use-wake-lock";

export const Route = createFileRoute("/_app/session")({
	component: SessionPage,
});

const NAMES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.name]),
);
const TYPES = new Map(
	exercises.map((exercise) => [exercise.slug, exercise.exerciseType]),
);

/**
 * Rest, when nothing else says.
 *
 * Only reached when the profile has no preference either — the column defaults
 * to 90 in Postgres, so in practice this is the value for a client that
 * rendered before the profile query resolved.
 */
const FALLBACK_REST_SECONDS = 90;

function SessionPage() {
	const { data: session, isPending } = useActiveSession();
	const start = useStartSession();
	const finish = useFinishSession();
	const discard = useDiscardSession();
	const addExercise = useAddExercise();
	const reorder = useReorderSessionExercises();
	/*
	 * The number of seconds to count down, or null for not resting. It used to
	 * be a boolean and a constant 90, which is the wrong number in both
	 * directions for most of a workout — twenty curls do not need ninety
	 * seconds and a heavy triple needs three minutes — so the countdown was
	 * something to dismiss rather than something to follow.
	 */
	const [resting, setResting] = useState<number | null>(null);
	/** Overrides the plan for this session only, without rewriting the routine. */
	const [sessionRest, setSessionRest] = useState<number | null>(null);
	const { data: profile } = useProfile();
	const { data: routines } = useRoutines();

	/*
	 * Rest per exercise, from the routine this session was started from.
	 *
	 * Looked up through `sessions.routine_id` rather than by matching names:
	 * two routines can hold the same movement with different rest, and the one
	 * that matters is the one you actually pressed Start on.
	 */
	const routineRest = useMemo(() => {
		const routine = (routines ?? []).find((r) => r.id === session?.routineId);
		return new Map(
			(routine?.exercises ?? []).flatMap((exercise) => {
				// The first set that names a rest speaks for the exercise. Rest is
				// now per set, but the countdown fires once between sets and cannot
				// know which set you just finished, so taking the first stated value
				// is the honest reduction — the per-set numbers are the plan, and
				// the plan is on the routine screen.
				const stated = exercise.sets.find((set) => set.restSeconds !== null);
				return stated ? [[exercise.slug, stated.restSeconds as number]] : [];
			}),
		);
	}, [routines, session?.routineId]);

	const defaultRest =
		sessionRest ?? profile?.restSeconds ?? FALLBACK_REST_SECONDS;
	const restFor = (slug: string) =>
		sessionRest ?? routineRest.get(slug) ?? defaultRest;

	// Held for the whole session, not just the rest countdown: the screen going
	// dark mid-set is the same problem as it going dark mid-rest.
	const wakeLockHeld = useWakeLock(Boolean(session));

	if (isPending) {
		return (
			<>
				<AppHeader title="Session" />
				<AppScroll>
					<div className="h-24 animate-pulse rounded-xl bg-muted" />
				</AppScroll>
			</>
		);
	}

	if (!session) {
		return (
			<>
				<AppHeader title="Session" />
				<AppScroll className="flex flex-col items-center justify-center gap-4 text-center">
					<p className="text-muted-foreground">No session in progress.</p>
					<Button
						onClick={() => start.mutate()}
						disabled={start.isPending}
						className="h-12 px-8"
					>
						{start.isPending ? "Starting…" : "Start training"}
					</Button>
				</AppScroll>
			</>
		);
	}

	const setCount = session.exercises.reduce(
		(total, e) => total + e.sets.length,
		0,
	);

	/*
	 * The routine this came from, when it came from one.
	 *
	 * `sessions.routine_id` was stored from the first migration and shown
	 * nowhere: you pressed Start on Legs and landed on a screen that had
	 * forgotten which routine it was, with no way back to the plan. Editing
	 * belongs to the routine — the session records what happened, and a plan
	 * that rewrote itself from a bad set would stop being a plan — so this is a
	 * link out rather than an editor here.
	 */
	const routine = (routines ?? []).find(
		(entry) => entry.id === session.routineId,
	);

	return (
		<>
			<AppHeader
				title={routine ? routine.name : "Session"}
				action={
					<Button
						variant={setCount > 0 ? "default" : "ghost"}
						size="sm"
						className="h-10"
						onClick={() =>
							setCount > 0
								? finish.mutate({
										id: session.id,
										startedAt: session.startedAt,
									})
								: discard.mutate(session.id)
						}
					>
						{setCount > 0 ? (
							<>
								<Check className="size-4" aria-hidden />
								Finish
							</>
						) : (
							"Discard"
						)}
					</Button>
				}
			/>

			<AppScroll className="space-y-4 pb-40 lg:pb-28">
				{routine && (
					<div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
						<ClipboardList
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden
						/>
						<span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
							Logging <span className="text-foreground">{routine.name}</span>.
							Sets and loads are recorded here; the plan is edited on the
							routine.
						</span>
						<Button
							asChild
							variant="outline"
							size="sm"
							className="h-9 shrink-0"
						>
							<Link to="/routines/$id" params={{ id: routine.id }}>
								<Pencil className="size-3.5" aria-hidden />
								Edit routine
							</Link>
						</Button>
					</div>
				)}

				{/*
				 * Rest for this session, overriding whatever the plan says. Kept
				 * separate from the routine's own value on purpose: changing your
				 * mind about today should not rewrite a routine you will run again
				 * next week. The routine's number is edited on the routine.
				 */}
				<div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
					<span className="flex items-center gap-2 text-sm text-muted-foreground">
						<Timer className="size-4" aria-hidden />
						Rest
					</span>
					{[45, 60, 90, 120, 180].map((option) => (
						<Button
							key={option}
							variant={sessionRest === option ? "default" : "outline"}
							size="sm"
							className="h-9 tabular-nums"
							onClick={() =>
								setSessionRest(sessionRest === option ? null : option)
							}
						>
							{formatDuration(option)}
						</Button>
					))}
					<span className="text-xs text-muted-foreground">
						{sessionRest === null
							? `Following the plan · ${formatDuration(defaultRest)} by default`
							: "This session only"}
					</span>
				</div>

				{/*
				 * What the day was planned to be, offered rather than applied. The
				 * session used to know nothing about the plan, so a routine
				 * scheduled for today and the exercises added to today's date both
				 * had to be retyped here.
				 */}
				<TodayPlan
					sessionId={session.id}
					alreadyIn={session.exercises.map((exercise) => exercise.slug)}
					nextPosition={session.exercises.length}
				/>

				{session.exercises.length === 0 && (
					<p className="py-8 text-center text-muted-foreground">
						Add your first exercise, or load today's plan above.
					</p>
				)}

				{/*
				 * Two columns from lg. A workout is a list of independent cards, so
				 * they tile without losing any ordering the user relies on — the
				 * numbered sets live inside each card.
				 */}
				{/*
				 * The add button lives inside the grid rather than under it. With one
				 * exercise on a wide screen the second column was simply empty; giving
				 * it the add affordance fills the gap with the thing you would reach
				 * for next anyway.
				 */}
				{/*
				 * Numbered, because the order is the point: on a two-column grid
				 * nothing else says whether reading goes across or down. The number
				 * is the answer, and it is what the drag is rearranging.
				 */}
				<SortableList
					items={session.exercises}
					layout="grid"
					onReorder={(next) =>
						reorder.mutate(next.map((exercise) => exercise.id))
					}
					className="grid gap-4 lg:grid-cols-2 lg:items-start xl:grid-cols-3"
				>
					{(exercise, index) => (
						<SortableItem key={exercise.id} id={exercise.id}>
							{(handle) => (
								<ExerciseCard
									exercise={exercise}
									position={index + 1}
									handle={session.exercises.length > 1 ? handle : null}
									restSeconds={restFor(exercise.slug)}
									onLogged={(rest) => setResting(rest)}
								/>
							)}
						</SortableItem>
					)}
				</SortableList>

				{/*
				 * Always the last thing, full width. Sitting it inside the grid filled
				 * the empty cell but put it between exercises, which made the order
				 * ambiguous — a worse problem than the gap it solved.
				 */}
				<ExercisePicker
					onPick={(slug) =>
						addExercise.mutate({
							sessionId: session.id,
							slug,
							position: session.exercises.length,
						})
					}
				>
					<Button variant="outline" className="h-12 w-full">
						<Plus className="size-4" aria-hidden />
						Add exercise
					</Button>
				</ExercisePicker>

				{/*
				 * Only shown when the browser refused the lock, and phrased as what it
				 * means rather than as an API name.
				 */}
				{!wakeLockHeld && (
					<p className="text-center text-xs text-muted-foreground">
						The screen may sleep on its own. Keep it awake so the rest timer can
						sound.
					</p>
				)}
			</AppScroll>

			{resting !== null && (
				<RestTimer seconds={resting} onDismiss={() => setResting(null)} />
			)}
		</>
	);
}

function ExerciseCard({
	exercise,
	position,
	onLogged,
	restSeconds,
	handle,
}: {
	exercise: SessionExercise;
	/** 1-based place in the session. */
	position: number;
	/** Called with the rest this exercise asks for, in seconds. */
	onLogged: (restSeconds: number) => void;
	/** Rest for this exercise: the plan's, or the session's override. */
	restSeconds: number;
	/** Drag handle, or null when there is nothing to reorder. */
	handle?: React.ReactNode;
}) {
	const logSet = useLogSet();
	const deleteSet = useDeleteSet();
	const removeExercise = useRemoveExercise();
	const { data: last } = useLastPerformance(exercise.slug);

	const type = TYPES.get(exercise.slug) ?? "weight_reps";
	const weighted = type === "weight_reps" || type === "assisted_bodyweight";
	/*
	 * 51 of the 304 exercises are timed by definition — planks, hangs, carries
	 * — and `sets.seconds` existed in the schema and was read back everywhere
	 * while nothing in the app ever wrote it.
	 *
	 * The field is offered on every exercise, not only those 51. Timing a set
	 * of squats is a real thing to do, and the catalogue's type says what an
	 * exercise usually is, not what you are allowed to record about it. On a
	 * timed exercise it leads, because there it is the number; elsewhere it
	 * sits last and empty.
	 */
	const timed = type === "duration" || type === "distance_duration";

	/*
	 * Prefilled from the last set of this session, falling back to the last
	 * time this exercise was trained. Retyping the same numbers every set is
	 * the main friction in logging, and most sets repeat the previous one.
	 *
	 * Held as "what the user typed, or null for untouched" rather than seeded
	 * into `useState`. The history arrives from a query, so on the first render
	 * there is nothing to seed with — `useState` keeps that first empty value
	 * for the life of the component and the fields stayed blank for every
	 * exercise not already logged in this session, right beside a line reading
	 * "Last time: 10x50, 10x75, 6x100".
	 *
	 * Deriving instead means the prefill appears when the data does, and stops
	 * the moment the field is edited.
	 */
	const previous = exercise.sets.at(-1) ?? last?.at(-1);
	const [typedReps, setTypedReps] = useState<string | null>(null);
	const [typedWeight, setTypedWeight] = useState<string | null>(null);
	const [typedSeconds, setTypedSeconds] = useState<string | null>(null);

	const reps = typedReps ?? (previous?.reps ? String(previous.reps) : "");
	const weight =
		typedWeight ?? (previous?.weightKg ? String(previous.weightKg) : "");
	const seconds =
		typedSeconds ?? (previous?.seconds ? String(previous.seconds) : "");

	const setReps = setTypedReps;
	const setWeight = setTypedWeight;
	const setSeconds = setTypedSeconds;

	const asSets: LoggedSet[] = exercise.sets.map((set) => ({
		reps: set.reps,
		weightKg: set.weightKg,
		seconds: set.seconds ?? undefined,
		warmup: set.warmup,
	}));
	const volume = exerciseVolume({ slug: exercise.slug, sets: asSets });
	const oneRm = bestOneRepMax(asSets);

	/*
	 * What to put on the bar, from last time rather than from a rule.
	 *
	 * Double progression: reps climb inside a range at a fixed load, and the
	 * load only moves once the top of the range is there on every set. Adding
	 * weight every session is the beginner version and stops working within
	 * weeks. Nothing is suggested when there is no history or no load to add.
	 */
	const next = useMemo(
		() =>
			last && last.length > 0
				? // `seconds` is nullable on the row and optional in the domain, so
					// the null has to be dropped rather than passed through.
					suggestProgression(
						last.map((set) => ({
							reps: set.reps,
							weightKg: set.weightKg,
							seconds: set.seconds ?? undefined,
							warmup: set.warmup,
						})),
					)
				: null,
		[last],
	);

	const submit = () => {
		const parsedReps = Number.parseInt(reps, 10);
		const parsedSeconds = Number.parseInt(seconds, 10);
		const hasReps = Number.isFinite(parsedReps) && parsedReps > 0;
		const hasSeconds = Number.isFinite(parsedSeconds) && parsedSeconds > 0;

		// A timed exercise is complete with a hold and no reps; everything else
		// still needs reps. Requiring both would make a plank unloggable and
		// requiring neither would let an empty tap write a row of zeroes.
		if (!hasReps && !(timed && hasSeconds)) return;

		logSet.mutate(
			{
				loggedExerciseId: exercise.id,
				position: exercise.sets.length,
				set: {
					reps: hasReps ? parsedReps : 0,
					weightKg: Number.parseFloat(weight) || 0,
					seconds: hasSeconds ? parsedSeconds : undefined,
				},
			},
			{
				onSuccess: () => {
					// Back to derived: the set just logged becomes `previous`, so the
					// next set prefills from what actually happened rather than from
					// a stale keystroke.
					setTypedReps(null);
					setTypedWeight(null);
					setTypedSeconds(null);
					onLogged(restSeconds);
				},
			},
		);
	};

	return (
		<section className="rounded-xl border bg-card">
			<header className="flex items-center gap-2 border-b p-3">
				{handle}
				<span
					className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm font-bold tabular-nums"
					aria-hidden
				>
					{position}
				</span>
				<ExerciseArt
					slug={exercise.slug}
					className="size-11 shrink-0 border-0 bg-transparent"
				/>
				<h2 className="min-w-0 flex-1 truncate font-medium">
					<span className="sr-only">{position}. </span>
					{NAMES.get(exercise.slug) ?? exercise.slug}
				</h2>
				<Button
					variant="ghost"
					size="icon"
					className="size-11 shrink-0 text-muted-foreground"
					aria-label={`Remove ${NAMES.get(exercise.slug) ?? exercise.slug} from the session`}
					onClick={() => removeExercise.mutate(exercise.id)}
				>
					<Trash2 className="size-4" aria-hidden />
				</Button>
			</header>

			{exercise.sets.length > 0 && (
				<ol className="divide-y">
					{exercise.sets.map((set, index) => (
						<li
							key={set.id}
							className="flex items-center gap-3 px-3 py-2 text-sm"
						>
							<span className="w-6 shrink-0 text-muted-foreground">
								{index + 1}
							</span>
							<span className="flex-1 font-medium tabular-nums">
								{/* A timed set has no reps to lead with, so the hold does. */}
								{set.reps > 0 &&
									`${set.reps} ${set.reps === 1 ? "rep" : "reps"}`}
								{set.reps > 0 && set.seconds ? " · " : ""}
								{set.seconds ? formatDuration(set.seconds) : ""}
								{set.weightKg > 0 && ` × ${formatKg(set.weightKg)} kg`}
							</span>
							<Button
								variant="ghost"
								size="icon"
								className="size-9 shrink-0 text-muted-foreground"
								aria-label={`Delete set ${index + 1}`}
								onClick={() => deleteSet.mutate(set.id)}
							>
								<Trash2 className="size-3.5" aria-hidden />
							</Button>
						</li>
					))}
				</ol>
			)}

			<div className="flex items-end gap-2 border-t p-3">
				<label htmlFor={`reps-${exercise.id}`} className="flex-1">
					<span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
						Reps
					</span>
					<Input
						id={`reps-${exercise.id}`}
						// Reps are whole numbers, so the digits-only keypad is right here.
						inputMode="numeric"
						value={reps}
						onChange={(event) => setReps(event.target.value.replace(/\D/g, ""))}
						className="h-12 text-center text-lg"
					/>
				</label>

				{weighted && (
					<label htmlFor={`weight-${exercise.id}`} className="flex-1">
						<span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
							Kg
						</span>
						<Input
							id={`weight-${exercise.id}`}
							// `decimal`, not `numeric`: the numeric keypad on iOS has no
							// decimal separator, which makes a 52.5 kg plate untypeable.
							inputMode="decimal"
							value={weight}
							onChange={(event) =>
								setWeight(event.target.value.replace(/[^\d.,]/g, ""))
							}
							className="h-12 text-center text-lg"
						/>
					</label>
				)}

				<label
					htmlFor={`seconds-${exercise.id}`}
					className={timed ? "flex-1" : "w-20 shrink-0"}
				>
					<span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
						Secs
					</span>
					<Input
						id={`seconds-${exercise.id}`}
						inputMode="numeric"
						value={seconds}
						onChange={(event) =>
							setSeconds(event.target.value.replace(/\D/g, ""))
						}
						placeholder="—"
						className="h-12 text-center text-lg"
					/>
				</label>

				<Button
					onClick={submit}
					disabled={logSet.isPending}
					className="h-12 shrink-0 px-5"
				>
					<Timer className="size-4" aria-hidden />
					Log set
				</Button>
			</div>

			{(volume > 0 || last) && (
				<footer className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
					{volume > 0 && <span>Volume {formatKg(volume)} kg</span>}
					{oneRm > 0 && <span>Est. 1RM {formatKg(oneRm)} kg</span>}
					{last && last.length > 0 && (
						<span>
							Last time:{" "}
							{last.map((s) => `${s.reps}×${formatKg(s.weightKg)}`).join(", ")}
						</span>
					)}
					{next && (
						<button
							type="button"
							className="font-medium text-primary hover:underline"
							onClick={() => {
								setReps(String(next.reps));
								setWeight(String(next.weightKg));
							}}
							title="Fill the fields with this"
						>
							{next.action === "add-weight"
								? `Try ${formatKg(next.weightKg)} kg × ${next.reps} (+${formatKg(next.incrementKg)})`
								: `Try ${next.reps} reps at ${formatKg(next.weightKg)} kg`}
						</button>
					)}
				</footer>
			)}
		</section>
	);
}
