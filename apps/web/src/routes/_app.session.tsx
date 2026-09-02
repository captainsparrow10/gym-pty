import { exercises } from "@gym/shared/catalog";
import {
	bestOneRepMax,
	exerciseVolume,
	formatKg,
	type LoggedSet,
} from "@gym/shared/domain";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Timer, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import { ExerciseArt } from "@/features/catalog/exercise-art";
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
	useStartSession,
} from "@/features/session/queries";
import { RestTimer } from "@/features/session/rest-timer";
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

const DEFAULT_REST_SECONDS = 90;

function SessionPage() {
	const { data: session, isPending } = useActiveSession();
	const start = useStartSession();
	const finish = useFinishSession();
	const discard = useDiscardSession();
	const addExercise = useAddExercise();
	const [resting, setResting] = useState(false);

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

	return (
		<>
			<AppHeader
				title="Session"
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
								Terminar
							</>
						) : (
							"Discard"
						)}
					</Button>
				}
			/>

			<AppScroll className="space-y-4 pb-40 lg:pb-28">
				{session.exercises.length === 0 && (
					<p className="py-8 text-center text-muted-foreground">
						Add your first exercise to get going.
					</p>
				)}

				{/*
				 * Two columns from lg. A workout is a list of independent cards, so
				 * they tile without losing any ordering the user relies on — the
				 * numbered sets live inside each card.
				 */}
				<div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
					{session.exercises.map((exercise) => (
						<ExerciseCard
							key={exercise.id}
							exercise={exercise}
							onLogged={() => setResting(true)}
						/>
					))}
				</div>

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
						Agregar ejercicio
					</Button>
				</ExercisePicker>

				{/*
				 * Only shown when the browser refused the lock, and phrased as what it
				 * means rather than as an API name.
				 */}
				{!wakeLockHeld && (
					<p className="text-center text-xs text-muted-foreground">
						La pantalla puede apagarse sola. Mantenela encendida para que suene
						el descanso.
					</p>
				)}
			</AppScroll>

			{resting && (
				<RestTimer
					seconds={DEFAULT_REST_SECONDS}
					onDismiss={() => setResting(false)}
				/>
			)}
		</>
	);
}

function ExerciseCard({
	exercise,
	onLogged,
}: {
	exercise: SessionExercise;
	onLogged: () => void;
}) {
	const logSet = useLogSet();
	const deleteSet = useDeleteSet();
	const removeExercise = useRemoveExercise();
	const { data: last } = useLastPerformance(exercise.slug);

	const type = TYPES.get(exercise.slug) ?? "weight_reps";
	const weighted = type === "weight_reps" || type === "assisted_bodyweight";

	// Prefilled from the last set of this session, falling back to the last time
	// this exercise was trained. Retyping the same numbers every set is the main
	// friction in logging, and most sets repeat the previous one.
	const previous = exercise.sets.at(-1) ?? last?.at(-1);
	const [reps, setReps] = useState(String(previous?.reps ?? ""));
	const [weight, setWeight] = useState(
		previous?.weightKg ? String(previous.weightKg) : "",
	);

	const asSets: LoggedSet[] = exercise.sets.map((set) => ({
		reps: set.reps,
		weightKg: set.weightKg,
		seconds: set.seconds ?? undefined,
		warmup: set.warmup,
	}));
	const volume = exerciseVolume({ slug: exercise.slug, sets: asSets });
	const oneRm = bestOneRepMax(asSets);

	const submit = () => {
		const parsedReps = Number.parseInt(reps, 10);
		if (!Number.isFinite(parsedReps) || parsedReps <= 0) return;

		logSet.mutate(
			{
				loggedExerciseId: exercise.id,
				position: exercise.sets.length,
				set: { reps: parsedReps, weightKg: Number.parseFloat(weight) || 0 },
			},
			{ onSuccess: onLogged },
		);
	};

	return (
		<section className="rounded-xl border bg-card">
			<header className="flex items-center gap-3 border-b p-3">
				<ExerciseArt
					slug={exercise.slug}
					className="size-11 shrink-0 border-0 bg-transparent"
				/>
				<h2 className="min-w-0 flex-1 truncate font-medium">
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
							<span className="flex-1 font-medium">
								{set.reps} reps
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
							Última vez:{" "}
							{last.map((s) => `${s.reps}×${formatKg(s.weightKg)}`).join(", ")}
						</span>
					)}
				</footer>
			)}
		</section>
	);
}
