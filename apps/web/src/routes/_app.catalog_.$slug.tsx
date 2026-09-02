import { exercises } from "@gym/shared/catalog";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft, Info, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppScroll } from "@/core/ui/app-frame";
import { ExerciseArt } from "@/features/catalog/exercise-art";
import { useAddToSession } from "@/features/session/queries";

const bySlug = new Map(exercises.map((exercise) => [exercise.slug, exercise]));

export const Route = createFileRoute("/_app/catalog_/$slug")({
	loader: ({ params }) => {
		const exercise = bySlug.get(params.slug);
		if (!exercise) throw notFound();
		return exercise;
	},
	component: ExerciseDetail,
	notFoundComponent: () => (
		<AppScroll>
			<p className="py-12 text-center text-muted-foreground">
				Ese ejercicio no existe.
			</p>
		</AppScroll>
	),
});

/** Spanish labels for the logging types, which drive the session inputs. */
const TYPE_LABEL: Record<string, string> = {
	weight_reps: "Peso y repeticiones",
	bodyweight_reps: "Peso corporal",
	assisted_bodyweight: "Asistido",
	duration: "Por tiempo",
	distance_duration: "Distancia y tiempo",
};

function ExerciseDetail() {
	const exercise = Route.useLoaderData();
	const navigate = useNavigate();
	const addToSession = useAddToSession();

	const add = () =>
		addToSession.mutate(exercise.slug, {
			onSuccess: (result) => {
				toast.success(
					result.added
						? `${exercise.name} agregado a la sesión`
						: `${exercise.name} ya estaba en la sesión`,
				);
				navigate({ to: "/session" });
			},
			onError: (error) =>
				toast.error("No se pudo agregar", {
					description: (error as Error).message,
				}),
		});

	return (
		<>
			<header className="flex items-center gap-2 border-b px-2 py-2">
				<Button
					asChild
					variant="ghost"
					size="icon"
					className="size-11 shrink-0"
				>
					<Link to="/catalog" aria-label="Volver al catálogo">
						<ArrowLeft className="size-5" aria-hidden />
					</Link>
				</Button>
				<h1 className="min-w-0 flex-1 truncate font-display text-xl font-bold uppercase tracking-wide">
					{exercise.name}
				</h1>
			</header>

			<AppScroll className="space-y-5">
				{/* `live` here and nowhere else: the animation belongs on the screen
				    you opened to see how the movement goes. */}
				<ExerciseArt
					slug={exercise.slug}
					name={exercise.name}
					live
					className="aspect-square w-full"
				/>

				<div className="flex flex-wrap gap-2">
					<Tag>{exercise.primaryMuscle}</Tag>
					<Tag>{exercise.equipment}</Tag>
					{exercise.mechanic && (
						<Tag>
							{exercise.mechanic === "compound" ? "Compuesto" : "Aislado"}
						</Tag>
					)}
					<Tag>
						{TYPE_LABEL[exercise.exerciseType] ?? exercise.exerciseType}
					</Tag>
				</div>

				{exercise.secondaryMuscles.length > 0 && (
					<Section title="También trabaja">
						<p className="text-muted-foreground">
							{exercise.secondaryMuscles.join(" · ")}
						</p>
					</Section>
				)}

				<Section title="Cómo se hace">
					{exercise.steps.length > 0 ? (
						<ol className="space-y-3">
							{exercise.steps.map((step, index) => (
								<li key={step} className="flex gap-3">
									<span
										className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
										aria-hidden
									>
										{index + 1}
									</span>
									<span className="flex-1">{step}</span>
								</li>
							))}
						</ol>
					) : (
						/*
						 * Instructions are still being generated for part of the catalogue.
						 * Saying so is better than an empty section, and far better than
						 * inventing steps in the client.
						 */
						<p className="flex gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
							<Info className="mt-0.5 size-4 shrink-0" aria-hidden />
							<span>
								Todavía no hay instrucciones para este ejercicio. La animación
								muestra el movimiento completo.
							</span>
						</p>
					)}
				</Section>

				{/*
				 * Opens a session if none is running, so this is one tap from the
				 * catalogue to logging rather than a trip through another screen.
				 */}
				<Button
					className="h-12 w-full"
					onClick={add}
					disabled={addToSession.isPending}
				>
					<Plus className="size-4" aria-hidden />
					{addToSession.isPending ? "Agregando…" : "Agregar a la sesión"}
				</Button>
			</AppScroll>
		</>
	);
}

function Tag({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground">
			{children}
		</span>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section>
			<h2 className="mb-2 font-display text-lg font-semibold uppercase tracking-wide">
				{title}
			</h2>
			{children}
		</section>
	);
}
