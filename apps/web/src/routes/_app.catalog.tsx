import {
	EQUIPMENT,
	exercises,
	MUSCLES,
	normalizeSearch,
} from "@gym/shared/catalog";
import { createFileRoute } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/core/ui/app-frame";
import { ExerciseArt } from "@/features/catalog/exercise-art";
import { cn } from "@/lib/utils";

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
});

/** Adds or removes one value from a filter list, dropping it when empty. */
function toggle(
	list: string[] | undefined,
	value: string,
): string[] | undefined {
	const next = list?.includes(value)
		? list.filter((item) => item !== value)
		: [...(list ?? []), value];
	return next.length > 0 ? next : undefined;
}

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

function CatalogPage() {
	const { q = "", equipment, muscle } = Route.useSearch();
	const navigate = Route.useNavigate();
	const scrollRef = useRef<HTMLDivElement>(null);

	const results = useMemo(() => {
		const tokens = normalizeSearch(q).split(" ").filter(Boolean);

		return exercises.filter((exercise) => {
			if (equipment?.length && !equipment.includes(exercise.equipment))
				return false;
			if (muscle?.length && !muscle.includes(exercise.primaryMuscle))
				return false;
			if (tokens.length === 0) return true;

			const haystack = HAYSTACK.get(exercise.slug) ?? "";
			return tokens.every((token) => haystack.includes(token));
		});
	}, [q, equipment, muscle]);

	// 302 rows is well past the point where mounting them all costs a visible
	// scroll stutter on a phone.
	const virtualizer = useVirtualizer({
		count: results.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 6,
		// There is no scroll element to measure during SSR, so without a seeded
		// rect the server renders an empty list and the first paint is blank.
		// One phone-height viewport is enough to fill the fold.
		initialRect: { width: 480, height: 800 },
	});

	const setFilter = (patch: Record<string, string | string[] | undefined>) =>
		navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

	const hasFilters = Boolean(q || equipment?.length || muscle?.length);

	return (
		<>
			<AppHeader title="Ejercicios" />

			<div className="space-y-3 border-b px-4 py-3">
				<div className="relative">
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
						placeholder="Buscar ejercicio…"
						aria-label="Buscar ejercicio"
						className="h-11 pl-9"
					/>
				</div>

				<FilterRow
					label="Músculo"
					options={MUSCLES}
					selected={muscle}
					onToggle={(value) => setFilter({ muscle: toggle(muscle, value) })}
				/>
				<FilterRow
					label="Equipo"
					options={EQUIPMENT}
					selected={equipment}
					onToggle={(value) =>
						setFilter({ equipment: toggle(equipment, value) })
					}
				/>

				<div className="flex items-center justify-between">
					<p className="text-sm text-muted-foreground">
						{results.length} de {exercises.length}
					</p>
					{hasFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => navigate({ search: {} })}
							className="h-8"
						>
							<X className="size-3.5" aria-hidden />
							Limpiar
						</Button>
					)}
				</div>
			</div>

			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-2"
			>
				{results.length === 0 ? (
					<p className="py-12 text-center text-muted-foreground">
						Ningún ejercicio coincide con esos filtros.
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

function FilterRow({
	label,
	options,
	selected,
	onToggle,
}: {
	label: string;
	options: string[];
	selected?: string[];
	onToggle: (value: string) => void;
}) {
	return (
		<div>
			<span className="sr-only">{label}</span>
			{/* Horizontal chip strip: the alternative, a native multi-select with 20
			    options, costs two taps and hides the current choice. */}
			<div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
				{options.map((option) => {
					const active = selected?.includes(option) ?? false;
					return (
						<button
							key={option}
							type="button"
							aria-pressed={active}
							onClick={() => onToggle(option)}
							className={cn(
								"shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
								active
									? "border-primary bg-primary text-primary-foreground"
									: "bg-card text-muted-foreground hover:text-foreground",
							)}
						>
							{option}
						</button>
					);
				})}
			</div>
		</div>
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
		<div className="flex h-20 items-center gap-3 rounded-xl border bg-card px-3">
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
		</div>
	);
}
