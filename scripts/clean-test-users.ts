#!/usr/bin/env node
/**
 * Deletes the accounts the smoke scripts leave behind.
 *
 * Each smoke script signs up a throwaway user and deletes the rows it wrote,
 * but not the account: `auth.admin.deleteUser` needs the service role, and the
 * scripts deliberately run on the anon key so they exercise the same RLS the
 * app does. The accounts are therefore harmless but not invisible — the global
 * leaderboard left-joins every public profile, so each one shows up as a real
 * person with zero volume.
 *
 *   pnpm clean:test-users
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(
	readFileSync(path.join(ROOT, ".env"), "utf8")
		.split("\n")
		.filter((line) => line.includes("=") && !line.startsWith("#"))
		.map((line) => [
			line.slice(0, line.indexOf("=")),
			line.slice(line.indexOf("=") + 1).trim(),
		]),
);

const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
if (!serviceRole) {
	console.error("SUPABASE_SERVICE_ROLE is not set. Run via `pnpm clean:test-users`.");
	process.exit(1);
}

const db = createClient(env.VITE_SUPABASE_URL, serviceRole, {
	auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await db.auth.admin.listUsers({ perPage: 500 });
if (error) throw error;

// Only the smoke prefix. Demo lifters belong to `seed:demo --clear`, and
// anything else is a real account.
const doomed = (data.users ?? []).filter((u) => u.email?.startsWith("smoke-"));

for (const user of doomed) {
	const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
	if (deleteError) throw deleteError;
}

console.log(`✓ removed ${doomed.length} test account${doomed.length === 1 ? "" : "s"}`);
