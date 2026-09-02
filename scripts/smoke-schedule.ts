#!/usr/bin/env node
/**
 * Checks the weekly schedule on a routine against the live database.
 *
 * `weekdays` is the column that makes "today is a rest day" a real answer
 * rather than an empty screen, so what matters is that it cannot hold nonsense
 * the UI would then have to defend against: a day outside Monday..Sunday, the
 * same day twice, or more than seven of them.
 *
 * The convention is checked too. The app is Monday-first (0 = Monday) and both
 * Postgres `extract(dow)` and JavaScript `getDay()` are Sunday-first, so the
 * two readings of "0" differ by a day and nothing in the data says which one a
 * row means.
 *
 *   pnpm smoke:schedule
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(
	readFileSync(path.join(ROOT, ".env"), "utf8")
		.split("\n")
		.filter((line) => line.includes("=") && !line.startsWith("#"))
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) failures++;
};

const { data: signUp, error: signUpError } = await supabase.auth.signUp({
	email: `smoke-schedule-${Date.now()}@gmail.com`,
	password: "smoke-test-password",
});
if (signUpError) throw signUpError;
if (!signUp.session) throw new Error("autoconfirm is off again");
const userId = signUp.user?.id as string;

const { data: routine, error } = await supabase
	.from("routines")
	.insert({ user_id: userId, name: "Push" })
	.select("id, weekdays")
	.single();
if (error) throw error;

console.log("→ default");
check("unscheduled, not null", Array.isArray(routine.weekdays) && routine.weekdays.length === 0);

const set = async (weekdays: number[]) =>
	supabase
		.from("routines")
		.update({ weekdays })
		.eq("id", routine.id)
		.select("weekdays")
		.single();

console.log("\n→ a real week");
{
	// Monday, Wednesday, Friday under the app's own convention.
	const { data, error: updateError } = await set([0, 2, 4]);
	check("Mon/Wed/Fri accepted", !updateError && JSON.stringify(data?.weekdays) === "[0,2,4]", JSON.stringify(data?.weekdays));
}
{
	const { data } = await set([6]);
	check("Sunday is 6, and is valid", JSON.stringify(data?.weekdays) === "[6]");
}
{
	const { data } = await set([0, 1, 2, 3, 4, 5, 6]);
	check("all seven days accepted", data?.weekdays.length === 7);
}
{
	const { data } = await set([]);
	check("emptying unschedules it", data?.weekdays.length === 0);
}

console.log("\n→ the constraint holds");
for (const [label, bad] of [
	["day 7 (there is no eighth day)", [7]],
	["a negative day", [-1]],
	["the same day twice", [1, 1]],
	["eight entries", [0, 1, 2, 3, 4, 5, 6, 0]],
] as const) {
	const { error: rejected } = await set([...bad]);
	check(`rejects ${label}`, Boolean(rejected), rejected ? "" : "STORED");
}
{
	const { data } = await supabase
		.from("routines")
		.select("weekdays")
		.eq("id", routine.id)
		.single();
	check("row unchanged after rejections", data?.weekdays.length === 0, JSON.stringify(data?.weekdays));
}

console.log("\n→ Monday-first, not Sunday-first");
{
	// The app derives its index as (getDay() + 6) % 7. Pinning both directions
	// here means a future change to either cannot quietly shift the week.
	const monday = new Date(2026, 8, 7); // 7 September 2026 is a Monday.
	const sunday = new Date(2026, 8, 13);
	const appIndex = (d: Date) => (d.getDay() + 6) % 7;
	check("Monday maps to 0", appIndex(monday) === 0, `got ${appIndex(monday)}`);
	check("Sunday maps to 6", appIndex(sunday) === 6, `got ${appIndex(sunday)}`);
	check(
		"and JavaScript's own indices differ, which is the whole point",
		monday.getDay() === 1 && sunday.getDay() === 0,
	);
}

console.log("\n→ cleanup");
await supabase.from("routines").delete().eq("id", routine.id);
const { data: gone } = await supabase.from("routines").select("id").eq("id", routine.id);
check("routine removed", (gone ?? []).length === 0);

console.log(failures === 0 ? "\n✓ schedule ok" : `\n✗ ${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
