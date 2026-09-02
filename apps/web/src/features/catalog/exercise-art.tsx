import type { ExerciseArt as ArtData } from "@gym/shared/catalog";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Frame path data lives in `public/art/<slug>.json` rather than the bundle:
 * 302 exercises come to 25 MB, which no one should download to look at one
 * squat. Each file is ~80 KB and the browser caches it.
 */
async function fetchArt(slug: string): Promise<ArtData> {
	const response = await fetch(`/art/${slug}.json`);
	if (!response.ok) throw new Error(`no art for ${slug}`);
	return response.json();
}

export function exerciseArtQuery(slug: string) {
	return {
		queryKey: ["art", slug] as const,
		queryFn: () => fetchArt(slug),
		// The artwork is a build artifact; it never changes within a session.
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: 30 * 60 * 1000,
	};
}

/** One full cycle of the three-frame loop. */
const CYCLE_MS = 1560;
/** Fraction of each leg spent holding the pose before crossfading. */
const HOLD = 0.72;

function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(query.matches);

		const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);

	return reduced;
}

/**
 * Drives the frame blend on a requestAnimationFrame loop.
 *
 * The cycle runs 1-2-3-2 rather than 1-2-3-1: a rep returns along the path it
 * travelled, so snapping from the end position back to the start reads as a
 * glitch. Each leg holds the pose for most of its duration and crossfades over
 * the tail, which is what makes three still frames read as movement.
 */
function useFrameBlend(frameCount: number, active: boolean) {
	const [blend, setBlend] = useState({ from: 0, to: 0, mix: 0 });
	const raf = useRef(0);

	useEffect(() => {
		if (!active || frameCount < 2) {
			setBlend({ from: 0, to: 0, mix: 0 });
			return;
		}

		// 3 frames -> 4 legs: 1->2, 2->3, 3->2, 2->1.
		const legs = (frameCount - 1) * 2;
		const start = performance.now();

		const tick = (now: number) => {
			const position = (((now - start) % CYCLE_MS) / CYCLE_MS) * legs;
			const leg = Math.floor(position) % legs;
			const progress = position - Math.floor(position);

			const ascending = leg < frameCount - 1;
			const from = ascending ? leg : legs - leg;
			const to = ascending ? from + 1 : from - 1;

			const raw = progress < HOLD ? 0 : (progress - HOLD) / (1 - HOLD);
			// Smoothstep, so the fade eases in and out instead of ramping linearly.
			const mix = raw * raw * (3 - 2 * raw);

			setBlend({ from, to, mix });
			raf.current = requestAnimationFrame(tick);
		};

		raf.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf.current);
	}, [frameCount, active]);

	return blend;
}

type Props = {
	slug: string;
	/** Animate. Ignored when the visitor asked for reduced motion. */
	live?: boolean;
	className?: string;
	/** Exercise name, for the accessible label. */
	name?: string;
};

export function ExerciseArt({ slug, live = false, className, name }: Props) {
	const { data, isError } = useQuery(exerciseArtQuery(slug));
	const reducedMotion = usePrefersReducedMotion();

	const frames = data?.frames ?? [];
	const animating = live && !reducedMotion && frames.length > 1;
	const { from, to, mix } = useFrameBlend(frames.length, animating);

	if (isError || (data && frames.length === 0)) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded-xl border bg-card text-muted-foreground",
					className,
				)}
			>
				<Dumbbell className="size-8" aria-hidden />
			</div>
		);
	}

	return (
		<div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
			{data ? (
				<svg
					viewBox={data.viewBox}
					className="size-full text-foreground"
					role="img"
					aria-label={
						name ? `Ilustración de ${name}` : "Ilustración del ejercicio"
					}
				>
					{/*
					 * `currentColor` is the whole reason we extract path data instead of
					 * using the published PNGs: the art follows the theme.
					 */}
					<path
						d={frames[from]}
						fill="currentColor"
						fillRule="evenodd"
						opacity={1 - mix}
					/>
					{mix > 0 && from !== to && (
						<path
							d={frames[to]}
							fill="currentColor"
							fillRule="evenodd"
							opacity={mix}
						/>
					)}
				</svg>
			) : (
				<div className="size-full animate-pulse bg-muted" />
			)}
		</div>
	);
}
