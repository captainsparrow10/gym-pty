import { createFileRoute } from "@tanstack/react-router";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";

export const Route = createFileRoute("/_app/")({
	component: Page,
});

function Page() {
	return (
		<>
			<AppHeader title="Hoy" />
			<AppScroll>
				<p className="text-muted-foreground">
					Tu sesión de hoy y el resumen de la semana.
				</p>
			</AppScroll>
		</>
	);
}
