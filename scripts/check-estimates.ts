#!/usr/bin/env node
/**
 * Checks the two estimates against numbers worked out by hand.
 *
 * Duration and calories are inferences, not measurements, which makes them
 * easy to get subtly wrong and impossible to notice: a plan that says 47
 * minutes when it should say 38 looks just as plausible. So the expected
 * values here are computed on paper and written as literals — asserting
 * against the function's own output would only prove it is consistent with
 * itself.
 *
 *   pnpm check:estimates
 */

import {
	estimatedCalories,
	estimatedDurationSec,
	formatDuration,
	suggestProgression,
} from "../packages/shared/src/domain/index.ts";

let failures = 0;
const check = (label: string, actual: number, expected: number, detail = "") => {
	const ok = Math.abs(actual - expected) < 0.5;
	console.log(`  ${ok ? "✓" : "✗"} ${label}  ${actual}${ok ? "" : ` (expected ${expected})`}${detail ? `  ${detail}` : ""}`);
	if (!ok) failures++;
};

console.log("→ duration");
{
	// One exercise, 4 sets, 90 s rest.
	//   work  = 4 x 40                 = 160
	//   rest  = (4 - 1) x 90           = 270
	//   total                          = 430 s = 7:10
	check(
		"4 sets at 90 s rest",
		estimatedDurationSec([{ sets: 4, restSeconds: 90 }], 90),
		430,
		formatDuration(estimatedDurationSec([{ sets: 4, restSeconds: 90 }], 90)),
	);
}
{
	// A single set has no rest after it: you do not rest, you leave.
	check("1 set rests zero times", estimatedDurationSec([{ sets: 1, restSeconds: 180 }], 90), 40);
}
{
	// Null sets fall back to 3, null rest to the default passed in.
	//   3 x 40 + 2 x 60 = 120 + 120 = 240
	check("unspecified falls back", estimatedDurationSec([{ sets: null, restSeconds: null }], 60), 240);
}
{
	// A five-exercise push day: 4+3+3+3+3 = 16 sets, 90 s rest throughout.
	//   work = 16 x 40 = 640
	//   rest = (3 + 2 + 2 + 2 + 2) x 90 = 11 x 90 = 990
	//   total = 1630 s = 27:10
	const day = [4, 3, 3, 3, 3].map((sets) => ({ sets, restSeconds: 90 }));
	const total = estimatedDurationSec(day, 90);
	check("a five-exercise push day", total, 1630, formatDuration(total));
}
{
	// Rest per exercise is respected individually, not averaged:
	//   heavy: 5 sets, 180 s -> 5x40 + 4x180 = 200 + 720 = 920
	//   light: 3 sets,  45 s -> 3x40 + 2x45  = 120 +  90 = 210
	//   total = 1130
	check(
		"per-exercise rest, not an average",
		estimatedDurationSec(
			[
				{ sets: 5, restSeconds: 180 },
				{ sets: 3, restSeconds: 45 },
			],
			90,
		),
		1130,
	);
}
check("an empty plan takes no time", estimatedDurationSec([], 90), 0);

console.log("\n→ calories");
{
	// MET 4.5 x 80 kg x 1 h = 360 kcal.
	check("80 kg for an hour", estimatedCalories(3600, 80), 360);
	// Half the time, half the energy.
	check("80 kg for 30 min", estimatedCalories(1800, 80), 180);
	// Twice the mass, twice the energy.
	check("160 kg for an hour", estimatedCalories(3600, 160), 720);
	// 4.5 x 80 x (1630/3600) = 163.0
	check("the push day above, at 80 kg", estimatedCalories(1630, 80), 163);
}
check("no session, no calories", estimatedCalories(0, 80), 0);
check("no bodyweight, no guess", estimatedCalories(3600, 0), 0);


/** Prints an already-formatted line and counts the cross, if there is one. */
const line = (text: string) => {
	console.log(text);
	if (text.includes("✗")) failures++;
};

console.log("\n→ progression");
{
	const p = (sets: { reps: number; weightKg: number; warmup?: boolean }[]) =>
		suggestProgression(sets);

	// Every top set at 10 reps clears the range: load goes up by 2.5 and reps
	// restart at the bottom of the range.
	const cleared = p([
		{ reps: 10, weightKg: 60 },
		{ reps: 10, weightKg: 60 },
		{ reps: 10, weightKg: 60 },
	]);
	line(
		`  ${cleared?.action === "add-weight" && cleared.weightKg === 62.5 && cleared.reps === 6 ? "✓" : "✗"} cleared the range → 62.5 kg x 6  (${cleared?.action} ${cleared?.weightKg}x${cleared?.reps})`,
	);

	// One set short: hold the load, chase one more rep on the weakest set.
	const short = p([
		{ reps: 10, weightKg: 60 },
		{ reps: 8, weightKg: 60 },
		{ reps: 7, weightKg: 60 },
	]);
	line(
		`  ${short?.action === "add-reps" && short.weightKg === 60 && short.reps === 8 ? "✓" : "✗"} one set short → 60 kg x 8  (${short?.action} ${short?.weightKg}x${short?.reps})`,
	);

	// A lighter back-off set is not evidence about the top set.
	const backoff = p([
		{ reps: 10, weightKg: 60 },
		{ reps: 10, weightKg: 60 },
		{ reps: 15, weightKg: 40 },
	]);
	line(
		`  ${backoff?.action === "add-weight" && backoff.weightKg === 62.5 ? "✓" : "✗"} back-off sets ignored → 62.5 kg  (${backoff?.action} ${backoff?.weightKg})`,
	);

	// Warm-ups are not evidence either.
	const warm = p([
		{ reps: 12, weightKg: 30, warmup: true },
		{ reps: 9, weightKg: 60 },
	]);
	line(
		`  ${warm?.action === "add-reps" && warm.weightKg === 60 ? "✓" : "✗"} warm-ups ignored → 60 kg  (${warm?.action} ${warm?.weightKg})`,
	);

	line(`  ${p([]) === null ? "✓" : "✗"} no history → no suggestion`);
	line(
		`  ${p([{ reps: 12, weightKg: 0 }]) === null ? "✓" : "✗"} unweighted → no suggestion`,
	);
}

console.log(failures === 0 ? "\n✓ estimates ok" : `\n✗ ${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
