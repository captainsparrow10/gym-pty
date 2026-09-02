#!/usr/bin/env node
/**
 * Checks body measurements against the live database.
 *
 * Every column is nullable on purpose — a row holding only a waist is a
 * perfectly good row — so what matters is that partial writes stay partial,
 * that saving twice on one day corrects rather than duplicates, and that the
 * range checks reject a tape measure reading that cannot be real.
 *
 *   pnpm smoke:body
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
	email: `smoke-body-${Date.now()}@gmail.com`,
	password: "smoke-test-password",
});
if (signUpError) throw signUpError;
if (!signUp.session) throw new Error("autoconfirm is off again");
const userId = signUp.user?.id as string;

const today = new Date().toISOString().slice(0, 10);
const save = (row: Record<string, unknown>) =>
	supabase
		.from("body_measurements")
		.upsert({ user_id: userId, date: today, ...row }, { onConflict: "user_id,date" })
		.select("waist_cm, chest_cm, left_arm_cm, right_arm_cm, body_fat_pct")
		.single();

console.log("→ a partial row is a real row");
{
	const { data, error } = await save({ waist_cm: 84.5 });
	check("waist alone is accepted", !error && Number(data?.waist_cm) === 84.5, String(data?.waist_cm));
	check("chest stays empty, not zero", data?.chest_cm === null);
	check("half a centimetre survives", Number(data?.waist_cm) === 84.5);
}

console.log("\n→ left and right stay apart");
{
	// Averaging them would hide the asymmetry that is often the whole reason
	// someone starts measuring.
	const { data } = await save({ left_arm_cm: 38, right_arm_cm: 39.5 });
	check("both stored independently", Number(data?.left_arm_cm) === 38 && Number(data?.right_arm_cm) === 39.5);
	check("the earlier waist survived", Number(data?.waist_cm) === 84.5);
}

console.log("\n→ saving twice on a day corrects it");
{
	const { data } = await save({ waist_cm: 84 });
	check("waist corrected to 84", Number(data?.waist_cm) === 84);
	const { count } = await supabase
		.from("body_measurements")
		.select("id", { count: "exact", head: true })
		.eq("user_id", userId);
	check("still one row for the day", count === 1, `${count} rows`);
}

console.log("\n→ a field can be cleared without deleting the day");
{
	const { data } = await save({ left_arm_cm: null });
	check("arm cleared", data?.left_arm_cm === null);
	check("the other arm is untouched", Number(data?.right_arm_cm) === 39.5);
}

console.log("\n→ the range checks hold");
for (const [label, row] of [
	["a 500 cm waist", { waist_cm: 500 }],
	["a negative arm", { left_arm_cm: -5 }],
	["0% body fat", { body_fat_pct: 0 }],
	["90% body fat", { body_fat_pct: 90 }],
] as const) {
	const { error } = await save({ ...row });
	check(`rejects ${label}`, Boolean(error), error ? "" : "STORED");
}
{
	const { data } = await supabase
		.from("body_measurements")
		.select("waist_cm")
		.eq("user_id", userId)
		.single();
	check("row unchanged after rejections", Number(data?.waist_cm) === 84);
}

console.log("\n→ another user cannot read it");
{
	const other = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
	const { data: theirs } = await other.auth.signUp({
		email: `smoke-body-other-${Date.now()}@gmail.com`,
		password: "smoke-test-password",
	});
	if (!theirs.session) throw new Error("autoconfirm is off again");
	const { data } = await other.from("body_measurements").select("id");
	// Nothing here is shareable: the leaderboard deals in training volume, and
	// a waist measurement is not that.
	check("measurements are owner-only", (data ?? []).length === 0, `${(data ?? []).length} rows`);
}

console.log("\n→ cleanup");
await supabase.from("body_measurements").delete().eq("user_id", userId);
const { data: gone } = await supabase.from("body_measurements").select("id").eq("user_id", userId);
check("nothing left behind", (gone ?? []).length === 0);

console.log(failures === 0 ? "\n✓ body ok" : `\n✗ ${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
