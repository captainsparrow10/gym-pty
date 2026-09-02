#!/usr/bin/env node
/**
 * Builds the exercise catalog and art artifacts.
 *
 * Run once; the output is committed. Nothing here executes at runtime.
 *
 *   pnpm build:catalog            # all stages
 *   pnpm build:catalog art        # only extract SVG path data
 *   pnpm build:catalog merge      # only rebuild the English catalog
 *
 * Stages:
 *   fetch  sparse-checkout the upstream repositories into .cache/
 *   art    SVG frames        -> apps/web/public/art/<slug>.json
 *   merge  manifest + steps  -> packages/shared/src/catalog/catalog.en.json
 *
 * Later stages (steps generation, Spanish translation, embeddings) need
 * GEMINI_API_KEY and live in build-catalog-ai.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, Exercise, ExerciseArt } from "../packages/shared/src/catalog/types.ts";
import { ART_VIEW_BOX } from "../packages/shared/src/catalog/types.ts";
import { loadEverkinetic, normalizeName } from "./lib/everkinetic.ts";
import { ROOT, SOURCES, fetchSource } from "./lib/sources.ts";
import { everkineticIdOf, loadManifest, readFramePath } from "./lib/workout-guide.ts";

const ART_OUT = path.join(ROOT, "apps/web/public/art");
const CATALOG_OUT = path.join(ROOT, "packages/shared/src/catalog");

const stages = new Set(process.argv.slice(2));
const shouldRun = (stage: string) => stages.size === 0 || stages.has(stage);

const log = (line: string) => process.stdout.write(`${line}\n`);

console.log("→ fetch");
const workoutGuide = fetchSource(SOURCES.workoutGuide);
const everkineticDir = fetchSource(SOURCES.everkinetic);

const manifest = loadManifest(workoutGuide);
console.log(`  manifest: ${manifest.length} exercises`);

if (shouldRun("art")) {
	console.log("→ art");
	mkdirSync(ART_OUT, { recursive: true });

	let bytes = 0;
	for (const exercise of manifest) {
		const frames = exercise.frames
			.slice()
			.sort((a, b) => a.index - b.index)
			.map((frame) => readFramePath(workoutGuide, frame.path));

		const art: ExerciseArt = { slug: exercise.slug, viewBox: ART_VIEW_BOX, frames };
		const json = JSON.stringify(art);
		bytes += json.length;
		writeFileSync(path.join(ART_OUT, `${exercise.slug}.json`), json);
	}
	console.log(
		`  wrote ${manifest.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB total, ` +
			`${Math.round(bytes / manifest.length / 1024)} KB average`,
	);
}

if (shouldRun("merge")) {
	console.log("→ merge");
	const everkinetic = loadEverkinetic(path.join(everkineticDir, "dist/md"));
	console.log(`  everkinetic: ${everkinetic.byId.size} entries with steps`);

	const counts = { "everkinetic-id": 0, "everkinetic-name": 0, generated: 0 };

	// Name matching is exact-on-normalized only, never fuzzy. Token-similarity
	// scoring was measured at a 0.5 Jaccard threshold and produced 24 matches of
	// which only 2-3 were correct: "Overhead Press" matched "JM Press",
	// "Cable Lateral Raise" matched "Seated Rear Lateral Cable Raise", and
	// "Dumbbell Bent Over Row" matched the barbell variant. Serving the wrong
	// instructions for a loaded movement is an injury risk, so unmatched
	// exercises go to the generation stage instead of to a plausible guess.
	const exercises: Exercise[] = manifest.map((source) => {
		const byId = everkineticIdOf(source);
		const matched = byId ? everkinetic.byId.get(byId) : undefined;
		const fallback = matched ? undefined : everkinetic.byName.get(normalizeName(source.name));
		const entry = matched ?? fallback;

		const stepsFrom = matched ? "everkinetic-id" : fallback ? "everkinetic-name" : "generated";
		counts[stepsFrom]++;

		return {
			slug: source.slug,
			name: source.name,
			exerciseType: source.exerciseType,
			equipment: source.equipment,
			primaryMuscle: source.primaryMuscle,
			secondaryMuscles: source.secondaryMuscles,
			isStretch: source.isStretch,
			mechanic: entry?.mechanic,
			// Left empty for the AI stage to fill in.
			steps: entry?.steps ?? [],
			stepsFrom,
			everkineticId: entry?.id,
		};
	});

	/*
	 * Exercises added by hand, merged after the upstream ones.
	 *
	 * The upstream catalogue is strength and calisthenics only — it has no yoga
	 * and no pilates. Anything added here needs its art imported separately with
	 * `pnpm import:drawing`, since it has no upstream illustration to inherit.
	 */
	const extraPath = path.join(ROOT, "scripts/data/extra-exercises.json");
	const extra: Exercise[] = existsSync(extraPath)
		? JSON.parse(readFileSync(extraPath, "utf8")).map((entry: Omit<Exercise, "stepsFrom">) => ({
				...entry,
				stepsFrom: "generated" as const,
			}))
		: [];

	if (extra.length > 0) log(`  plus ${extra.length} added by hand`);

	const catalog: Catalog = {
		locale: "en",
		generatedAt: new Date().toISOString().slice(0, 10),
		exercises: [...exercises, ...extra],
	};

	mkdirSync(CATALOG_OUT, { recursive: true });
	writeFileSync(path.join(CATALOG_OUT, "catalog.en.json"), `${JSON.stringify(catalog, null, 1)}\n`);

	console.log(`  matched by everkinetic id:   ${counts["everkinetic-id"]}`);
	console.log(`  matched by normalized name:  ${counts["everkinetic-name"]}`);
	console.log(`  need generated steps:        ${counts.generated}`);
	console.log(`  wrote catalog.en.json ( exercises)`);
}
