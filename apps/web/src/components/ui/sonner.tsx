import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/*
 * shadcn ships this reading the theme from next-themes. There is no
 * ThemeProvider here — the app pins `class="dark"` on <html> — so that hook
 * would return "system" and sonner would follow the operating system instead of
 * the app. The theme is stated directly and the dependency dropped.
 *
 * If a light/dark toggle is ever added, this has to follow it.
 */
const Toaster = ({ ...props }: ToasterProps) => (
	<Sonner
		theme="dark"
		className="toaster group"
		icons={{
			success: <CircleCheckIcon className="size-4" />,
			info: <InfoIcon className="size-4" />,
			warning: <TriangleAlertIcon className="size-4" />,
			error: <OctagonXIcon className="size-4" />,
			loading: <Loader2Icon className="size-4 animate-spin" />,
		}}
		style={
			{
				"--normal-bg": "var(--popover)",
				"--normal-text": "var(--popover-foreground)",
				"--normal-border": "var(--border)",
				"--border-radius": "var(--radius)",
			} as React.CSSProperties
		}
		{...props}
	/>
);

export { Toaster };
