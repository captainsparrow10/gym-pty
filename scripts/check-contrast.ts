#!/usr/bin/env node
/**
 * Verifies the design tokens meet WCAG contrast minimums, in both themes.
 *
 * Dark palettes are routinely shipped with contrast inherited from the light
 * design and never re-measured. This runs the numbers instead.
 *
 *   pnpm check:contrast
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/sources.ts";

const CSS = path.join(ROOT, "apps/web/src/styles.css");

/** WCAG 2.1 relative luminance of an #rrggbb colour. */
function luminance(hex: string): number {
	const channels = [1, 3, 5].map((i) => {
		const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** Reads the custom properties declared inside a given selector block. */
function readTokens(css: string, selector: string): Map<string, string> {
	// Anchored to the start of a line: ".dark" also appears inside the
	// @custom-variant declaration above, and matching that read :root twice.
	const block = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "m");
	const body = css.match(block)?.[1];
	if (!body) throw new Error(`selector ${selector} not found`);

	const tokens = new Map<string, string>();
	for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
		tokens.set(name, value.toLowerCase());
	}
	return tokens;
}

/** [foreground, background, minimum ratio, what it is]. */
const PAIRS: [string, string, number, string][] = [
	["foreground", "background", 4.5, "body text"],
	["card-foreground", "card", 4.5, "text on cards"],
	["popover-foreground", "popover", 4.5, "text in popovers and sheets"],
	["primary-foreground", "primary", 4.5, "label on the primary button"],
	["secondary-foreground", "secondary", 4.5, "label on the secondary button"],
	["accent-foreground", "accent", 4.5, "label on a hovered surface"],
	["success-foreground", "success", 4.5, "PR and completed-set badge"],
	["destructive-foreground", "destructive", 4.5, "label on a destructive action"],
	["muted-foreground", "background", 4.5, "secondary text"],
	["muted-foreground", "muted", 4.5, "secondary text on a muted surface"],
	// Non-text UI boundaries only need 3:1 (WCAG 1.4.11).
	// Purely decorative separators are exempt from WCAG 1.4.11; they only have
	// to be visible at all. Field outlines are not exempt: an outline-only input
	// on the page background has no other affordance, so it carries the 3:1 bar.
	["border", "background", 1.2, "separators"],
	["input", "background", 3, "field outlines"],
	["ring", "background", 3, "focus ring"],
];

const css = readFileSync(CSS, "utf8");
let failures = 0;

for (const [selector, theme] of [
	[":root", "light"],
	[".dark", "dark"],
] as const) {
	const tokens = readTokens(css, selector);
	console.log(`\n${theme}`);

	for (const [fg, bg, min, label] of PAIRS) {
		const a = tokens.get(fg);
		const b = tokens.get(bg);
		if (!a || !b) {
			console.log(`  ?  ${fg} / ${bg} — token missing`);
			failures++;
			continue;
		}

		const value = ratio(a, b);
		const ok = value >= min;
		if (!ok) failures++;
		console.log(
			`  ${ok ? "✓" : "✗"}  ${value.toFixed(2)}:1  (min ${min})  ${fg} on ${bg} — ${label}`,
		);
	}
}

if (failures > 0) {
	console.error(`\n${failures} contrast check(s) failed`);
	process.exit(1);
}
console.log("\nall contrast checks passed");
