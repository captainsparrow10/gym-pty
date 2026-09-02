import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";
import { useEffect } from "react";
import { useSession } from "@/core/api/auth";
import { AppFrame } from "@/core/ui/app-frame";
import { TabBar } from "@/core/ui/tab-bar";

/**
 * Layout for the tabbed area of the app.
 *
 * Pathless (the `_` prefix) so it adds no URL segment, and separate from the
 * root so sign-in renders without a tab bar.
 */
export const Route = createFileRoute("/_app")({
	component: AppLayout,
});

function AppLayout() {
	const navigate = useNavigate();
	const { data: session, isPending } = useSession();

	useEffect(() => {
		if (!isPending && !session) navigate({ to: "/login", replace: true });
	}, [isPending, session, navigate]);

	/*
	 * The session lives in localStorage, so the server renders this signed-out
	 * and the client resolves it on hydration. Showing the app shell during that
	 * gap would flash real chrome at someone who is about to be redirected, so it
	 * holds on a neutral splash instead.
	 *
	 * This is a UX gate. Row level security is the actual boundary: a client that
	 * skips this reaches the API and gets empty results.
	 */
	if (isPending || !session) {
		return (
			<AppFrame>
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<Dumbbell
						className="size-8 animate-pulse text-muted-foreground"
						aria-hidden
					/>
					<p className="sr-only">Cargando</p>
				</div>
			</AppFrame>
		);
	}

	return (
		<AppFrame>
			<Outlet />
			<TabBar />
		</AppFrame>
	);
}
