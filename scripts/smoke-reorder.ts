#!/usr/bin/env node
/**
 * Checks arbitrary reordering against the unique (parent, position) index.
 *
 * A drag can move an item any distance, not just swap neighbours, so the whole
 * list is rewritten. Both tables carry a unique constraint on the position, and
 * writing the new order directly collides — this proves the parking approach
 * survives the cases a swap-only test would miss.
 *
 *   pnpm smoke:reorder
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")
  .filter(l => l.includes("=") && !l.startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const check = (l: string, ok: boolean, d = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${l}${d ? "  " + d : ""}`);
  if (!ok) process.exitCode = 1;
};

const { data: up } = await sb.auth.signUp({
  email: `smoke-${Date.now()}@gmail.com`, password: "smoke-test-password" });
const userId = up!.user!.id;

const { data: session } = await sb.from("sessions")
  .insert({ user_id: userId }).select("id").single();

const slugs = ["bench-press", "overhead-press", "tricep-pushdown", "cable-fly", "push-up"];
await sb.from("logged_exercises").insert(
  slugs.map((s, position) => ({ session_id: session!.id, exercise_slug: s, position })));

const read = async () => {
  const { data } = await sb.from("logged_exercises")
    .select("id, exercise_slug, position").eq("session_id", session!.id).order("position");
  return data ?? [];
};

// La misma función que usa la app
async function reorderPositions(ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const { error } = await sb.from("logged_exercises").update({ position: -(i + 1) }).eq("id", id);
    if (error) throw error;
  }
  for (const [i, id] of ids.entries()) {
    const { error } = await sb.from("logged_exercises").update({ position: i }).eq("id", id);
    if (error) throw error;
  }
}
const move = <T,>(a: T[], from: number, to: number) => {
  const n = a.slice(); const [m] = n.splice(from, 1); n.splice(to, 0, m); return n;
};

let rows = await read();
check("5 exercises in order", rows.map(r => r.exercise_slug).join() === slugs.join());

console.log("\n→ move last to first");
let next = move(rows, 4, 0);
await reorderPositions(next.map(r => r.id));
rows = await read();
check("push-up leads", rows[0].exercise_slug === "push-up", rows.map(r => r.exercise_slug).join(" "));
check("positions are 0..4 with no gaps",
  rows.every((r, i) => r.position === i), rows.map(r => r.position).join(","));

console.log("\n→ move first to middle");
next = move(rows, 0, 2);
await reorderPositions(next.map(r => r.id));
rows = await read();
check("push-up is third", rows[2].exercise_slug === "push-up", rows.map(r => r.exercise_slug).join(" "));
check("positions still contiguous", rows.every((r, i) => r.position === i));

console.log("\n→ full reverse");
next = rows.slice().reverse();
await reorderPositions(next.map(r => r.id));
const reversed = await read();
check("order is exactly reversed",
  reversed.map(r => r.exercise_slug).join() === rows.map(r => r.exercise_slug).reverse().join(),
  reversed.map(r => r.exercise_slug).join(" "));

console.log("\n→ a direct write still collides");
const { error: collision } = await sb.from("logged_exercises")
  .update({ position: reversed[1].position }).eq("id", reversed[0].id);
check("the unique index is really there", collision !== null, collision?.code ?? "");

await sb.from("sessions").delete().eq("id", session!.id);
console.log(`\n${process.exitCode ? "failures above" : "all green"}`);
