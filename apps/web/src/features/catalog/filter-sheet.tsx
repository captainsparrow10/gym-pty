import { EQUIPMENT, exercises, MUSCLES } from "@gym/shared/catalog";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type Filters = {
	muscle?: string[];
	equipment?: string[];
	type?: string[];
};

/** Spanish labels for the logging types, which are English slugs in the data. */
export const TYPE_LABELS: Record<string, string> = {
	weight_reps: "Peso y reps",
	bodyweight_reps: "Peso corporal",
	assisted_bodyweight: "Asistido",
	duration: "Por tiempo",
	distance_duration: "Distancia y tiempo",
};

export const TYPES = [
	...new Set(exercises.map((exercise) => exercise.exerciseType)),
].sort();

/** How many exercises each option would match, so dead ends are visible. */
function countBy(pick: (slug: string) => string) {
	const counts = new Map<string, number>();
	for (const exercise of exercises) {
		const key = pick(exercise.slug);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

const BY_SLUG = new Map(exercises.map((exercise) => [exercise.slug, exercise]));
const MUSCLE_COUNTS = countBy((slug) => BY_SLUG.get(slug)?.primaryMuscle ?? "");
const EQUIPMENT_COUNTS = countBy((slug) => BY_SLUG.get(slug)?.equipment ?? "");
const TYPE_COUNTS = countBy((slug) => BY_SLUG.get(slug)?.exerciseType ?? "");

export function activeFilterCount(filters: Filters): number {
	return (
		(filters.muscle?.length ?? 0) +
		(filters.equipment?.length ?? 0) +
		(filters.type?.length ?? 0)
	);
}

/** Adds or removes one value, dropping the key entirely when it empties. */
export function toggleValue(
	list: string[] | undefined,
	value: string,
): string[] | undefined {
	const next = list?.includes(value)
		? list.filter((item) => item !== value)
		: [...(list ?? []), value];
	return next.length > 0 ? next : undefined;
}

/**
 * Full-height filter sheet.
 *
 * The previous version was two horizontally scrolling chip rows. Everything
 * past the fourth option was off-screen, and nothing suggested the chips were
 * multi-select — so in practice the catalogue could only be filtered one way at
 * a time. This shows every option at once, grouped, with match counts, and the
 * trigger carries a badge so the number of active filters is visible without
 * opening it.
 */
export function FilterSheet({
	filters,
	onToggle,
	onClear,
	resultCount,
}: {
	filters: Filters;
	onToggle: (group: keyof Filters, value: string) => void;
	onClear: () => void;
	resultCount: number;
}) {
	const active = activeFilterCount(filters);

	return (
		<Drawer>
			<DrawerTrigger asChild>
				<Button variant="outline" className="h-11 shrink-0">
					<SlidersHorizontal className="size-4" aria-hidden />
					Filtros
					{active > 0 && (
						<Badge variant="secondary" className="ml-1 tabular-nums">
							{active}
						</Badge>
					)}
				</Button>
			</DrawerTrigger>

			<DrawerContent className="max-h-[88dvh]">
				<DrawerHeader className="text-left">
					<DrawerTitle className="font-display uppercase tracking-wide">
						Filtros
					</DrawerTitle>
				</DrawerHeader>

				<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
					<Group
						title="Músculo"
						options={MUSCLES}
						counts={MUSCLE_COUNTS}
						selected={filters.muscle}
						onToggle={(value) => onToggle("muscle", value)}
					/>
					<Group
						title="Equipo"
						options={EQUIPMENT}
						counts={EQUIPMENT_COUNTS}
						selected={filters.equipment}
						onToggle={(value) => onToggle("equipment", value)}
					/>
					<Group
						title="Tipo"
						options={TYPES}
						counts={TYPE_COUNTS}
						label={(value) => TYPE_LABELS[value] ?? value}
						selected={filters.type}
						onToggle={(value) => onToggle("type", value)}
					/>
				</div>

				<DrawerFooter className="flex-row gap-2 border-t">
					<Button
						variant="outline"
						className="h-12 flex-1"
						onClick={onClear}
						disabled={active === 0}
					>
						<X className="size-4" aria-hidden />
						Limpiar
					</Button>
					<DrawerClose asChild>
						<Button className="h-12 flex-1">
							Ver {resultCount} {resultCount === 1 ? "ejercicio" : "ejercicios"}
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

function Group({
	title,
	options,
	counts,
	selected,
	onToggle,
	label = (value: string) => value,
}: {
	title: string;
	options: string[];
	counts: Map<string, number>;
	selected?: string[];
	onToggle: (value: string) => void;
	label?: (value: string) => string;
}) {
	return (
		<section className="border-b py-4 last:border-b-0">
			<h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				{title}
			</h3>
			{/* Wrapped, not scrolled: every option has to be reachable without
			    discovering a hidden horizontal scroll. */}
			<div className="flex flex-wrap gap-2">
				{options.map((option) => {
					const isActive = selected?.includes(option) ?? false;
					return (
						<button
							key={option}
							type="button"
							aria-pressed={isActive}
							onClick={() => onToggle(option)}
							className={cn(
								"flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
								isActive
									? "border-primary bg-primary text-primary-foreground"
									: "bg-card text-foreground hover:border-primary",
							)}
						>
							{isActive && <Check className="size-3.5" aria-hidden />}
							{label(option)}
							<span
								className={cn(
									"tabular-nums",
									isActive
										? "text-primary-foreground/70"
										: "text-muted-foreground",
								)}
							>
								{counts.get(option) ?? 0}
							</span>
						</button>
					);
				})}
			</div>
		</section>
	);
}

/** Removable chips for what is currently filtering, shown outside the sheet. */
export function ActiveFilters({
	filters,
	onToggle,
}: {
	filters: Filters;
	onToggle: (group: keyof Filters, value: string) => void;
}) {
	const entries: [keyof Filters, string][] = [
		...(filters.muscle ?? []).map(
			(v) => ["muscle", v] as [keyof Filters, string],
		),
		...(filters.equipment ?? []).map(
			(v) => ["equipment", v] as [keyof Filters, string],
		),
		...(filters.type ?? []).map((v) => ["type", v] as [keyof Filters, string]),
	];

	if (entries.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2">
			{entries.map(([group, value]) => (
				<button
					key={`${group}-${value}`}
					type="button"
					onClick={() => onToggle(group, value)}
					aria-label={`Quitar filtro ${value}`}
					className="flex min-h-8 items-center gap-1 rounded-full bg-primary px-3 text-sm text-primary-foreground"
				>
					{group === "type" ? (TYPE_LABELS[value] ?? value) : value}
					<X className="size-3.5" aria-hidden />
				</button>
			))}
		</div>
	);
}
