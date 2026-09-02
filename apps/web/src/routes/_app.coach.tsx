import { createFileRoute, Link } from "@tanstack/react-router";
import { BotMessageSquare, ChevronRight } from "lucide-react";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";

export const Route = createFileRoute("/_app/coach")({
	component: CoachPage,
});

/**
 * Placeholder, and honest about it.
 *
 * The server side exists — `server/gemini.ts` and the four read-only tools in
 * `server/coach-tools.ts` — but nothing calls them yet, so this is a tab that
 * cannot answer anything. Saying so beats a sentence implying an assistant is
 * here, which is what it said before (in Spanish, in an app that is otherwise
 * entirely in English).
 */
function CoachPage() {
	return (
		<>
			<AppHeader title="Coach" />
			<AppScroll className="space-y-4">
				<div className="rounded-xl border border-dashed p-8 text-center">
					<BotMessageSquare
						className="mx-auto mb-3 size-8 text-muted-foreground"
						aria-hidden
					/>
					<h2 className="mb-2 font-display text-lg font-semibold uppercase tracking-wide">
						Not built yet
					</h2>
					<p className="mx-auto max-w-md text-sm text-muted-foreground">
						The coach will answer questions about your own training — what you
						have been doing, what to load next, which exercise to swap in — and
						nothing else. It reads your log; it does not give medical or
						nutritional advice.
					</p>
				</div>

				<div className="grid gap-3 sm:grid-cols-2">
					<Link
						to="/rankings"
						search={{ section: "personal" }}
						className="flex min-h-14 items-center justify-between rounded-xl border bg-card px-4 text-sm transition-colors hover:border-primary"
					>
						<span>
							<span className="block font-medium">What do I train most</span>
							<span className="block text-muted-foreground">
								Rankings, by exercise or muscle
							</span>
						</span>
						<ChevronRight
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden
						/>
					</Link>

					<Link
						to="/"
						className="flex min-h-14 items-center justify-between rounded-xl border bg-card px-4 text-sm transition-colors hover:border-primary"
					>
						<span>
							<span className="block font-medium">Am I getting stronger</span>
							<span className="block text-muted-foreground">
								Estimated 1RM over the year
							</span>
						</span>
						<ChevronRight
							className="size-4 shrink-0 text-muted-foreground"
							aria-hidden
						/>
					</Link>
				</div>
			</AppScroll>
		</>
	);
}
