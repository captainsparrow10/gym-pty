import { exercises } from "@gym/shared/catalog";
import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Info, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AppScroll } from "@/core/ui/app-frame";
import { ExerciseArt } from "@/features/catalog/exercise-art";
import { VideoLink } from "@/features/catalog/video-link";
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
				That exercise does not exist.
			</p>
		</AppScroll>
	),
});

/** Mechanic, spelled out. Anything not compound used to render as "Isolation",
 * which made an isometric hold look like a single-joint accessory lift. */
const MECHANIC_LABEL: Record<string, string> = {
	compound: "Compound",
	isolation: "Isolation",
	isometric: "Isometric",
};

/** Labels for the logging types, which drive the session inputs. */
const TYPE_LABEL: Record<string, string> = {
	weight_reps: "Weight & reps",
	bodyweight_reps: "Bodyweight",
	assisted_bodyweight: "Assisted",
	duration: "Timed",
	distance_duration: "Distance & time",
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
						? `${exercise.name} added to the session`
						: `${exercise.name} is already in the session`,
				);
				navigate({ to: "/session" });
			},
			onError: (error) =>
				toast.error("Could not add exercise", {
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
					<Link to="/catalog" aria-label="Back to exercises">
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

				{/*
				 * Each tag says what kind of fact it is. "Quads · Bodyweight ·
				 * Isometric · Timed" in a row leaves the reader to work out which
				 * word is the muscle and which is the equipment, and the answer is
				 * not always obvious — "Cardio" is equipment here, "Core" is a
				 * muscle.
				 *
				 * The three that correspond to a catalogue filter are links to it.
				 * Mechanic is not filterable, so it stays plain rather than
				 * pretending to be clickable.
				 */}
				<dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					<Fact label="Muscle" to={{ muscle: [exercise.primaryMuscle] }}>
						{exercise.primaryMuscle}
					</Fact>
					<Fact label="Equipment" to={{ equipment: [exercise.equipment] }}>
						{exercise.equipment}
					</Fact>
					<Fact label="Logged as" to={{ type: [exercise.exerciseType] }}>
						{TYPE_LABEL[exercise.exerciseType] ?? exercise.exerciseType}
					</Fact>
					{exercise.mechanic && (
						<Fact label="Mechanic">{MECHANIC_LABEL[exercise.mechanic]}</Fact>
					)}
				</dl>

				{exercise.secondaryMuscles.length > 0 && (
					<Section title="Also works">
						<ul className="flex flex-wrap gap-2">
							{exercise.secondaryMuscles.map((muscle) => (
								<li key={muscle}>
									<Link
										to="/catalog"
										search={{ muscle: [muscle] }}
										className="flex min-h-9 items-center gap-1 rounded-full border bg-card px-3 text-sm transition-colors hover:border-primary"
									>
										{muscle}
										<ChevronRight
											className="size-3.5 text-muted-foreground"
											aria-hidden
										/>
									</Link>
								</li>
							))}
						</ul>
					</Section>
				)}

				<Section title="How to do it">
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
								No instructions for this exercise yet. The animation shows the
								full movement.
							</span>
						</p>
					)}
				</Section>

				{/*
				 * A still drawing shows one frozen instant of something that is a
				 * movement. The link is the honest complement to it, and for the
				 * exercises with no drawing at all it is the only demonstration
				 * there is.
				 */}
				<VideoLink
					name={exercise.name}
					equipment={exercise.equipment}
					className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium transition-colors hover:border-primary"
				/>

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
					{addToSession.isPending ? "Adding…" : "Add to session"}
				</Button>
			</AppScroll>
		</>
	);
}

function Fact({
	label,
	children,
	to,
}: {
	label: string;
	children: React.ReactNode;
	/** Catalogue filter this fact selects, when there is one. */
	to?: { muscle?: string[]; equipment?: string[]; type?: string[] };
}) {
	const body = (
		<>
			<dt className="text-xs uppercase tracking-wide text-muted-foreground">
				{label}
			</dt>
			<dd className="truncate font-medium">{children}</dd>
		</>
	);

	if (!to) {
		return <div className="rounded-lg border bg-card px-3 py-2">{body}</div>;
	}

	return (
		<Link
			to="/catalog"
			search={to}
			className="rounded-lg border bg-card px-3 py-2 transition-colors hover:border-primary"
			aria-label={`Show all ${label.toLowerCase()}: ${children}`}
		>
			{body}
		</Link>
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
