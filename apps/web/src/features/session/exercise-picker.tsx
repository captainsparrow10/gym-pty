import { exercises, normalizeSearch } from "@gym/shared/catalog";
import { useMemo, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { ExerciseArt } from "@/features/catalog/exercise-art";

/** Pre-normalized once, not per keystroke over 302 rows. */
const HAYSTACK = new Map(
	exercises.map((exercise) => [
		exercise.slug,
		normalizeSearch(
			[
				exercise.name,
				exercise.equipment,
				exercise.primaryMuscle,
				...exercise.secondaryMuscles,
			].join(" "),
		),
	]),
);

/**
 * Picks one exercise out of 302.
 *
 * A bottom sheet with a search field rather than a select: this is used
 * one-handed, standing, between sets. Filtering happens here rather than in
 * cmdk's built-in scorer so that searching "banca" or "mancuerna" also matches
 * on equipment and muscle, and so accents never matter.
 */
export function ExercisePicker({
	onPick,
	children,
}: {
	onPick: (slug: string) => void;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const results = useMemo(() => {
		const tokens = normalizeSearch(query).split(" ").filter(Boolean);
		const matched =
			tokens.length === 0
				? exercises
				: exercises.filter((exercise) => {
						const haystack = HAYSTACK.get(exercise.slug) ?? "";
						return tokens.every((token) => haystack.includes(token));
					});

		// Rendering all 302 rows inside a sheet is visibly slow on a phone, and
		// nobody scrolls past the first screen of a search anyway.
		return matched.slice(0, 60);
	}, [query]);

	return (
		<Drawer open={open} onOpenChange={setOpen}>
			<DrawerTrigger asChild>{children}</DrawerTrigger>
			<DrawerContent className="max-h-[85dvh]">
				<DrawerHeader className="pb-2 text-left">
					<DrawerTitle className="font-display uppercase tracking-wide">
						Add exercise
					</DrawerTitle>
					<DrawerDescription>
						Search by name, muscle or equipment.
					</DrawerDescription>
				</DrawerHeader>

				<Command shouldFilter={false} className="bg-transparent">
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Bench press, pull-up, dumbbell…"
					/>
					<CommandList className="max-h-[60dvh]">
						<CommandEmpty>Nothing matches that search.</CommandEmpty>
						<CommandGroup>
							{results.map((exercise) => (
								<CommandItem
									key={exercise.slug}
									value={exercise.slug}
									onSelect={() => {
										onPick(exercise.slug);
										setQuery("");
										setOpen(false);
									}}
									className="min-h-14 gap-3"
								>
									<ExerciseArt
										slug={exercise.slug}
										className="size-10 shrink-0 border-0 bg-transparent"
									/>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">
											{exercise.name}
										</span>
										<span className="block truncate text-sm text-muted-foreground">
											{exercise.primaryMuscle} · {exercise.equipment}
										</span>
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</DrawerContent>
		</Drawer>
	);
}
