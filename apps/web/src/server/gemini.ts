/**
 * Server-side Gemini client.
 *
 * This module must never be imported from client code: it reads
 * `process.env.GEMINI_API_KEY`, which only exists on the server. TanStack Start
 * strips server functions and everything they reach out of the client bundle,
 * which is the whole reason the coach runs through one.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Fallback order, fastest first.
 *
 * The free tier caps `GenerateRequestsPerDayPerProjectPerModel` at 20 — twenty
 * requests a day, counted separately per model — so exhausting one model does
 * not exhaust the key. Measured on this key: 2.5-flash answers in about three
 * seconds, 3.5-flash takes thirty for no benefit, and 3.7-flash is rate limited
 * to nothing.
 */
const MODELS = [
	"gemini-2.5-flash",
	"gemini-3.5-flash-lite",
	"gemini-3.5-flash",
];

export type Tool = {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
};

export type Message = {
	role: "user" | "model";
	text?: string;
	functionCall?: { name: string; args: Record<string, unknown> };
	functionResponse?: { name: string; response: unknown };
};

type Part =
	| { text: string }
	| { functionCall: { name: string; args: Record<string, unknown> } }
	| { functionResponse: { name: string; response: { result: unknown } } };

function toParts(message: Message): Part[] {
	if (message.functionCall) return [{ functionCall: message.functionCall }];
	if (message.functionResponse) {
		return [
			{
				functionResponse: {
					name: message.functionResponse.name,
					response: { result: message.functionResponse.response },
				},
			},
		];
	}
	return [{ text: message.text ?? "" }];
}

type GenerateResponse = {
	candidates?: {
		content?: { parts?: Part[] };
		finishReason?: string;
	}[];
};

export type GenerateResult = {
	text: string;
	functionCalls: { name: string; args: Record<string, unknown> }[];
	model: string;
};

export class QuotaExhaustedError extends Error {
	constructor() {
		super("The daily quota for every available model is exhausted.");
		this.name = "QuotaExhaustedError";
	}
}

export async function generate(
	messages: Message[],
	systemInstruction: string,
	tools: Tool[],
): Promise<GenerateResult> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) throw new Error("GEMINI_API_KEY is not set on the server.");

	const body = {
		contents: messages.map((message) => ({
			role: message.role,
			parts: toParts(message),
		})),
		systemInstruction: { parts: [{ text: systemInstruction }] },
		...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
		generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
	};

	let lastError: unknown;

	for (const model of MODELS) {
		try {
			const response = await fetch(`${BASE}/models/${model}:generateContent`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const detail = await response.text();
				// 429 is the daily cap and 404 means the model is not available to
				// this account; both mean move on rather than retry.
				if (response.status === 429 || response.status === 404) {
					lastError = new Error(`${model}: ${response.status}`);
					continue;
				}
				throw new Error(`${model}: ${response.status} ${detail.slice(0, 200)}`);
			}

			const data = (await response.json()) as GenerateResponse;
			const parts = data.candidates?.[0]?.content?.parts ?? [];

			return {
				text: parts
					.map((part) => ("text" in part ? part.text : ""))
					.join("")
					.trim(),
				functionCalls: parts.flatMap((part) =>
					"functionCall" in part ? [part.functionCall] : [],
				),
				model,
			};
		} catch (error) {
			lastError = error;
		}
	}

	if (String((lastError as Error)?.message).includes("429"))
		throw new QuotaExhaustedError();
	throw lastError ?? new Error("No model returned a response.");
}
