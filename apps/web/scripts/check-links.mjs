#!/usr/bin/env node
/**
 * Every `<Link to="...">` in the source points at a route that exists.
 *
 * TanStack Router types these, but a text-level rewrite can slip past `tsc`:
 * renaming the catalogue with `sd` turned `to="/catalog/$slug"` into
 * `to="/exercises/"` — `sd` reads `$slug` in a replacement as a capture-group
 * reference and substitutes nothing. It threw at render time, and only on the
 * one page that mounted the component holding the link, which made it look
 * like that page was broken rather than the rename.
 *
 * Cheap enough to run beside the type check.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "src");

const walk = (dir) =>
	readdirSync(dir).flatMap((entry) => {
		const full = path.join(dir, entry);
		return statSync(full).isDirectory()
			? walk(full)
			: /\.tsx?$/.test(full)
				? [full]
				: [];
	});

const tree = readFileSync(path.join(root, "routeTree.gen.ts"), "utf8");
const known = new Set(
	[
		...tree.matchAll(/fullPath:\s*'([^']+)'/g),
		...tree.matchAll(/id:\s*'([^']+)'/g),
		...tree.matchAll(/'(\/[^']*)':\s*\{/g),
	].map((match) => match[1]),
);

// Accepted by the router regardless of the tree.
for (const relative of [".", "..", "/"]) known.add(relative);

let bad = 0;
for (const file of walk(root)) {
	if (file.endsWith("routeTree.gen.ts")) continue;
	const source = readFileSync(file, "utf8");

	for (const match of source.matchAll(/\bto="([^"]+)"/g)) {
		const target = match[1];
		if (target.startsWith("http") || target.startsWith("#")) continue;
		if (known.has(target)) continue;
		const line = source.slice(0, match.index).split("\n").length;
		console.log(`  ✗ ${path.relative(root, file)}:${line}  to="${target}"`);
		bad++;
	}
}

console.log(
	bad === 0 ? "  ✓ every link points at a real route" : `\n  ${bad} broken`,
);
process.exitCode = bad === 0 ? 0 : 1;
