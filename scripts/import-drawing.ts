#!/usr/bin/env node
/**
 * Turns a generated line drawing into catalogue art.
 *
 * The catalogue's format is one filled path with `fill-rule="evenodd"`, where
 * the white strokes are filled shapes and the body interior is a hole. That is
 * exactly what a bitmap tracer returns for line art, which is why an image can
 * round-trip into this format at all.
 *
 *   pnpm import:drawing <slug> <image.png> [--panels 3]
 *
 * `--panels` splits a strip left to right into that many frames, which is how
 * an animated exercise is produced. Generating three separate images gives
 * three subtly different people — different proportions, different viewing
 * angle, different line weight — and the crossfade reads as a cut rather than a
 * movement. One image holding the whole sequence keeps a single figure.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExerciseArt } from "../packages/shared/src/catalog/types.ts";
import { ROOT } from "./lib/sources.ts";

const ART_OUT = path.join(ROOT, "apps/web/public/art");
const SIZE = 512;
/** Breathing room so a limb never touches the edge of the frame. */
const PADDING = 24;

const args = process.argv.slice(2);
const slug = args[0];
const source = args[1];
const panels = Number(args[args.indexOf("--panels") + 1]) || 1;
/**
 * Extra line weight, in source pixels of radius.
 *
 * Generators reliably draw finer lines than the catalogue's existing art, and
 * asking for a thicker stroke in the prompt is a request, not a guarantee.
 * Dilating before the trace is deterministic: it thickens whatever arrived to
 * whatever the rest of the catalogue looks like.
 */
const weight = Number(args[args.indexOf("--weight") + 1]) || 0;

if (!slug || !source) {
	console.error(
		"usage: pnpm import:drawing <slug> <image.png> [--panels 3] [--weight 2]",
	);
	process.exit(1);
}

const work = mkdtempSync(path.join(tmpdir(), "import-"));

/** Splits a strip into `count` equal panels, left to right. */
function splitPanels(image: string, count: number): string[] {
	if (count === 1) return [image];

	const pattern = path.join(work, "panel-%d.png");
	execFileSync("magick", [image, "-crop", `${count}x1@`, "+repage", pattern]);
	return Array.from({ length: count }, (_, i) => path.join(work, `panel-${i}.png`));
}

/**
 * Traces one panel into a path.
 *
 * The drawings are white on black; potrace traces black shapes, so the image is
 * inverted first. A single close pass repairs strokes broken by compression
 * before they become gaps in the outline.
 */
