import { Link } from "@tanstack/react-router";
import {
	BotMessageSquare,
	Dumbbell,
	House,
	LineChart,
	type LucideIcon,
	PersonStanding,
} from "lucide-react";

type Destination = {
	to: string;
	label: string;
	icon: LucideIcon;
};

/**
 * Five destinations is the documented ceiling for a bottom bar; a sixth turns
 * it into a menu. Every item keeps its text label — icon-only navigation is
 * consistently worse to discover.
 */
export const DESTINATIONS: Destination[] = [
	{ to: "/", label: "Hoy", icon: House },
	{ to: "/train", label: "Entrenar", icon: PersonStanding },
	{ to: "/catalog", label: "Ejercicios", icon: Dumbbell },
	{ to: "/progress", label: "Progreso", icon: LineChart },
	{ to: "/coach", label: "Coach", icon: BotMessageSquare },
];

/** `exact` only on the index, so /catalog/squat still lights up Ejercicios. */
const activeOptions = (to: string) => ({ exact: to === "/" });

/**
 * Bottom bar, below the desktop breakpoint.
 *
 * Thumb-reachable is the right answer on a phone and the wrong one on a
 * monitor, where a 1400px-wide strip of five icons pinned to the bottom edge
 * reads as a mobile site someone forgot to finish.
 */
export function TabBar() {
	return (
		<nav
			aria-label="Principal"
			className="absolute inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur md:rounded-b-xl lg:hidden"
		>
			<ul className="flex pb-[env(safe-area-inset-bottom)]">
				{DESTINATIONS.map(({ to, label, icon: Icon }) => (
					<li key={to} className="flex-1">
						<Link
							to={to}
							activeOptions={activeOptions(to)}
							// The whole cell is tappable: sets get logged with sweaty hands,
							// in a hurry, between sets.
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

/**
 * Sidebar, from 1024px up.
 *
 * Wide screens want persistent navigation down the side rather than a bar
 * across the bottom — it stops competing with the content for vertical space
 * and puts the destination labels where they can actually be read.
 */
export function Sidebar() {
	return (
		<nav
			aria-label="Principal"
			className="hidden w-56 shrink-0 flex-col gap-1 border-r p-4 lg:flex"
		>
			<span className="mb-4 px-3 font-display text-2xl font-bold uppercase tracking-wide">
				GYM
			</span>

			{DESTINATIONS.map(({ to, label, icon: Icon }) => (
				<Link
					key={to}
					to={to}
					activeOptions={activeOptions(to)}
					className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
				>
					<Icon className="size-5 shrink-0" aria-hidden />
					{label}
				</Link>
			))}
		</nav>
	);
}
