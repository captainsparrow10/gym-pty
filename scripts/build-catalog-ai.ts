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

/**
 * Several exercises per request.
 *
 * One call per exercise put the whole run at ten hours, almost all of it round
 * trip rather than generation. Batching amortises that over eight exercises and
 * `slug` keeps the results attributable, since a positional array would silently
 * misalign if the model dropped an entry.
 */
const BATCH_SIZE = 12;

const STEPS_SCHEMA = {
	type: "array",
	items: {
		type: "object",
		properties: {
			slug: { type: "string" },
			name_es: { type: "string" },
			steps_en: { type: "array", items: { type: "string" } },
			steps_es: { type: "array", items: { type: "string" } },
		},
		required: ["slug", "name_es", "steps_en", "steps_es"],
	},
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

function describe(exercise: Exercise): Record<string, unknown> {
	return {
		slug: exercise.slug,
		name: exercise.name,
		equipment: exercise.equipment,
		primary_muscle: exercise.primaryMuscle,
		...(exercise.secondaryMuscles.length > 0
			? { secondary_muscles: exercise.secondaryMuscles }
			: {}),
		logging_type: exercise.exerciseType,
		...(exercise.mechanic ? { mechanic: exercise.mechanic } : {}),
		// Where verified instructions exist they are the source of truth and only
		// the translation is asked for. Regenerating them would replace a
		// known-good description with a merely plausible one.
		...(exercise.steps.length > 0 ? { verified_steps_en: exercise.steps } : {}),
	};
}

function promptFor(batch: Exercise[]): string {
	return `Produce one object per exercise below, in the same order, echoing its slug.

For any exercise carrying "verified_steps_en", copy those verbatim into steps_en
and only translate them. For the rest, write steps_en yourself.

${JSON.stringify(batch.map(describe), null, 1)}`;
}

async function runBatch(batch: Exercise[]): Promise<void> {
	const results = await generateJson<(StepsResult & { slug: string })[]>(
		promptFor(batch),
		STEPS_SCHEMA,
		SYSTEM,
	);

	const bySlug = new Map(results.map((result) => [result.slug, result]));
	mkdirSync(STEPS_CACHE, { recursive: true });

	for (const exercise of batch) {
		const result = bySlug.get(exercise.slug);
		if (!result || result.steps_en.length === 0 || result.steps_es.length === 0) {
			throw new Error(`missing or incomplete result for ${exercise.slug}`);
		}
		writeFileSync(
			path.join(STEPS_CACHE, `${exercise.slug}.json`),
			JSON.stringify(
				{ name_es: result.name_es, steps_en: result.steps_en, steps_es: result.steps_es },
				null,
				1,
			),
		);
	}
}

async function runSteps() {
	const catalog = loadCatalog();
	const pending = catalog.exercises.filter(
		(e) => !existsSync(path.join(STEPS_CACHE, `${e.slug}.json`)),
	);

	const batches: Exercise[][] = [];
	for (let i = 0; i < pending.length; i += BATCH_SIZE) {
		batches.push(pending.slice(i, i + BATCH_SIZE));
	}

	log(
		`→ steps: ${catalog.exercises.length} exercises, ${pending.length} to fetch ` +
			`in  batches of `,
	);

	let done = 0;
	const failures: string[] = [];

	await mapWithConcurrency(batches, 2, async (batch) => {
		try {
			await runBatch(batch);
		} catch (error) {
			failures.push(...batch.map((e) => e.slug));
			log(`  ! batch ${batch[0].slug}…: ${(error as Error).message.slice(0, 120)}`);
		}
		done++;
		log(`  ${done}/${batches.length} batches`);
	});

	log(`  done: ${pending.length - failures.length} written, ${failures.length} failed`);
	if (failures.length > 0) log("  re-run to retry the failures; completed work is cached");

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
