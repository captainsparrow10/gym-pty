import { Link } from "@tanstack/react-router";
import {
	BotMessageSquare,
	Dumbbell,
	House,
	type LucideIcon,
	PersonStanding,
	Trophy,
	User,
} from "lucide-react";

type Destination = {
	to: string;
	label: string;
	icon: LucideIcon;
};

/**
 * Five destinations is the documented ceiling for a bottom bar; a sixth turns
 * it into a menu. A sidebar has no such limit, so Rankings and Profile appear
 * there directly. On a phone, Rankings is reached from the Progress screen —
 * the two answer neighbouring questions anyway — and Profile from the avatar
 * in the header of the Today screen, the way a top-right avatar conventionally
 * opens account settings.
 *
 * Every item keeps its text label. Icon-only navigation is consistently worse
 * to discover.
 */
const TAB_BAR: Destination[] = [
	{ to: "/", label: "Home", icon: House },
	{ to: "/train", label: "Train", icon: PersonStanding },
	{ to: "/exercises", label: "Exercises", icon: Dumbbell },
	{ to: "/rankings", label: "Rankings", icon: Trophy },
	{ to: "/coach", label: "Coach", icon: BotMessageSquare },
];

/*
 * Progress is gone as a destination, not as a feature: its panels are the home
 * screen now. It had been a tab you were expected to remember to open, holding
 * the answers to the questions the app exists for, while the screen you
 * actually land on showed a button and a list.
 *
 * Its slot goes to Rankings, which until now had no room in the five-slot
 * bottom bar and was reached through a link parked at the top of Progress.
 */
const SIDEBAR: Destination[] = [
	...TAB_BAR,
	{ to: "/profile", label: "Profile", icon: User },
];

/** `exact` only on the index, so /exercises/squat still lights up Exercises. */
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
			aria-label="Main"
			className="absolute inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur md:rounded-b-xl lg:hidden"
		>
			<ul className="flex pb-[env(safe-area-inset-bottom)]">
				{TAB_BAR.map(({ to, label, icon: Icon }) => (
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
			aria-label="Main"
			className="hidden w-56 shrink-0 flex-col gap-1 border-r p-4 lg:flex"
		>
			<span className="mb-4 px-3 font-display text-2xl font-bold uppercase tracking-wide">
				GYM
			</span>

			{SIDEBAR.map(({ to, label, icon: Icon }) => (
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
