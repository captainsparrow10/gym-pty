import { formatTick } from "@gym/shared/domain";
import { Ruler, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	MEASUREMENTS,
	type MeasurementKey,
	summarise,
	useMeasurements,
	useSaveMeasurements,
} from "@/features/body/queries";
import { parseIso, toIso } from "@/features/progress/queries";
import { cn } from "@/lib/utils";

const SHORT_DATE = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
});

const shortDate = (iso: string) => SHORT_DATE.format(parseIso(iso));

const CHART_CONFIG = {
	value: { label: "Measurement", color: "var(--color-primary)" },
} satisfies ChartConfig;

/**
 * Body measurements: what they are now, how they have moved, and a form.
 *
 * The scale is the one number that moves for reasons that have nothing to do
 * with training — water, salt, the time of day — so the app tracked the only
 * measurement that answers "is this working" least well. A waist that drops
 * two centimetres while the scale sits still is the answer.
 *
 * Nothing here is required. A row with only a waist is a perfectly good row,
 * and the form saves whatever was filled in.
 */
export function Measurements() {
	const { data: history, isPending } = useMeasurements();
	const save = useSaveMeasurements();

	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<Record<string, string> | null>(null);
	const [focus, setFocus] = useState<MeasurementKey>("waistCm");

	const today = toIso(new Date());
	const todaysEntry = (history ?? []).find((entry) => entry.date === today);

	/**
	 * Opens the form on what is already measured for today.
	 *
	 * The row replaces itself on save, so an empty form was a trap: it looked
	 * like a blank slate and it was actually an overwrite, and correcting one
	 * number meant retyping thirteen. Prefilled, "replaces itself" is a
	 * correction rather than a wipe.
	 */
	const openForm = () => {
		const prefill: Record<string, string> = {};
		for (const field of MEASUREMENTS) {
			const value = todaysEntry?.[field.key];
			if (value !== undefined) prefill[field.key] = String(value);
		}
		setDraft(prefill);
		setOpen(true);
	};

	const trends = useMemo(() => summarise(history ?? []), [history]);

	const series = useMemo(
		() =>
			(history ?? [])
				.filter((entry) => entry[focus] !== undefined)
				.map((entry) => ({ date: entry.date, value: entry[focus] as number })),
		[history, focus],
	);

	const submit = () => {
		const values: Partial<Record<MeasurementKey, number | null>> = {};
		let any = false;

		for (const field of MEASUREMENTS) {
			const raw = draft?.[field.key];
			if (raw === undefined) continue;
			const text = raw.trim().replace(",", ".");
			if (text === "") {
				// An emptied field clears that measurement for the day rather than
				// leaving the previous value in place, which is the only way to fix
				// a typo without deleting the whole day.
				values[field.key] = null;
				any = true;
				continue;
			}
			const parsed = Number(text);
			if (Number.isFinite(parsed) && parsed > 0) {
				values[field.key] = parsed;
				any = true;
			}
		}

		if (!any) return;

		save.mutate(
			{ values },
			{
				onSuccess: () => {
					toast.success("Measurements saved");
					// The draft is dropped rather than kept: reopening reads the row
					// back from the server, which is the value that actually landed.
					setDraft(null);
					setOpen(false);
				},
				onError: (error) =>
					toast.error("Could not save", {
						description: (error as Error).message,
					}),
			},
		);
	};

	if (isPending) {
		return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
	}

	return (
		<div className="space-y-4">
			{trends.length === 0 ? (
				<div className="rounded-xl border border-dashed p-6 text-center">
					<Ruler
						className="mx-auto mb-2 size-6 text-muted-foreground"
						aria-hidden
					/>
					<p className="mb-3 text-sm text-muted-foreground">
						Nothing measured yet. The scale moves for reasons that have nothing
						to do with training; a tape measure does not.
					</p>
					<Button variant="outline" className="h-11" onClick={openForm}>
						Take measurements
					</Button>
				</div>
			) : (
				<>
					<dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
						{trends.map((trend) => {
							// Smaller is not universally better and neither is bigger, so
							// the arrow says only which way it moved. Colour would be the
							// app deciding that a bigger waist is a failure and a bigger
							// arm a success, which is not its call to make.
							const Arrow = (trend.change ?? 0) < 0 ? TrendingDown : TrendingUp;
							return (
								<div
									key={trend.key}
									className={cn(
										"rounded-lg border bg-card px-3 py-2 text-left transition-colors",
										focus === trend.key && "border-primary",
									)}
								>
									<button
										type="button"
										className="w-full text-left"
										onClick={() => setFocus(trend.key)}
									>
										<dt className="truncate text-xs uppercase tracking-wide text-muted-foreground">
											{trend.label}
										</dt>
										<dd className="font-display text-lg font-semibold tabular-nums">
											{trend.latest}
											<span className="ml-0.5 text-sm font-normal text-muted-foreground">
												{trend.unit}
											</span>
										</dd>
										{trend.change !== null && trend.change !== 0 && (
											<dd className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
												<Arrow className="size-3" aria-hidden />
												{trend.change > 0 ? "+" : ""}
												{Math.round(trend.change * 10) / 10} {trend.unit} since{" "}
												{shortDate(trend.first)}
											</dd>
										)}
									</button>
								</div>
							);
						})}
					</dl>

					{series.length >= 2 && (
						<div>
							<Select
								value={focus}
								onValueChange={(value) => setFocus(value as MeasurementKey)}
							>
								<SelectTrigger
									aria-label="Measurement to plot"
									className="mb-3 h-11 w-full sm:w-64"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{trends.map((trend) => (
										<SelectItem key={trend.key} value={trend.key}>
											{trend.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							<ChartContainer config={CHART_CONFIG} className="h-56 w-full">
								<LineChart data={series} margin={{ left: 4, right: 8 }}>
									<CartesianGrid vertical={false} strokeOpacity={0.2} />
									<XAxis
										dataKey="date"
										tickFormatter={shortDate}
										tickLine={false}
										axisLine={false}
										interval="preserveStartEnd"
										minTickGap={24}
									/>
									<YAxis
										width={40}
										tickLine={false}
										axisLine={false}
										domain={["dataMin - 2", "dataMax + 2"]}
										tickFormatter={formatTick}
									/>
									<ChartTooltip
										content={
											<ChartTooltipContent
												labelFormatter={(label) => shortDate(String(label))}
											/>
										}
									/>
									<Line
										dataKey="value"
										stroke="var(--color-value)"
										strokeWidth={2}
										dot={{ r: 3 }}
									/>
								</LineChart>
							</ChartContainer>
						</div>
					)}

					{!open && (
						<Button
							variant="outline"
							className="h-11 w-full"
							onClick={openForm}
						>
							<Ruler className="size-4" aria-hidden />
							Take measurements
						</Button>
					)}
				</>
			)}

			{open && (
				<form
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
					className="space-y-3 rounded-xl border bg-card p-3"
				>
					<p className="text-sm text-muted-foreground">
						{todaysEntry
							? "Showing what you measured today. Editing a number corrects it; clearing one removes it."
							: "Fill in only what you measured. Anything left blank stays unmeasured."}
					</p>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
						{MEASUREMENTS.map((field) => (
							<label key={field.key} htmlFor={`m-${field.key}`}>
								<span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
									{field.label}{" "}
									<span className="normal-case">({field.unit})</span>
								</span>
								<Input
									id={`m-${field.key}`}
									// `decimal`, not `numeric`: half a centimetre is a real
									// measurement and the iOS numeric keypad has no separator.
									inputMode="decimal"
									value={draft?.[field.key] ?? ""}
									onChange={(event) =>
										setDraft((previous) => ({
											...(previous ?? {}),
											[field.key]: event.target.value.replace(/[^\d.,]/g, ""),
										}))
									}
									className="h-11 text-center"
								/>
							</label>
						))}
					</div>

					<div className="flex gap-2">
						<Button type="submit" className="h-11" disabled={save.isPending}>
							{save.isPending ? "Saving…" : "Save"}
						</Button>
						<Button
							type="button"
							variant="ghost"
							className="h-11"
							onClick={() => {
								setDraft(null);
								setOpen(false);
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
			)}
		</div>
	);
}
