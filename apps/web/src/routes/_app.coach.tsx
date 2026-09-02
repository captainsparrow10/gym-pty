import { createFileRoute } from "@tanstack/react-router";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";

export const Route = createFileRoute("/_app/coach")({
	component: Page,
});

function Page() {
	return (
		<>
			<AppHeader title="Coach" />
			<AppScroll>
				<p className="text-muted-foreground">Tu asistente de entrenamiento.</p>
			</AppScroll>
		</>
	);
}
