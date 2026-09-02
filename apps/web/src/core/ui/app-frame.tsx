import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
		<div className="min-h-dvh bg-muted/40 md:py-6 lg:flex lg:bg-background lg:py-0">
			<div
				className={cn(
					"relative mx-auto flex min-h-dvh w-full max-w-frame flex-col bg-background",
					"md:min-h-[calc(100dvh-3rem)] md:rounded-xl md:border md:shadow-2xl",
					// The frame chrome is phone dressing; on desktop the app owns the
					// whole viewport and the sidebar provides the only border.
					"lg:min-h-dvh lg:max-w-none lg:flex-row lg:rounded-none lg:border-0 lg:shadow-none",
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
		<div className="relative flex min-w-0 flex-1 flex-col">{children}</div>
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
	/** Let the page manage its own width, for grids that should fill the screen. */
	full = false,
}: {
	children: ReactNode;
	className?: string;
	full?: boolean;
}) {
	return (
		<main
			className={cn(
				"flex-1 overflow-y-auto px-4 pt-4",
				"pb-[calc(5rem+env(safe-area-inset-bottom))]",
				"lg:px-8 lg:pb-10 lg:pt-6",
				!full && "lg:mx-auto lg:w-full lg:max-w-5xl",
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
		<header className="flex items-center justify-between gap-3 border-b px-4 py-3 lg:px-8 lg:py-5">
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide lg:text-3xl">
				{title}
			</h1>
			{action}
		</header>
	);
}
