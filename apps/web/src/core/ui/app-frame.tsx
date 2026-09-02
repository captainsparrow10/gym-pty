import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The application frame.
 *
 * The app is designed at phone width and keeps that width everywhere: above the
 * 768px breakpoint it becomes a centred 480px column on a neutral backdrop
 * rather than stretching. On a wide screen a stretched single-column layout
 * reads as a broken website, and the brief was that the desktop view is the
 * same app, not a different one.
 *
 * `min-h-dvh` rather than `min-h-screen`: Safari's `vh` includes the collapsing
 * toolbar, which leaves the bottom bar under it.
 */
export function AppFrame({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-dvh bg-muted/40 md:py-6">
			<div
				className={cn(
					"relative mx-auto flex min-h-dvh w-full max-w-frame flex-col bg-background",
					"md:min-h-[calc(100dvh-3rem)] md:rounded-xl md:border md:shadow-2xl",
				)}
			>
				{children}
			</div>
		</div>
	);
}

/**
 * Scrollable page body.
 *
 * The bottom padding clears the fixed tab bar plus the iOS home indicator, so
 * the last row of a list is never trapped underneath it.
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
				"flex-1 overflow-y-auto px-4 pt-4",
				"pb-[calc(5rem+env(safe-area-inset-bottom))]",
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
		<header className="flex items-center justify-between gap-3 border-b px-4 py-3">
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide">
				{title}
			</h1>
			{action}
		</header>
	);
}
