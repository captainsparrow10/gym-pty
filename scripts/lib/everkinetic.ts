/**
 * Parser for everkinetic/data markdown exports (CC BY-SA 4.0).
 *
 * Only steps and mechanic are taken from here. The muscle and equipment
 * taxonomy comes from workout-guide, which is already normalized — everkinetic
 * uses anatomical names ("pectoralis major", "ischiocrural muscles") that would
 * need a lossy mapping.
 *
 * File shape:
 *
 *   # Exercise Name
 *
 *   > One-line description.
 *
 *   ```
 *   id: 0286
 *   type: compound
 *   primary: abdominals
 *   secondary: erector spinae,deltoid
 *   equipment: barbell
 *   ```
 *
 *   ## Steps
 *
 *    - First step.
 *    - Second step.
 *
 *   ## Tips
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Mechanic } from "../../packages/shared/src/catalog/types.ts";

export type EverkineticEntry = {
	id: string;
	name: string;
	description: string;
	mechanic?: Mechanic;
	steps: string[];
};

const MECHANICS = new Set<Mechanic>(["compound", "isolation", "isometric"]);

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function parseMeta(body: string): Map<string, string> {
	const meta = new Map<string, string>();
	const fence = body.match(/```([\s\S]*?)```/);
	if (!fence) return meta;

	for (const line of fence[1].split("\n")) {
		const match = line.match(/^\s*([a-z]+)\s*:\s*(.*?)\s*$/);
		if (match) meta.set(match[1], match[2]);
	}
	return meta;
}

function parseSteps(body: string): string[] {
	// Capture everything between "## Steps" and the next "##" heading.
	const section = body.match(/^##\s+Steps\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/m);
	if (!section) return [];

	return section[1]
		.split("\n")
		.map((line) => line.match(/^\s*-\s+(.*\S)\s*$/)?.[1])
		.filter((step): step is string => Boolean(step));
}

export function parseEverkineticFile(raw: string): EverkineticEntry | null {
	const name = raw.match(/^#\s+(.+?)\s*$/m)?.[1];
	const meta = parseMeta(raw);
	const id = meta.get("id");
	if (!name || !id) return null;

	// `type` is occasionally a list ("compound, isolation"); take the first.
	const rawMechanic = meta.get("type")?.split(",")[0]?.trim() as Mechanic | undefined;

	return {
		id,
		name,
		description: raw.match(/^>\s*(.+?)\s*$/m)?.[1] ?? "",
		mechanic: rawMechanic && MECHANICS.has(rawMechanic) ? rawMechanic : undefined,
		steps: parseSteps(raw),
	};
}

export type EverkineticIndex = {
	byId: Map<string, EverkineticEntry>;
	byName: Map<string, EverkineticEntry>;
};

export function loadEverkinetic(mdDir: string): EverkineticIndex {
	const byId = new Map<string, EverkineticEntry>();
	const byName = new Map<string, EverkineticEntry>();

	for (const file of readdirSync(mdDir)) {
		if (!file.endsWith(".md")) continue;
		const entry = parseEverkineticFile(readFileSync(path.join(mdDir, file), "utf8"));
		if (!entry || entry.steps.length === 0) continue;

		byId.set(entry.id, entry);
		// First writer wins: ids are unique but normalized names can collide.
		const key = normalizeName(entry.name);
		if (!byName.has(key)) byName.set(key, entry);
	}

	return { byId, byName };
}
