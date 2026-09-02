/**
 * Reader for the bryllim/workout-guide checkout.
 *
 * We read the repository rather than the npm package: `@bryllim/workout-guide@1.0.0`
 * ships PNG frames, while the repository carries the SVG frames we need in order
 * to tint the art with the current theme.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ExerciseType } from "../../packages/shared/src/catalog/types.ts";

type ManifestFrame = {
	index: 1 | 2 | 3;
	path: string;
	format: string;
	attribution?: {
		source?: { url?: string };
	};
};

export type ManifestExercise = {
	id: string;
	slug: string;
	name: string;
	exerciseType: ExerciseType;
	equipment: string;
	primaryMuscle: string;
	secondaryMuscles: string[];
	isStretch: boolean;
	frames: ManifestFrame[];
};

export function packageDir(checkout: string): string {
	return path.join(checkout, "packages", "workout-guide");
}

export function loadManifest(checkout: string): ManifestExercise[] {
	const file = path.join(packageDir(checkout), "manifest.json");
	const manifest = JSON.parse(readFileSync(file, "utf8")) as ManifestExercise[];

	const svgFrames = manifest.flatMap((e) => e.frames).filter((f) => f.format === "svg").length;
	if (svgFrames === 0) {
		throw new Error(
			"manifest declares no SVG frames — the checkout looks like the PNG-only npm release",
		);
	}
	return manifest;
}

/**
 * Extracts the everkinetic exercise id from a frame's attribution URL, e.g.
 * ".../dist/svg/0042-tension.svg" -> "0042". Only frames derived from
 * everkinetic carry this; Bryl Lim drew the rest.
 */
export function everkineticIdOf(exercise: ManifestExercise): string | undefined {
	for (const frame of exercise.frames) {
		const id = frame.attribution?.source?.url?.match(/\/(\d{4})-[a-z]+\.svg/)?.[1];
		if (id) return id;
	}
	return undefined;
}

/**
 * Reads a frame SVG and returns its single `d` path attribute.
 *
 * Every frame is `<svg viewBox="0 0 512 512"><path fill="#fff" fill-rule="evenodd" d="..."/></svg>`,
 * so keeping just `d` drops ~15% of the bytes and lets the app set the fill from
 * the theme instead of shipping a hardcoded white.
 */
export function readFramePath(checkout: string, framePath: string): string {
	const raw = readFileSync(path.join(packageDir(checkout), framePath), "utf8");
	const d = raw.match(/\sd="([^"]+)"/)?.[1];
	if (!d) throw new Error(`no path data in ${framePath}`);
	return d;
}
