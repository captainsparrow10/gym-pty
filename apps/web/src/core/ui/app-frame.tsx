import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one content width in the app.
 *
 * There used to be three — wide, prose and full, chosen per page — and the
 * result was that the gutters and the content edge moved as you navigated.
 * Even a well-chosen narrower cap reads as a mistake when the page before it
 * was wider: the eye tracks the left edge, and an edge that jumps is more
 * distracting than a line of text being longer than ideal.
 *
 * 80rem, which is 1280px: a laptop's usable width. Wider than that and a row
 * of a list becomes a stretch of empty space with a number at each end.
 *
 * Line length is still a real constraint, but it belongs to the block of text
 * rather than to the page. A screen that needs a narrow reading column — the
 * exercise instructions, the settings form — puts that column inside this one
 * instead of shrinking the page around it.
 *
 * Used by both the header and the body so their left edges line up. Anything
 * that needs to align with page content uses this and does not invent its own.
 */
export const CONTENT_WIDTH = "lg:mx-auto lg:w-full lg:max-w-7xl";

/**
 * The application frame.
 *
 * Two layouts, not one stretched.
 *
 * Below 1024px the app is phone-shaped: full width on a phone, and a centred
 * 480px column on a tablet rather than a stretched one. Navigation is a bottom
 * bar.
 *
 * From 1024px it becomes a desktop application: a sidebar down the left and a
 * wide content column. Keeping the phone column on a monitor left most of the
 * screen empty and read as an unfinished mobile site — which is exactly what
 * it looked like.
 */
export function AppFrame({ children }: { children: ReactNode }) {
	return (
		/*
		 * A fixed viewport height, not a minimum, and the scrolling happens
		 * inside.
		 *
		 * `min-h-dvh` let the column grow with its content, so the body's
		 * `flex-1 overflow-y-auto` never had anything to overflow — the document
		 * scrolled instead and the "scroll element" measured 9024px tall on the
		 * exercises page. TanStack Virtual asks that element how big the viewport
		 * is, believed it, and mounted all 304 rows: every row fired its own
		 * artwork fetch, and the resulting storm of query notifications hit
		 * React's nested-update limit and took the page down.
		 *
		 * `min-h-0` on the flex children is the other half. A flex item's default
		 * minimum size is its content, so without it a child refuses to shrink
		 * below what it holds and the constraint above never reaches the
		 * scrollable box.
		 */
		<div className="h-dvh overflow-hidden bg-muted/40 md:py-6 lg:flex lg:bg-background lg:py-0">
			<div
				className={cn(
					"relative mx-auto flex h-full min-h-0 w-full max-w-frame flex-col overflow-hidden bg-background",
					"md:rounded-xl md:border md:shadow-2xl",
					"lg:max-w-none lg:flex-row lg:rounded-none lg:border-0 lg:shadow-none",
				)}
			>
				{children}
			</div>
		</div>
	);
}

/** Column holding the header and the scrolling body, beside the sidebar. */
export function AppMain({ children }: { children: ReactNode }) {
	return (
		<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
			{children}
		</div>
	);
}

/**
 * Scrollable page body.
 *
 * The bottom padding clears the fixed tab bar plus the iOS home indicator so
 * the last row of a list is never trapped underneath it. On desktop there is no
 * bottom bar, so that padding goes away and the content is capped rather than
 * spanning a 27-inch monitor edge to edge.
 */
export function AppScroll({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<main
			className={cn(
				"min-h-0 flex-1 overflow-y-auto px-4 pt-4",
				"pb-[calc(5rem+env(safe-area-inset-bottom))]",
				"lg:px-8 lg:pb-10 lg:pt-6",
				CONTENT_WIDTH,
				className,
			)}
		>
			{children}
		</main>
	);
}

export function AppHeader({
	title,
	action,
}: {
	title: string;
	action?: ReactNode;
}) {
	return (
		/*
		 * The rule spans the viewport; the title inside it sits on the same
		 * left edge as the content below.
		 *
		 * With the header at full width and the body centred at CONTENT_WIDTH,
		 * the two left edges drift apart as the screen grows — the title ends up
		 * hard against the sidebar while the first card starts a hundred pixels
		 * in. A misaligned edge is the thing the eye actually tracks, and it
		 * reads as a broken layout even when nothing else is wrong.
		 */
		<header className="border-b">
			<div
				className={cn(
					"flex items-center justify-between gap-3 px-4 py-3",
					"lg:px-8 lg:py-5",
					CONTENT_WIDTH,
				)}
			>
				<h1 className="font-display text-2xl font-bold uppercase tracking-wide lg:text-3xl">
					{title}
				</h1>
				{action}
			</div>
		</header>
	);
}
