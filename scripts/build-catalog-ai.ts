#!/usr/bin/env node
/**
 * Fills in the parts of the catalog that need a model, and builds the
 * retrieval vectors.
 *
 *   pnpm build:catalog:ai            # steps then embeddings
 *   pnpm build:catalog:ai steps      # instructions and Spanish translation
 *   pnpm build:catalog:ai embed      # retrieval vectors only
 *   pnpm build:catalog:ai calibrate  # quality check against ground truth
 *
 * Every per-exercise result is cached under `.cache/ai/`, so this is resumable.
 * That is not a nicety: the endpoint has been observed taking over two minutes
 * for a single call and returning empty-bodied 404s under load, and losing an
 * hour of work to one transient failure would be unacceptable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, Exercise } from "../packages/shared/src/catalog/types.ts";
import { EMBED_DIMS, embed, generateJson, mapWithConcurrency } from "./lib/gemini.ts";
import { CACHE, ROOT } from "./lib/sources.ts";

const CATALOG_DIR = path.join(ROOT, "packages/shared/src/catalog");
const STEPS_CACHE = path.join(CACHE, "ai/steps");

const stages = new Set(process.argv.slice(2));
const shouldRun = (stage: string) => stages.size === 0 || stages.has(stage);
const log = (line: string) => process.stdout.write(`${line}\n`);

function loadCatalog(): Catalog {
	return JSON.parse(readFileSync(path.join(CATALOG_DIR, "catalog.en.json"), "utf8"));
}

// ---------------------------------------------------------------------------
// Steps and translation
// ---------------------------------------------------------------------------

type StepsResult = {
	name_es: string;
	steps_en: string[];
	steps_es: string[];
};

const STEPS_SCHEMA = {
	type: "object",
	properties: {
		name_es: { type: "string" },
		steps_en: { type: "array", items: { type: "string" } },
		steps_es: { type: "array", items: { type: "string" } },
	},
	required: ["name_es", "steps_en", "steps_es"],
};

const SYSTEM = `You write exercise instructions for a gym logging app.

Rules:
- 4 to 6 steps. Imperative mood. One action per step.
- Cover setup, the concentric, and the controlled eccentric.
- Describe only the movement named. Never substitute a similar exercise.
- No rep counts, set counts, loads, or tempo prescriptions.
- No medical claims and no safety disclaimers.
- Spanish uses neutral Latin American Spanish with "tú" imperatives
  ("baja", "mantén"), never "vosotros".
- name_es is the exercise name a Spanish-speaking lifter would actually use.
  Keep widely used English terms when translating them would be less clear
  (for example "press banca", "peso muerto", "hip thrust").`;

function promptFor(exercise: Exercise): string {
	const facts = [
		`Name: ${exercise.name}`,
		`Equipment: ${exercise.equipment}`,
		`Primary muscle: ${exercise.primaryMuscle}`,
		exercise.secondaryMuscles.length > 0
			? `Secondary muscles: ${exercise.secondaryMuscles.join(", ")}`
			: null,
		`Logging type: ${exercise.exerciseType}`,
		exercise.mechanic ? `Mechanic: ${exercise.mechanic}` : null,
	]
		.filter(Boolean)
		.join("\n");

	// Where verified instructions exist, they are the source of truth and only
	// the translation is asked for. Regenerating them would replace a known-good
	// description with a plausible one.
	if (exercise.steps.length > 0) {
		return `${facts}

These English steps are verified and must be reproduced verbatim in steps_en:
${exercise.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

Translate them into steps_es and give name_es.`;
	}

	return `${facts}

Write steps_en for this exercise, then translate them into steps_es, and give name_es.`;
}

async function stepsFor(exercise: Exercise): Promise<StepsResult> {
	const cached = path.join(STEPS_CACHE, `${exercise.slug}.json`);
	if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));

	const result = await generateJson<StepsResult>(promptFor(exercise), STEPS_SCHEMA, SYSTEM);

	if (result.steps_en.length === 0 || result.steps_es.length === 0 || !result.name_es) {
		throw new Error(`incomplete result for ${exercise.slug}`);
	}

	mkdirSync(STEPS_CACHE, { recursive: true });
	writeFileSync(cached, JSON.stringify(result, null, 1));
	return result;
}

async function runSteps() {
	const catalog = loadCatalog();
	const pending = catalog.exercises.filter(
		(e) => !existsSync(path.join(STEPS_CACHE, `${e.slug}.json`)),
	);

	log(`→ steps: ${catalog.exercises.length} exercises, ${pending.length} still to fetch`);

	let done = 0;
	let failed = 0;
	const failures: string[] = [];

	// Four at a time: the endpoint is slow and rate-limits under load, and a
	// higher number produced more retries than throughput.
	await mapWithConcurrency(catalog.exercises, 4, async (exercise) => {
		try {
			await stepsFor(exercise);
		} catch (error) {
			failed++;
			failures.push(exercise.slug);
			log(`  ! ${exercise.slug}: ${(error as Error).message.slice(0, 120)}`);
		}
		done++;
		if (done % 20 === 0) log(`  ${done}/${catalog.exercises.length}`);
	});

	log(`  fetched ${done - failed}, failed ${failed}`);
	if (failures.length > 0) {
		log(`  re-run to retry: ${failures.slice(0, 10).join(", ")}${failures.length > 10 ? "…" : ""}`);
	}

	writeCatalogs(catalog);
}

/** Merges cached model output into the English and Spanish catalogs. */
function writeCatalogs(catalog: Catalog) {
	const en: Exercise[] = [];
	const es: Exercise[] = [];
	let missing = 0;

	for (const exercise of catalog.exercises) {
		const cached = path.join(STEPS_CACHE, `${exercise.slug}.json`);
		if (!existsSync(cached)) {
			missing++;
			en.push(exercise);
			es.push(exercise);
			continue;
		}

		const result: StepsResult = JSON.parse(readFileSync(cached, "utf8"));
		en.push({ ...exercise, steps: exercise.steps.length > 0 ? exercise.steps : result.steps_en });
		es.push({ ...exercise, name: result.name_es, steps: result.steps_es });
	}

	const stamp = new Date().toISOString().slice(0, 10);
	writeFileSync(
		path.join(CATALOG_DIR, "catalog.en.json"),
		`${JSON.stringify({ locale: "en", generatedAt: stamp, exercises: en }, null, 1)}\n`,
	);
	writeFileSync(
		path.join(CATALOG_DIR, "catalog.es.json"),
		`${JSON.stringify({ locale: "es", generatedAt: stamp, exercises: es }, null, 1)}\n`,
	);

	log(`  wrote catalog.en.json and catalog.es.json${missing > 0 ? ` (${missing} incomplete)` : ""}`);
}

