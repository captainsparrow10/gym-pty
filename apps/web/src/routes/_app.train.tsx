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
} from "@/features/exercises/muscle-map";
import {
	PublicRoutineList,
	RoutineList,
} from "@/features/routines/routine-list";

const searchSchema = z.object({
	tab: z.enum(["routines", "map"]).optional(),
	view: z.enum(["anterior", "posterior"]).optional(),
	routines: z.enum(["mine", "public"]).optional(),
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

/**
 * Count of exercises per catalog muscle, for the list beside the model.
 *
 * Counted on the catalog vocabulary, not on the model's regions. Counting by
 * region gets both numbers and labels wrong, because the two vocabularies do
 * not line up one to one: "Core" shades both `abs` and `obliques`, so it
 * appeared as two identical rows; and `quadriceps` is claimed by "Quads" and
 * by "Legs" at once, so its row was labelled by whichever of the two came
 * first in the catalog's own ordering, and its count was the sum of both.
 */
const COUNTS = new Map<string, number>();
for (const exercise of exercises) {
	COUNTS.set(
		exercise.primaryMuscle,
		(COUNTS.get(exercise.primaryMuscle) ?? 0) + 1,
	);
}

// Five steps of orange, from barely-worked to heavily covered. Index in this
// array is frequency - 1.
const HEAT = ["#7c2d12", "#9a3412", "#c2410c", "#ea580c", "#f97316"];

function TrainPage() {
	const {
		tab = "routines",
		view = "anterior",
		routines = "mine",
	} = Route.useSearch();
	const navigate = useNavigate();
	const [hovered, setHovered] = useState<string | null>(null);

	const summary = useMemo(
		() =>
			hovered ? { muscle: hovered, count: COUNTS.get(hovered) ?? 0 } : null,
		[hovered],
	);

	/** Catalog muscles, most-covered first. */
	const ranked = useMemo(
		() => [...COUNTS.entries()].sort((a, b) => b[1] - a[1]),
		[],
	);

	const openMuscle = (catalogMuscle: string) =>
		navigate({ to: "/exercises", search: { muscle: [catalogMuscle] } });

	/**
	 * A region on the model can stand for several catalog muscles — it has no
	 * separate latissimus shape, so "Back" and "Lats" share one — which is why
	 * the catalog filter takes a list rather than a single muscle.
	 */
	const openRegion = (region: Muscle) => {
		const catalogMuscles = catalogMusclesFor(region);
		if (catalogMuscles.length === 0) return;
		navigate({ to: "/exercises", search: { muscle: catalogMuscles } });
	};

	return (
		<>
			<AppHeader title="Train" />
			<AppScroll>
				<Tabs
					value={tab}
					onValueChange={(value) =>
						navigate({
							to: "/train",
							search: (prev) => ({ ...prev, tab: value as "routines" | "map" }),
						})
					}
					className="lg:hidden"
				>
					<TabsList
						variant="line"
						className="mb-6 grid h-auto w-full grid-cols-2"
					>
						<TabsTrigger value="routines" className="min-h-11">
							Routines
						</TabsTrigger>
						<TabsTrigger value="map" className="min-h-11">
							By muscle
						</TabsTrigger>
					</TabsList>
				</Tabs>

				{/*
				 * Below lg the tabs decide what is visible. From lg both are shown at
				 * once — the tabs existed only because two panels do not fit at phone
				 * width, and hiding half a screen behind a tab on a monitor is just
				 * wasted space.
				 */}
				{/*
				 * Routines take the majority and the body map a fixed column, rather
				 * than an even split. AppScroll caps content at 5xl, so splitting
				 * that in half left each side around 470px on a 1440px monitor —
				 * phone width, which is exactly what the cards then looked like.
				 * The map is a fixed-aspect figure and does not grow usefully past
				 * its column; a list of routines does.
				 */}
				<div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
					<div className={tab === "routines" ? "" : "hidden lg:block"}>
						<h2 className="mb-3 hidden font-display text-lg font-semibold uppercase tracking-wide lg:block">
							Routines
						</h2>

						<Tabs
							value={routines}
							onValueChange={(value) =>
								navigate({
									to: "/train",
									search: (prev) => ({
										...prev,
										routines: value as "mine" | "public",
									}),
								})
							}
						>
							{/*
							 * "Mine" and "Community", not "Mine" and "Public". Each routine
							 * already carries a Private/Public switch, so a tab called
							 * Public made the same word mean two different things on the
							 * same screen — one about who owns a routine, the other about
							 * who can see it. Your own public routines live under Mine.
							 *
							 * The "line" variant, not the default filled one. The default
							 * paints a solid track behind the tabs that read as a dark slab
							 * cut in behind the cards — and worse, its active trigger takes
							 * a visible border while the inactive one keeps a transparent
							 * one, so the two tabs were never the same shape. An underline
							 * marks the active tab without giving either of them a box.
							 */}
							<TabsList
								variant="line"
								className="mb-6 grid h-auto w-full grid-cols-2"
							>
								<TabsTrigger value="mine" className="min-h-11">
									Mine
								</TabsTrigger>
								<TabsTrigger value="public" className="min-h-11">
									Community
								</TabsTrigger>
							</TabsList>
						</Tabs>

						{routines === "mine" ? <RoutineList /> : <PublicRoutineList />}
					</div>

					<div className={tab === "map" ? "mt-0" : "hidden lg:block"}>
						<h2 className="mb-3 hidden font-display text-lg font-semibold uppercase tracking-wide lg:block">
							Body map
						</h2>
						<p className="mb-4 text-sm text-muted-foreground">
							Tap a muscle to see its exercises.
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
									{option === "anterior" ? "Front" : "Back"}
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
									if ("muscle" in stats) openRegion(stats.muscle);
								}}
								svgStyle={{ width: "100%", cursor: "pointer" }}
							/>
						</div>

						{summary ? (
							<p className="mt-3 text-center text-sm">
								<span className="font-medium">{summary.muscle}</span>{" "}
								<span className="text-muted-foreground">
									— {summary.count} exercises
								</span>
							</p>
						) : (
							<p className="mt-3 text-center text-sm text-muted-foreground">
								Shading shows how many exercises cover each area.
							</p>
						)}

						{/*
						 * The model has no keyboard affordance of its own, so the region list
						 * below is the accessible path to the same filters rather than a
						 * decorative legend.
						 */}
						<h2 className="mt-6 mb-2 font-display text-lg font-semibold uppercase tracking-wide">
							By area
						</h2>
						<ul className="grid grid-cols-2 gap-2">
							{ranked.map(([muscle, count]) => (
								<li key={muscle}>
									<button
										type="button"
										onClick={() => openMuscle(muscle)}
										onFocus={() => setHovered(muscle)}
										onBlur={() => setHovered(null)}
										onMouseEnter={() => setHovered(muscle)}
										onMouseLeave={() => setHovered(null)}
										className="flex min-h-11 w-full items-center justify-between rounded-lg border bg-card px-3 text-left text-sm transition-colors hover:border-primary"
									>
										<span className="truncate">{muscle}</span>
										<span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
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
