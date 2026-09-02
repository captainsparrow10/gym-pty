import { exercises } from "@gym/shared/catalog";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import {
	bodyRegionsFor,
	catalogMusclesFor,
} from "@/features/catalog/muscle-map";
import { RoutineList } from "@/features/routines/routine-list";

const searchSchema = z.object({
	tab: z.enum(["routines", "map"]).optional(),
	view: z.enum(["anterior", "posterior"]).optional(),
});

export const Route = createFileRoute("/_app/train")({
	validateSearch: searchSchema,
	component: TrainPage,
});

/**
 * The model shades a region according to how many entries in `data` name it, so
 * feeding it the whole catalog turns the body into a coverage heat map: the
 * deeper the shade, the more exercises the library has for that region.
 */
const COVERAGE: IExerciseData[] = exercises.flatMap((exercise) => {
	const muscles = bodyRegionsFor(exercise.primaryMuscle);
	return muscles.length > 0 ? [{ name: exercise.name, muscles }] : [];
});

/** Count of exercises per region, for the label under the model. */
const COUNTS = new Map<Muscle, number>();
for (const entry of COVERAGE) {
	for (const muscle of entry.muscles) {
		COUNTS.set(muscle, (COUNTS.get(muscle) ?? 0) + 1);
	}
}

// Five steps of orange, from barely-worked to heavily covered. Index in this
// array is frequency - 1.
const HEAT = ["#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316"];

function TrainPage() {
	const { tab = "routines", view = "anterior" } = Route.useSearch();
	const navigate = useNavigate();
	const [hovered, setHovered] = useState<Muscle | null>(null);

	const summary = useMemo(() => {
		if (!hovered) return null;
		const catalogMuscles = catalogMusclesFor(hovered);
		if (catalogMuscles.length === 0) return null;
		return { catalogMuscles, count: COUNTS.get(hovered) ?? 0 };
	}, [hovered]);

	const openCatalog = (muscle: Muscle) => {
		const catalogMuscles = catalogMusclesFor(muscle);
		if (catalogMuscles.length === 0) return;
		navigate({ to: "/catalog", search: { muscle: catalogMuscles } });
	};

	return (
		<>
			<AppHeader title="Entrenar" />
			<AppScroll>
				<Tabs
					value={tab}
					onValueChange={(value) =>
						navigate({
							to: "/train",
							search: (prev) => ({ ...prev, tab: value as "routines" | "map" }),
						})
					}
					className="mb-4 lg:hidden"
				>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="routines" className="min-h-11">
							Rutinas
						</TabsTrigger>
						<TabsTrigger value="map" className="min-h-11">
							Por músculo
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{/*
				 * Below lg the tabs decide what is visible. From lg both are shown at
				 * once — the tabs existed only because two panels do not fit at phone
				 * width, and hiding half a screen behind a tab on a monitor is just
				 * wasted space.
				 */}
				<div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
					<div className={tab === "routines" ? "" : "hidden lg:block"}>
						<h2 className="mb-3 hidden font-display text-lg font-semibold uppercase tracking-wide lg:block">
							Rutinas
						</h2>
						<RoutineList />
					</div>

					<div className={tab === "map" ? "mt-0" : "hidden lg:block"}>
						<h2 className="mb-3 hidden font-display text-lg font-semibold uppercase tracking-wide lg:block">
							Mapa corporal
						</h2>
						<p className="mb-4 text-sm text-muted-foreground">
							Tocá un músculo para ver sus ejercicios.
						</p>

						<div className="mb-4 grid grid-cols-2 gap-2">
							{(["anterior", "posterior"] as const).map((option) => (
								<Button
									key={option}
									variant={view === option ? "default" : "outline"}
									onClick={() =>
										navigate({ to: "/train", search: { view: option } })
									}
									className="h-11"
								>
									{option === "anterior" ? "Frente" : "Espalda"}
								</Button>
							))}
						</div>

						<div className="rounded-xl border bg-card p-4">
							<Model
								type={view}
								data={COVERAGE}
								bodyColor="var(--color-muted)"
								highlightedColors={HEAT}
								onClick={(stats) => {
									if ("muscle" in stats) openCatalog(stats.muscle);
								}}
								svgStyle={{ width: "100%", cursor: "pointer" }}
							/>
						</div>

						{summary ? (
							<p className="mt-3 text-center text-sm">
								<span className="font-medium">
									{summary.catalogMuscles.join(" · ")}
								</span>{" "}
								<span className="text-muted-foreground">
									— {summary.count} ejercicios
								</span>
							</p>
						) : (
							<p className="mt-3 text-center text-sm text-muted-foreground">
								El tono indica cuántos ejercicios cubre cada zona.
							</p>
						)}

						{/*
						 * The model has no keyboard affordance of its own, so the region list
						 * below is the accessible path to the same filters rather than a
						 * decorative legend.
						 */}
						<h2 className="mt-6 mb-2 font-display text-lg font-semibold uppercase tracking-wide">
							Por zona
						</h2>
						<ul className="grid grid-cols-2 gap-2">
							{[...COUNTS.entries()]
								.sort((a, b) => b[1] - a[1])
								.map(([muscle, count]) => (
									<li key={muscle}>
										<button
											type="button"
											onClick={() => openCatalog(muscle)}
											onFocus={() => setHovered(muscle)}
											onMouseEnter={() => setHovered(muscle)}
											onMouseLeave={() => setHovered(null)}
											className="flex min-h-11 w-full items-center justify-between rounded-lg border bg-card px-3 text-left text-sm transition-colors hover:border-primary"
										>
											<span className="truncate">
												{catalogMusclesFor(muscle)[0]}
											</span>
											<span className="ml-2 shrink-0 text-muted-foreground">
												{count}
											</span>
										</button>
									</li>
								))}
						</ul>
					</div>
				</div>
			</AppScroll>
		</>
	);
}
