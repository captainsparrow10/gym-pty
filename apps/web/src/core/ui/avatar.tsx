import {
	Anchor,
	Dumbbell,
	Flame,
	type LucideIcon,
	Rocket,
	Star,
	Target,
	Trophy,
	Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The fixed avatar set.
 *
 * No upload and no external avatar service: every profile picks one of these
 * icons and one of the six colours below, both enforced by a check constraint
 * in the database as well as here, so there is nothing to store, moderate or
 * fetch from elsewhere.
 */
export const AVATAR_ICONS = {
	dumbbell: Dumbbell,
	flame: Flame,
	zap: Zap,
	trophy: Trophy,
	star: Star,
	target: Target,
	anchor: Anchor,
	rocket: Rocket,
} as const satisfies Record<string, LucideIcon>;

export type AvatarIconName = keyof typeof AVATAR_ICONS;

export const AVATAR_ICON_NAMES = Object.keys(AVATAR_ICONS) as AvatarIconName[];

export const AVATAR_COLORS = [
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple",
] as const;

export type AvatarColorName = (typeof AVATAR_COLORS)[number];

const COLOR_CLASSES: Record<AvatarColorName, string> = {
	red: "bg-avatar-red",
	orange: "bg-avatar-orange",
	yellow: "bg-avatar-yellow",
	green: "bg-avatar-green",
	blue: "bg-avatar-blue",
	purple: "bg-avatar-purple",
};

const SIZE_CLASSES = {
	sm: "size-8",
	md: "size-10",
	lg: "size-16",
} as const;

/**
 * A user's avatar: a coloured circle with an icon inside.
 *
 * `icon` and `color` arrive from the database as plain `text`, not a TypeScript
 * union — the check constraint is what actually closes the set. A value
 * outside it (old data, a future row written before the UI catches up) falls
 * back rather than rendering nothing.
 */
export function Avatar({
	icon,
	color,
	size = "md",
	className,
}: {
	icon: string;
	color: string;
	size?: keyof typeof SIZE_CLASSES;
	className?: string;
}) {
	const Icon = AVATAR_ICONS[icon as AvatarIconName] ?? Dumbbell;
	const colorClass =
		COLOR_CLASSES[color as AvatarColorName] ?? COLOR_CLASSES.orange;

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full text-white",
				colorClass,
				SIZE_CLASSES[size],
				className,
			)}
		>
			<Icon className="size-[55%]" aria-hidden />
		</span>
	);
}
