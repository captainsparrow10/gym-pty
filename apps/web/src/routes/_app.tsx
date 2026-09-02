import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppFrame } from "@/core/ui/app-frame";
import { TabBar } from "@/core/ui/tab-bar";

/**
 * Layout for the tabbed area of the app.
 *
 * Pathless (the `_` prefix) so it adds no URL segment, and separate from the
 * root so sign-in and sign-up can render without a tab bar.
 */
export const Route = createFileRoute("/_app")({
	component: AppLayout,
});

function AppLayout() {
	return (
		<AppFrame>
			<Outlet />
			<TabBar />
		</AppFrame>
	);
}
