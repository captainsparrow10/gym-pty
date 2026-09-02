/**
 * Upstream data sources.
 *
 * The npm package `@bryllim/workout-guide@1.0.0` ships PNG frames only; the SVG
 * frames exist solely in the GitHub repository and were never published. We pull
 * from the repositories so the art can be tinted with the current theme.
 *
 * Licensing (both must be honoured in the Credits screen):
 *   - Artwork and exercise text: CC BY-SA 4.0
 *   - workout-guide package code: MIT
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export type Source = {
	id: string;
	repo: string;
	/** Directories to check out, relative to the repository root. */
	sparse: string[];
	/** A file that must exist once the checkout succeeded. */
	sentinel: string;
};

export const SOURCES = {
	workoutGuide: {
		id: "workout-guide",
		repo: "bryllim/workout-guide",
		sparse: ["packages/workout-guide/assets", "packages/workout-guide/manifest.json"],
		sentinel: "packages/workout-guide/manifest.json",
	},
	everkinetic: {
		id: "everkinetic",
		repo: "everkinetic/data",
		sparse: ["dist/md"],
		sentinel: "dist/md",
	},
} as const satisfies Record<string, Source>;

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const CACHE = path.join(ROOT, ".cache");

const run = (args: string[], cwd?: string) =>
	execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "inherit"] });

/**
 * Checks out only the directories a source needs.
 *
 * `--filter=blob:none` defers blob download and `sparse-checkout` then fetches
 * just the matching ones. everkinetic/data is 288 MB but `dist/md` is ~1 MB, so
 * this avoids downloading two orders of magnitude more than we use.
 */
export function fetchSource(source: Source): string {
	const dest = path.join(CACHE, source.id);
	if (existsSync(path.join(dest, source.sentinel))) {
		console.log(`  ${source.id}: cached`);
		return dest;
	}

	rmSync(dest, { recursive: true, force: true });
	mkdirSync(CACHE, { recursive: true });
	console.log(`  ${source.id}: sparse checkout of ${source.repo} (${source.sparse.join(", ")})`);

	run([
		"clone",
		"--filter=blob:none",
		"--no-checkout",
		"--depth=1",
		"--quiet",
		`https://github.com/${source.repo}.git`,
		dest,
	]);
	run(["sparse-checkout", "set", "--no-cone", ...source.sparse], dest);
	run(["checkout", "--quiet"], dest);

	return dest;
}