function trace(image: string, index: number): { d: string; width: number; height: number } {
	const bitmap = path.join(work, `t-${index}.pbm`);
	const svg = path.join(work, `t-${index}.svg`);

	execFileSync("magick", [
		image,
		"-colorspace", "Gray",
		"-threshold", "45%",
		// Thicken while the strokes are still the white foreground. Dilating
		// after the negate grows the background instead and eats the drawing —
		// at a radius of three there was nothing left of it.
		...(weight > 0 ? ["-morphology", "Dilate", `Disk:${weight}`] : []),
		// Close first, to mend strokes broken by compression before they become
		// gaps in the traced outline. Then invert: potrace traces black.
		"-morphology", "Close", "Disk:1",
		"-negate",
		// Trim the empty border so every frame is measured from the drawing
		// itself, not from however the generator happened to frame it.
		"-fuzz", "5%",
		"-trim", "+repage",
		bitmap,
	]);

	execFileSync("potrace", [
		bitmap,
		"--svg",
		// One path for the whole drawing, which is what the format expects.
		"--flat",
		"--turdsize", "6",
		"--alphamax", "1.0",
		"--opttolerance", "0.3",
		"-o", svg,
	]);

	const out = readFileSync(svg, "utf8");
	const d = out.match(/<path[^>]*\sd="([^"]+)"/)?.[1];
	if (!d) throw new Error(`panel ${index}: potrace produced no path`);

	return {
		d,
		width: Number(out.match(/width="([\d.]+)/)?.[1] ?? SIZE),
		height: Number(out.match(/height="([\d.]+)/)?.[1] ?? SIZE),
	};
}

/**
 * Rewrites a path so it sits centred inside a 512 square.
 *
 * potrace works in tenth-of-a-point units with y pointing up, and hands back a
 * `translate(0,H) scale(0.1,-0.1)` to compensate. Folding that into the numbers
 * means the stored path needs no wrapper element, which is what lets it drop
 * into the same `<path d>` every other exercise already uses.
 *
 * The one thing to get right is that potrace mixes absolute and relative
 * commands — `M` is absolute, `m`, `c` and `l` are not. A relative number is a
 * delta, so it takes the scale and the y-flip but must not take the offset;
 * adding an origin to a displacement is what turned the first attempt into a
 * fan of vertical lines.
 */
function transformPath(
	d: string,
	sourceHeight: number,
	scale: number,
	offsetX: number,
	offsetY: number,
): string {
	const round = (n: number) => Number(n.toFixed(1)).toString();

	// Every command potrace emits takes coordinate pairs: M and m two, l two,
	// c six. No arcs, no H/V, so pairing is unambiguous.
	const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
	const out: string[] = [];
	let relative = false;
	let pending: number[] = [];

	const flush = () => {
		for (let i = 0; i + 1 < pending.length; i += 2) {
			const x = pending[i] / 10;
			const y = pending[i + 1] / 10;
			if (relative) {
				out.push(round(x * scale), round(-y * scale));
			} else {
				out.push(round(offsetX + x * scale), round(offsetY + (sourceHeight - y) * scale));
			}
		}
		pending = [];
	};

	for (const token of tokens) {
		if (/[A-Za-z]/.test(token)) {
			flush();
			relative = token === token.toLowerCase();
			out.push(token);
		} else {
			pending.push(Number(token));
		}
	}
	flush();

	// Rejoin, keeping a space only where two numbers meet.
	return out
		.reduce((acc, token) => {
			const previous = acc.at(-1);
			const needsSpace = previous !== undefined && !/[A-Za-z]/.test(previous) && !/[A-Za-z]/.test(token);
			return acc.concat(needsSpace ? ` ${token}` : token);
		}, [] as string[])
		.join("")
		.replace(/([A-Za-z])/g, " $1 ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Centres every frame inside a 512 square using one shared transform.
 *
 * The transform comes from the union of all frames' bounds, not each frame's
 * own: scaling a frame to its own bounding box resizes the body every time a
 * limb moves, so the figure would pulse across the animation.
 */
function normalise(
	frames: { d: string; width: number; height: number }[],
): { frames: string[]; viewBox: string } {
	const maxWidth = Math.max(...frames.map((f) => f.width));
	const maxHeight = Math.max(...frames.map((f) => f.height));
	const scale = (SIZE - PADDING * 2) / Math.max(maxWidth, maxHeight);

	return {
		frames: frames.map((frame) =>
			transformPath(
				frame.d,
				// In points, matching the y already divided down from tenths.
				frame.height,
				scale,
				(SIZE - frame.width * scale) / 2,
				(SIZE - maxHeight * scale) / 2,
			),
		),
		viewBox: `0 0 ${SIZE} ${SIZE}`,
	};
}

const images = splitPanels(path.resolve(source), panels);
const traced = images.map((image, index) => trace(image, index));
const { frames, viewBox } = normalise(traced);

const art: ExerciseArt = { slug, viewBox, frames };
mkdirSync(ART_OUT, { recursive: true });
writeFileSync(path.join(ART_OUT, `${slug}.json`), JSON.stringify(art));

console.log(`  ${slug}: ${frames.length} frame(s)`);
for (const [i, frame] of frames.entries()) {
	console.log(`    frame ${i + 1}: ${frame.length} chars, ${(frame.match(/M/g) ?? []).length} subpaths`);
}
console.log(`  wrote apps/web/public/art/${slug}.json`);
