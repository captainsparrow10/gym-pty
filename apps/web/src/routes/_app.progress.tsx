import { createFileRoute } from "@tanstack/react-router";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";

export const Route = createFileRoute("/_app/progress")({
	component: Page,
});

function Page() {
	return (
		<>
			<AppHeader title="Progreso" />
			<AppScroll>
				<p className="text-muted-foreground">
					Volumen, 1RM estimado y frecuencia por músculo.
				</p>
			</AppScroll>
		</>
	);
}
