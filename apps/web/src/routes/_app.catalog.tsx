import { exercises, normalizeSearch } from "@gym/shared/catalog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/core/ui/app-frame";
import { ExerciseArt } from "@/features/catalog/exercise-art";
import {
	ActiveFilters,
	activeFilterCount,
	FilterSheet,
	type Filters,
	toggleValue,
} from "@/features/catalog/filter-sheet";

/**
 * Filters live in the URL, not in component state, so a filtered view can be
 * shared, bookmarked and survives a reload or a back navigation.
 *
 * Both filters are lists. The body map needs it: the model has no separate
 * latissimus region, so tapping "upper-back" has to filter on Back, Lats and
 * Upper Back at once.
 */
const searchSchema = z.object({
	q: z.string().optional(),
	equipment: z.array(z.string()).optional(),
	muscle: z.array(z.string()).optional(),
	type: z.array(z.string()).optional(),
});

export const Route = createFileRoute("/_app/catalog")({
	validateSearch: searchSchema,
	component: CatalogPage,
});

/** Pre-normalized haystack per exercise, built once at module load. */
const HAYSTACK = new Map(
	exercises.map((e) => [
		e.slug,
		normalizeSearch(
			[e.name, e.equipment, e.primaryMuscle, ...e.secondaryMuscles].join(" "),
		),
	]),
);

const ROW_HEIGHT = 88;

/**
 * Columns at the current width.
 *
 * A single 88px row spanning a monitor is mostly empty space, so the list
 * becomes a grid. TanStack Virtual calls these lanes and keeps virtualising
 * across them, which matters — 302 rows is past the point where mounting them
 * all costs a visible scroll stutter.
 */
function useLaneCount() {
	const [lanes, setLanes] = useState(1);

	useEffect(() => {
		const query = window.matchMedia("(min-width: 1024px)");
		const wide = window.matchMedia("(min-width: 1536px)");

		const update = () => setLanes(wide.matches ? 3 : query.matches ? 2 : 1);
		update();

		query.addEventListener("change", update);
		wide.addEventListener("change", update);
		return () => {
			query.removeEventListener("change", update);
			wide.removeEventListener("change", update);
		};
	}, []);

	return lanes;
}

function CatalogPage() {
	const { q = "", equipment, muscle, type } = Route.useSearch();
	const navigate = Route.useNavigate();
	const scrollRef = useRef<HTMLDivElement>(null);

	const results = useMemo(() => {
		const tokens = normalizeSearch(q).split(" ").filter(Boolean);

		return exercises.filter((exercise) => {
			if (equipment?.length && !equipment.includes(exercise.equipment))
				return false;
			if (muscle?.length && !muscle.includes(exercise.primaryMuscle))
				return false;
			if (type?.length && !type.includes(exercise.exerciseType)) return false;
			if (tokens.length === 0) return true;

			const haystack = HAYSTACK.get(exercise.slug) ?? "";
			return tokens.every((token) => haystack.includes(token));
		});
	}, [q, equipment, muscle, type]);

	// 302 rows is well past the point where mounting them all costs a visible
	// scroll stutter on a phone.
	const lanes = useLaneCount();

	const virtualizer = useVirtualizer({
		count: results.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 6,
		lanes,
		// There is no scroll element to measure during SSR, so without a seeded
		// rect the server renders an empty list and the first paint is blank.
		// One phone-height viewport is enough to fill the fold.
		initialRect: { width: 480, height: 800 },
	});

	const setFilter = (patch: Record<string, string | string[] | undefined>) =>
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

	const filters: Filters = { muscle, equipment, type };
	const toggleFilter = (group: keyof Filters, value: string) =>
		setFilter({ [group]: toggleValue(filters[group], value) });

	const hasFilters = Boolean(q) || activeFilterCount(filters) > 0;

	return (
		<>
			<AppHeader title="Exercises" />

			<div className="space-y-3 border-b px-4 py-3 lg:px-8">
				<div className="flex gap-2">
					<div className="relative flex-1">
						<Search
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden
						/>
						<Input
							type="search"
							value={q}
							onChange={(event) =>
								setFilter({ q: event.target.value || undefined })
							}
							placeholder="Search exercises…"
							aria-label="Search exercises"
							className="h-11 pl-9"
						/>
					</div>

					<FilterSheet
						filters={filters}
						onToggle={toggleFilter}
						onClear={() => navigate({ search: (prev) => ({ q: prev.q }) })}
						resultCount={results.length}
					/>
				</div>

				<ActiveFilters filters={filters} onToggle={toggleFilter} />

				<div className="flex items-center justify-between">
					<p className="text-sm text-muted-foreground">
						{results.length} of {exercises.length}
					</p>
					{hasFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => navigate({ search: {} })}
							className="h-8"
						>
							<X className="size-3.5" aria-hidden />
							Clear all
						</Button>
					)}
				</div>
			</div>

			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-2 lg:px-8 lg:pb-10"
			>
				{results.length === 0 ? (
					<p className="py-12 text-center text-muted-foreground">
						No exercises match those filters.
					</p>
				) : (
					<div
						className="relative"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((row) => {
							const exercise = results[row.index];
							return (
								<div
									key={exercise.slug}
									className="absolute inset-x-0 top-0 pb-2"
									style={{
										height: row.size,
										transform: `translateY(${row.start}px)`,
									}}
								>
									<ExerciseRow
										slug={exercise.slug}
										name={exercise.name}
										meta={exercise}
									/>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}

function ExerciseRow({
	slug,
	name,
	meta,
}: {
	slug: string;
	name: string;
	meta: { equipment: string; primaryMuscle: string };
}) {
	return (
		<Link
			to="/catalog/$slug"
			params={{ slug }}
			className="flex h-20 items-center gap-3 rounded-xl border bg-card px-3 transition-colors hover:border-primary"
		>
			<ExerciseArt
				slug={slug}
				name={name}
				className="size-14 shrink-0 border-0 bg-transparent"
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate font-medium">{name}</p>
				<p className="truncate text-sm text-muted-foreground">
					{meta.primaryMuscle} · {meta.equipment}
				</p>
			</div>
			<ChevronRight
				className="size-4 shrink-0 text-muted-foreground"
				aria-hidden
			/>
		</Link>
	);
}
