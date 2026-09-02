import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	BotMessageSquare,
	Dumbbell,
	House,
	LineChart,
	PersonStanding,
} from "lucide-react";

type Tab = {
	to: string;
	label: string;
	icon: LucideIcon;
};

/**
 * Five destinations is the documented ceiling for a bottom bar; a sixth turns
 * it into a menu. Every item keeps its text label — icon-only navigation is
 * consistently worse to discover.
 */
const TABS: Tab[] = [
	{ to: "/", label: "Hoy", icon: House },
	{ to: "/train", label: "Entrenar", icon: PersonStanding },
	{ to: "/catalog", label: "Ejercicios", icon: Dumbbell },
	{ to: "/progress", label: "Progreso", icon: LineChart },
	{ to: "/coach", label: "Coach", icon: BotMessageSquare },
];

export function TabBar() {
	return (
		<nav
			aria-label="Principal"
			className="absolute inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur md:rounded-b-xl"
		>
			<ul className="flex pb-[env(safe-area-inset-bottom)]">
				{TABS.map(({ to, label, icon: Icon }) => (
					<li key={to} className="flex-1">
						<Link
							to={to}
							// `exact` on the index route only, so /catalog/squat still lights
							// up the Ejercicios tab.
							activeOptions={{ exact: to === "/" }}
							// 44px is the minimum comfortable target; sets get logged with
							// sweaty hands between sets, so the whole cell is tappable.
							className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-primary"
						>
							<Icon className="size-5" aria-hidden />
							<span className="text-[0.6875rem] font-medium leading-none">
								{label}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