// ---------------------------------------------------------------------------
// Retrieval vectors
// ---------------------------------------------------------------------------

/** One document per exercise, the text the coach retrieves against. */
function documentFor(exercise: Exercise): string {
	return [
		exercise.name,
		`Equipment: ${exercise.equipment}`,
		`Primary: ${exercise.primaryMuscle}`,
		exercise.secondaryMuscles.length > 0
			? `Secondary: ${exercise.secondaryMuscles.join(", ")}`
			: "",
		exercise.mechanic ?? "",
		exercise.steps.join(" "),
	]
		.filter(Boolean)
		.join("\n");
}

async function runEmbed() {
	const catalog = loadCatalog();
	const documents = catalog.exercises.map(documentFor);
	log(`→ embed: ${documents.length} documents at ${EMBED_DIMS} dimensions`);

	// batchEmbedContents takes many inputs per call, so this is a handful of
	// requests rather than 302.
	const BATCH = 50;
	const batches: string[][] = [];
	for (let i = 0; i < documents.length; i += BATCH) batches.push(documents.slice(i, i + BATCH));

	const results = await mapWithConcurrency(batches, 2, async (batch, index) => {
		const vectors = await embed(batch);
		log(`  batch ${index + 1}/${batches.length}`);
		return vectors;
	});

	const vectors = results.flat();
	if (vectors.length !== documents.length) {
		throw new Error(`expected ${documents.length} vectors, got ${vectors.length}`);
	}

	// Truncating a Matryoshka embedding breaks its unit norm — a spot check came
	// back at 0.40 — so every vector is renormalised here. That makes a plain dot
	// product equal to cosine similarity, which is what the client computes.
	const flat = new Float32Array(vectors.length * EMBED_DIMS);
	vectors.forEach((vector, row) => {
		const norm = Math.hypot(...vector) || 1;
		for (let col = 0; col < EMBED_DIMS; col++) {
			flat[row * EMBED_DIMS + col] = vector[col] / norm;
		}
	});

	writeFileSync(path.join(CATALOG_DIR, "embeddings.bin"), Buffer.from(flat.buffer));
	writeFileSync(
		path.join(CATALOG_DIR, "embeddings.json"),
		`${JSON.stringify(
			{
				model: "gemini-embedding-001",
				dims: EMBED_DIMS,
				normalized: true,
				slugs: catalog.exercises.map((e) => e.slug),
			},
			null,
			1,
		)}\n`,
	);

	log(`  wrote embeddings.bin (${(flat.byteLength / 1024).toFixed(0)} KB) and embeddings.json`);
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

/**
 * Generates steps for exercises that already have verified ones and prints both
 * side by side. The plan called for sampling generated output against ground
 * truth before trusting the batch; this is that check, and it is worth running
 * before accepting 225 generated descriptions.
 */
async function runCalibrate() {
	const catalog = loadCatalog();
	const verified = catalog.exercises.filter((e) => e.stepsFrom === "everkinetic-id");
	const sample = [0, 1, 2, 3, 4].map((i) => verified[Math.floor((i * verified.length) / 5)]);

	log(`→ calibrate: ${sample.length} exercises with verified steps, regenerated blind\n`);

	for (const exercise of sample) {
		const blind = { ...exercise, steps: [] as string[] };
		const result = await generateJson<StepsResult>(promptFor(blind), STEPS_SCHEMA, SYSTEM);

		log(`${exercise.name}  (${exercise.equipment}, ${exercise.primaryMuscle})`);
		log("  verified:");
		for (const step of exercise.steps) log(`    - ${step}`);
		log("  generated:");
		for (const step of result.steps_en) log(`    - ${step}`);
		log("");
	}
}

// ---------------------------------------------------------------------------

if (shouldRun("calibrate") && stages.has("calibrate")) {
	await runCalibrate();
} else {
	if (shouldRun("steps")) await runSteps();
	if (shouldRun("embed")) await runEmbed();
}
