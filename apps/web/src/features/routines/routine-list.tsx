import { exercises } from "@gym/shared/catalog";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExercisePicker } from "@/features/session/exercise-picker";
import { useActiveSession } from "@/features/session/queries";
import {
	type Routine,
	useAddRoutineExercise,
	useCreateRoutine,
	useDeleteRoutine,
	useRemoveRoutineExercise,
	useRoutines,
	useStartFromRoutine,
	useSwapRoutineExercises,
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
		create.mutate(trimmed, { onSuccess: () => setName("") });
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
					Todavía no tenés rutinas. Creá una abajo.
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
					Nombre de la rutina
				</label>
				<Input
					id="new-routine"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Empuje, Pierna, Full body…"
					className="h-12"
				/>
				<Button
					type="submit"
					disabled={!name.trim() || create.isPending}
					className="h-12 shrink-0"
				>
					<Plus className="size-4" aria-hidden />
					Crear
				</Button>
			</form>
		</div>
	);
}

function RoutineCard({ routine }: { routine: Routine }) {
	const navigate = useNavigate();
	const { data: activeSession } = useActiveSession();
	const addExercise = useAddRoutineExercise();
	const removeExercise = useRemoveRoutineExercise();
	const swap = useSwapRoutineExercises();
	const remove = useDeleteRoutine();
	const start = useStartFromRoutine();
	const [expanded, setExpanded] = useState(false);

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
					<p className="text-sm text-muted-foreground">
						{routine.exercises.length === 0
							? "Sin ejercicios"
							: `${routine.exercises.length} ejercicios`}
					</p>
				</button>

				<Button
					size="sm"
					className="h-11 shrink-0"
					disabled={routine.exercises.length === 0 || start.isPending}
					onClick={startRoutine}
					// An open session would be replaced, and the one-open-session index
					// would reject the insert anyway, so the reason is stated up front.
					title={activeSession ? "Ya tenés una sesión abierta" : undefined}
				>
					<Play className="size-4" aria-hidden />
					Empezar
				</Button>
			</header>

			{activeSession && routine.exercises.length > 0 && (
				<p className="border-t px-3 py-2 text-xs text-muted-foreground">
					Terminá la sesión abierta antes de empezar esta rutina.
				</p>
			)}

			{expanded && (
				<div className="border-t">
					{routine.exercises.length > 0 && (
						<ol className="divide-y">
							{routine.exercises.map((exercise, index) => (
								<li
									key={exercise.id}
									className="flex items-center gap-1 px-3 py-2"
								>
									<span className="min-w-0 flex-1 truncate text-sm">
										{NAMES.get(exercise.slug) ?? exercise.slug}
									</span>

									<Button
										variant="ghost"
										size="icon"
										className="size-9 shrink-0 text-muted-foreground"
										disabled={index === 0 || swap.isPending}
										aria-label={`Subir ${NAMES.get(exercise.slug) ?? exercise.slug}`}
										onClick={() =>
											swap.mutate({
												a: { id: exercise.id, position: exercise.position },
												b: {
													id: routine.exercises[index - 1].id,
													position: routine.exercises[index - 1].position,
												},
											})
										}
									>
										<ChevronUp className="size-4" aria-hidden />
									</Button>

									<Button
										variant="ghost"
										size="icon"
										className="size-9 shrink-0 text-muted-foreground"
										disabled={
											index === routine.exercises.length - 1 || swap.isPending
										}
										aria-label={`Bajar ${NAMES.get(exercise.slug) ?? exercise.slug}`}
										onClick={() =>
											swap.mutate({
												a: { id: exercise.id, position: exercise.position },
												b: {
													id: routine.exercises[index + 1].id,
													position: routine.exercises[index + 1].position,
												},
											})
										}
									>
										<ChevronDown className="size-4" aria-hidden />
									</Button>

									<Button
										variant="ghost"
										size="icon"
										className="size-9 shrink-0 text-muted-foreground"
										aria-label={`Quitar ${NAMES.get(exercise.slug) ?? exercise.slug}`}
										onClick={() => removeExercise.mutate(exercise.id)}
									>
										<Trash2 className="size-3.5" aria-hidden />
									</Button>
								</li>
							))}
						</ol>
					)}

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
								Agregar
							</Button>
						</ExercisePicker>

						<Button
							variant="ghost"
							className="h-11 shrink-0 text-destructive hover:text-destructive"
							onClick={() => remove.mutate(routine.id)}
						>
							<Trash2 className="size-4" aria-hidden />
							Borrar rutina
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
