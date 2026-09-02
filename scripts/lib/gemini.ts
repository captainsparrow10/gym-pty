/**
 * Minimal Gemini client for the build pipeline.
 *
 * Deliberately not the official SDK: this runs at build time, needs two
 * endpoints, and a dependency-free module keeps the pipeline reproducible.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./sources.ts";

/*
 * v1beta, not v1: structured output is rejected on v1 with "JSON mode is not
 * enabled for api version v1".
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

/*
 * Measured across the models this key can reach, one identical request each:
 *
 *   gemini-2.5-flash   v1beta json    2.7s
 *   gemini-3.5-flash   v1beta json   32.6s
 *   gemini-3.7-flash   any    any    429, quota exhausted
 *
 * The newer models are either rate limited to nothing on this key or an order
 * of magnitude slower for no benefit — writing five gym instructions does not
 * need a reasoning model. Earlier empty-bodied 404s from 3.7-flash were quota
 * exhaustion presenting as something else.
 */
export const TEXT_MODEL = "gemini-2.5-flash";

/**
 * Fallback order for text generation.
 *
 * The free tier caps `GenerateRequestsPerDayPerProjectPerModel` at 20 — twenty
 * requests per day, counted separately for each model. Exhausting one model
 * therefore does not exhaust the key, and rotating on 429 turns a hard stop
 * into a longer runway. Order is fastest first.
 *
 * Enabling billing removes the cap entirely and would cost cents for this
 * corpus; the rotation exists so the free tier is enough.
 */
const TEXT_MODELS = [
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-3.5-flash-lite",
	"gemini-3.5-flash",
	"gemini-flash-latest",
];

/** Models known to have hit their daily cap during this run. */
const exhausted = new Set<string>();

export function remainingModels(): string[] {
	return TEXT_MODELS.filter((model) => !exhausted.has(model));
}
export const EMBED_MODEL = "gemini-embedding-001";

/**
 * Matryoshka truncation to 256 dimensions. The corpus is 302 short documents,
 * where 256 dimensions retain effectively all of the retrieval quality, and it
 * keeps the shipped vector file at ~310 KB instead of ~2.4 MB.
 */
export const EMBED_DIMS = 256;

/** Reads GEMINI_API_KEY from the environment or from the root .env. */
export function apiKey(): string {
	if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

	try {
		const env = readFileSync(path.join(ROOT, ".env"), "utf8");
		const key = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
		if (key) return key;
	} catch {
		// Fall through to the error below.
	}

	throw new Error("GEMINI_API_KEY is not set (checked the environment and .env)");
}

type RequestOptions = {
	/** Attempts before giving up, including the first. */
	retries?: number;
};

async function post<T>(endpoint: string, body: unknown, options: RequestOptions = {}): Promise<T> {
	const retries = options.retries ?? 4;
	let lastError: unknown;

	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			const response = await fetch(`${BASE}/${endpoint}`, {
				method: "POST",
				headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
				body: JSON.stringify(body),
			});

			if (response.ok) return (await response.json()) as T;

			const detail = await response.text();

			// 429 and 5xx are worth retrying; a 400 means the request is malformed
			// and retrying it only wastes quota.
			//
			// 404 needs a closer look. Under load this endpoint returns 404 with an
			// empty body for a model that exists and answers on the very next
			// attempt, so an empty 404 is treated as transient. A genuine "model not
			// found" always carries a JSON error body, and that still fails fast.
			const transient404 = response.status === 404 && detail.trim() === "";
			const retryable = response.status === 429 || response.status >= 500 || transient404;

			lastError = new Error(
				`${response.status} ${detail.slice(0, 300) || "(empty body)"}`,
			);
			if (!retryable) throw lastError;
		} catch (error) {
			lastError = error;
			if (attempt === retries - 1) break;
		}

		// Exponential backoff with jitter, so a batch of parallel workers hitting
		// a rate limit does not retry in lockstep.
		const delay = 2 ** attempt * 1000 + Math.random() * 500;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	throw lastError;
}

type GenerateResponse = {
	candidates?: { content?: { parts?: { text?: string }[] } }[];
};

/**
 * Generates JSON matching `schema`.
 *
 * `responseSchema` constrains decoding, so the model cannot return prose around
 * the JSON and the result never needs to be scraped out of a code fence.
 */
export async function generateJson<T>(
	prompt: string,
	schema: Record<string, unknown>,
	systemInstruction?: string,
): Promise<T> {
	const body = {
		contents: [{ role: "user", parts: [{ text: prompt }] }],
		...(systemInstruction
			? { systemInstruction: { parts: [{ text: systemInstruction }] } }
			: {}),
		generationConfig: {
			responseMimeType: "application/json",
			responseSchema: schema,
			temperature: 0.2,
			// A batch of a dozen exercises in two languages runs long; the default
			// ceiling would truncate the JSON and fail the parse.
			maxOutputTokens: 32768,
		},
	};

	let lastError: unknown = new Error("every model has hit its daily cap");

	for (const model of remainingModels()) {
		try {
			const response = await post<GenerateResponse>(
				`models/${model}:generateContent`,
				body,
				// One attempt per model: a daily cap does not clear on a retry, so
				// moving on is faster than backing off.
				{ retries: 2 },
			);

			const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
			if (!text) throw new Error(`${model} returned no content`);
			return JSON.parse(text) as T;
		} catch (error) {
			lastError = error;
			const message = String((error as Error).message);

			// Two reasons to give up on a model and try the next one rather than
			// failing the whole batch:
			//   429  the daily cap, which will not clear by retrying
			//   404  the model is not available to this account at all — for
			//        example gemini-2.5-flash-lite, which the API reports as "no
			//        longer available to new users"
			// Anything else is a real problem with the request and should surface.
			if (message.includes("429") || message.includes("404")) {
				exhausted.add(model);
				const reason = message.includes("429") ? "hit its daily cap" : "is unavailable";
				process.stderr.write(`    ${model} ${reason}, moving on\n`);
				continue;
			}
			throw error;
		}
	}

	throw lastError;
}

type EmbedResponse = {
	embeddings?: { values: number[] }[];
};

/** Embeds a batch of texts, returning one vector per input, in order. */
export async function embed(texts: string[]): Promise<number[][]> {
	const response = await post<EmbedResponse>(`models/${EMBED_MODEL}:batchEmbedContents`, {
		requests: texts.map((text) => ({
			model: `models/${EMBED_MODEL}`,
			content: { parts: [{ text }] },
			taskType: "RETRIEVAL_DOCUMENT",
			outputDimensionality: EMBED_DIMS,
		})),
	});

	const vectors = response.embeddings?.map((e) => e.values);
	if (!vectors || vectors.length !== texts.length) {
		throw new Error(`expected ${texts.length} embeddings, got ${vectors?.length ?? 0}`);
	}
	return vectors;
}

/**
 * Runs `worker` over `items` with bounded concurrency.
 * Sequential requests would take far too long for 300 items; unbounded
 * parallelism just trips the rate limit.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;

	async function run() {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await worker(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
	return results;
}
