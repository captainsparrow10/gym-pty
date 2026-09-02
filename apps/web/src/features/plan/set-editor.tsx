import { formatKg } from "@gym/shared/domain";
import { Flame, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	type SetParent,
	type SetTarget,
	useAddSetTarget,
	useRemoveSetTarget,
	useUpdateSetTarget,
} from "@/features/plan/set-targets";
import { cn } from "@/lib/utils";

/**
 * A one-line reading of a planned exercise.
 *
 * Collapses identical sets — four sets of eight at 80 reads as "4 × 8 · 80 kg"
 * rather than as the same numbers four times — and spells out the rest, since
 * a ramp is exactly the thing a collapsed summary would hide.
 */
export function summariseSets(sets: SetTarget[]): string {
	const working = sets.filter((set) => !set.warmup);
	if (working.length === 0) return "";

	const shape = (set: SetTarget) =>
		[set.reps ?? "—", set.weightKg ? formatKg(set.weightKg) : null]
			.filter(Boolean)
			.join(" @ ");

	const uniform = working.every(
		(set) =>
			set.reps === working[0].reps && set.weightKg === working[0].weightKg,
	);

	if (uniform) {
		const first = working[0];
		return [
			first.reps
				? `${working.length} × ${first.reps}`
				: `${working.length} sets`,
			first.weightKg ? `${formatKg(first.weightKg)} kg` : null,
		]
			.filter(Boolean)
			.join(" · ");
	}

	return working.map(shape).join(" · ");
}

/**
 * The per-set editor.
 *
 * A plan used to carry one target for the whole exercise, which can only say
 * "every set the same". Ramping sets, a top set with back-offs and a plain
 * "8 at 60, 6 at 70, 4 at 80" all need the sets to differ, and logging already
 * allowed it — every logged set has its own reps and load — so the plan was
 * the only place that could not describe what you were about to do.
 *
 * Each row writes on blur rather than per keystroke: every field is a round
 * trip, and nobody wants a request per digit of "105".
 */
export function SetEditor({
	parent,
	sets,
}: {
	parent: SetParent;
	sets: SetTarget[];
}) {
	const add = useAddSetTarget();
	const update = useUpdateSetTarget();
	const remove = useRemoveSetTarget();

	/** Blank clears the target; anything unparseable leaves it alone. */
	const commit = (
		id: string,
		field: "reps" | "weightKg" | "restSeconds",
		raw: string,
	) => {
		const text = raw.trim().replace(",", ".");
		if (text === "") {
			update.mutate({ id, [field]: null });
			return;
		}
		// Reps and rest are whole; load is not — 2.5 kg plates make 42.5 an
		// ordinary working weight.
		const parsed =
			field === "weightKg" ? Number(text) : Number.parseInt(text, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) return;
		update.mutate({ id, [field]: parsed });
	};

	return (
		<div className="space-y-1.5">
			{sets.map((set, index) => (
				<div key={set.id} className="flex items-center gap-1.5">
					<button
						type="button"
						aria-pressed={set.warmup}
						title={set.warmup ? "Warm-up set" : "Working set"}
						onClick={() => update.mutate({ id: set.id, warmup: !set.warmup })}
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors",
							set.warmup
								? "border-primary/60 text-primary"
								: "text-muted-foreground",
						)}
					>
						{/*
						 * A warm-up is numbered with a flame rather than a number,
						 * because it is not set one of the work — it is excluded from
						 * volume and records everywhere else, and numbering it would
						 * make the working sets read as starting at two.
						 */}
						{set.warmup ? (
							<Flame className="size-3.5" aria-hidden />
						) : (
							sets.filter((s, i) => !s.warmup && i <= index).length
						)}
						<span className="sr-only">
							{set.warmup ? "Warm-up set" : `Set ${index + 1}`}
						</span>
					</button>

					<Field
						label="Reps"
						id={`reps-${set.id}`}
						value={set.reps}
						mode="numeric"
						onCommit={(raw) => commit(set.id, "reps", raw)}
					/>
					<span className="text-xs text-muted-foreground">×</span>
					<Field
						label="Kg"
						id={`kg-${set.id}`}
						value={set.weightKg}
						mode="decimal"
						onCommit={(raw) => commit(set.id, "weightKg", raw)}
					/>
					<Field
						label="Rest (s)"
						id={`rest-${set.id}`}
						value={set.restSeconds}
						mode="numeric"
						onCommit={(raw) => commit(set.id, "restSeconds", raw)}
					/>

					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0 text-muted-foreground"
						aria-label={`Remove set ${index + 1}`}
						onClick={() => remove.mutate(set.id)}
					>
						<X className="size-3.5" aria-hidden />
					</Button>
				</div>
			))}

			<Button
				variant="outline"
				size="sm"
				className="h-9 w-full"
				disabled={add.isPending}
				onClick={() =>
					add.mutate({
						parent,
						position: sets.length,
						// Copies the last set, so building "4 × 8 at 80" is four taps
						// rather than twelve fields.
						copyFrom: sets.at(-1),
					})
				}
			>
				<Plus className="size-3.5" aria-hidden />
				{sets.length === 0 ? "Add a set" : "Add another set"}
			</Button>
		</div>
	);
}

function Field({
	label,
	id,
	value,
	mode,
	onCommit,
}: {
	label: string;
	id: string;
	value: number | null;
	mode: "numeric" | "decimal";
	onCommit: (raw: string) => void;
}) {
	return (
		<label htmlFor={id} className="min-w-0 flex-1">
			<span className="sr-only">{label}</span>
			<Input
				id={id}
				// `decimal` where fractions are real: the iOS numeric keypad has no
				// decimal separator, which would make 52.5 untypeable.
				inputMode={mode}
				// Uncontrolled and committed on blur. Every keystroke would otherwise
				// be a round trip, and the unique-name style round trip on "105" is
				// three wasted requests.
				defaultValue={value ?? ""}
				placeholder={label}
				onBlur={(event) => onCommit(event.target.value)}
				className="h-9 px-1 text-center text-sm"
			/>
		</label>
	);
}
