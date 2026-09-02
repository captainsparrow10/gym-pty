import { formatDuration } from "@gym/shared/domain";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	authErrorMessage,
	useSignOut,
	useUpdatePassword,
} from "@/core/api/auth";
import { AppHeader, AppScroll } from "@/core/ui/app-frame";
import {
	AVATAR_COLORS,
	AVATAR_ICON_NAMES,
	AVATAR_ICONS,
	Avatar,
	type AvatarColorName,
	type AvatarIconName,
} from "@/core/ui/avatar";
import {
	useProfile,
	useSetPublicProfile,
	useUpdateAvatar,
	useUpdateDisplayName,
	useUpdateRestSeconds,
} from "@/features/profile/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/profile")({
	component: ProfilePage,
});

function ProfilePage() {
	const { data: profile, isPending } = useProfile();

	if (isPending || !profile) {
		return (
			<>
				<AppHeader title="Profile" />
				<AppScroll className="space-y-4">
					<div className="h-24 animate-pulse rounded-xl bg-muted" />
					<div className="h-40 animate-pulse rounded-xl bg-muted" />
				</AppScroll>
			</>
		);
	}

	return (
		<>
			<AppHeader title="Profile" />
			{/*
			 * Two columns of cards from lg, rather than one column of full-width
			 * fields. A settings input 1280px wide is harder to scan than a short
			 * one, but the fix is the card being narrow, not the page — the page
			 * keeps the same edges as every other screen.
			 *
			 * `items-start` so a short card does not stretch to match a tall one
			 * beside it, and the columns stay two independent stacks.
			 */}
			<AppScroll className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
				<div className="space-y-6">
					<IdentitySection
						displayName={profile.displayName}
						icon={profile.avatarIcon}
						color={profile.avatarColor}
					/>
					<AvatarSection
						icon={profile.avatarIcon}
						color={profile.avatarColor}
					/>
				</div>
				<div className="space-y-6">
					<RestSection restSeconds={profile.restSeconds} />
					<LeaderboardSection publicProfile={profile.publicProfile} />
					<AccountSection />
				</div>
			</AppScroll>
		</>
	);
}

function IdentitySection({
	displayName,
	icon,
	color,
}: {
	displayName: string | null;
	icon: AvatarIconName;
	color: AvatarColorName;
}) {
	const rename = useUpdateDisplayName();

	return (
		<section className="flex items-center gap-4 rounded-xl border bg-card p-4">
			<Avatar icon={icon} color={color} size="lg" />
			<div className="min-w-0 flex-1">
				<Label htmlFor="display-name" className="mb-1 block">
					Display name
				</Label>
				<Input
					id="display-name"
					defaultValue={displayName ?? ""}
					placeholder="How the leaderboard should show you"
					className="h-11"
					// Committed on blur, same as renaming a routine: a name is not
					// something to write to the database on every keystroke.
					onBlur={(event) => {
						const next = event.target.value.trim();
						if (next === (displayName ?? "")) return;
						rename.mutate(next, {
							onError: (error: unknown) => toast.error(authErrorMessage(error)),
						});
					}}
				/>
			</div>
		</section>
	);
}

function AvatarSection({
	icon,
	color,
}: {
	icon: AvatarIconName;
	color: AvatarColorName;
}) {
	const updateAvatar = useUpdateAvatar();

	const pick = (
		next: Partial<{ icon: AvatarIconName; color: AvatarColorName }>,
	) =>
		updateAvatar.mutate(
			{ icon: next.icon ?? icon, color: next.color ?? color },
			{ onError: (error: unknown) => toast.error(authErrorMessage(error)) },
		);

	return (
		<section className="rounded-xl border bg-card p-4">
			<h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">
				Avatar
			</h2>

			<fieldset className="mb-4">
				<legend className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
					Icon
				</legend>
				<div className="grid grid-cols-4 gap-2">
					{AVATAR_ICON_NAMES.map((name) => {
						const Icon = AVATAR_ICONS[name];
						const selected = name === icon;
						return (
							<button
								key={name}
								type="button"
								aria-pressed={selected}
								aria-label={name}
								onClick={() => pick({ icon: name })}
								className={cn(
									"flex h-14 items-center justify-center rounded-lg border transition-colors",
									selected
										? "border-primary bg-primary/10 text-primary"
										: "text-muted-foreground hover:border-primary hover:text-foreground",
								)}
							>
								<Icon className="size-6" aria-hidden />
							</button>
						);
					})}
				</div>
			</fieldset>

			<fieldset>
				<legend className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
					Colour
				</legend>
				<div className="grid grid-cols-6 gap-2">
					{AVATAR_COLORS.map((name) => {
						const selected = name === color;
						return (
							<button
								key={name}
								type="button"
								aria-pressed={selected}
								aria-label={name}
								onClick={() => pick({ color: name })}
								className={cn(
									"flex h-11 items-center justify-center rounded-lg border",
									selected && "ring-2 ring-ring ring-offset-2 ring-offset-card",
								)}
							>
								<Avatar icon={icon} color={name} size="sm" />
							</button>
						);
					})}
				</div>
			</fieldset>
		</section>
	);
}

/**
 * How long the rest timer runs when the plan does not say.
 *
 * Fixed choices rather than a free number field: rest is picked from a handful
 * of values in practice, and a spinner for "how about 97 seconds" is a worse
 * control than five buttons.
 */
function RestSection({ restSeconds }: { restSeconds: number }) {
	const update = useUpdateRestSeconds();

	return (
		<section className="rounded-xl border bg-card p-4">
			<h2 className="mb-1 font-display text-lg font-semibold uppercase tracking-wide">
				Rest between sets
			</h2>
			<p className="mb-3 text-sm text-muted-foreground">
				Used when a routine does not set its own. A single exercise can still
				override it.
			</p>
			<div className="flex flex-wrap gap-2">
				{[45, 60, 90, 120, 180].map((option) => (
					<Button
						key={option}
						variant={restSeconds === option ? "default" : "outline"}
						className="h-11 tabular-nums"
						disabled={update.isPending}
						onClick={() => update.mutate(option)}
					>
						{formatDuration(option)}
					</Button>
				))}
			</div>
		</section>
	);
}

function LeaderboardSection({ publicProfile }: { publicProfile: boolean }) {
	const setPublicProfile = useSetPublicProfile();

	return (
		<section className="rounded-xl border bg-card p-4">
			<h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">
				Leaderboard
			</h2>
			<label className="flex min-h-11 cursor-pointer items-start justify-between gap-3">
				<span>
					<span className="block font-medium">Show me on the leaderboard</span>
					<span className="block text-sm text-muted-foreground">
						Turning this off also hides your name and avatar from public
						routines you have made visible to others.
					</span>
				</span>
				<input
					type="checkbox"
					checked={publicProfile}
					onChange={(event) =>
						setPublicProfile.mutate(event.target.checked, {
							onError: (error: unknown) => toast.error(authErrorMessage(error)),
						})
					}
					className="mt-1 size-5 shrink-0 accent-primary"
				/>
			</label>
		</section>
	);
}

function AccountSection() {
	const navigate = useNavigate();
	const signOut = useSignOut();

	return (
		<section className="space-y-2 rounded-xl border bg-card p-4">
			<h2 className="mb-1 font-display text-lg font-semibold uppercase tracking-wide">
				Account
			</h2>

			<ChangePasswordDialog />

			<Button
				variant="outline"
				className="h-11 w-full"
				disabled={signOut.isPending}
				onClick={() =>
					signOut.mutate(undefined, {
						onSuccess: () => navigate({ to: "/login", replace: true }),
					})
				}
			>
				<LogOut className="size-4" aria-hidden />
				Sign out
			</Button>
		</section>
	);
}

const passwordFields = z
	.object({
		password: z.string().min(6, "At least 6 characters."),
		confirm: z.string(),
	})
	.refine((value) => value.password === value.confirm, {
		message: "Passwords do not match.",
		path: ["confirm"],
	});

function ChangePasswordDialog() {
	const [open, setOpen] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);
	const updatePassword = useUpdatePassword();

	const form = useForm({
		defaultValues: { password: "", confirm: "" },
		validators: { onSubmit: passwordFields },
		onSubmit: async ({ value, formApi }) => {
			setServerError(null);
			try {
				await updatePassword.mutateAsync(value.password);
				toast.success("Password updated.");
				formApi.reset();
				setOpen(false);
			} catch (error) {
				setServerError(authErrorMessage(error));
			}
		},
	});

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					form.reset();
					setServerError(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" className="h-11 w-full">
					Change password
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change password</DialogTitle>
					<DialogDescription>
						Enter your new password twice to confirm it.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
					noValidate
				>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-1.5">
								<Label htmlFor={field.name}>New password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									autoComplete="new-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									aria-invalid={field.state.meta.errors.length > 0}
									className="h-11"
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="confirm">
						{(field) => (
							<div className="space-y-1.5">
								<Label htmlFor={field.name}>Confirm new password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									autoComplete="new-password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									aria-invalid={field.state.meta.errors.length > 0}
									className="h-11"
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					{serverError && (
						<p role="alert" className="text-sm text-destructive">
							{serverError}
						</p>
					)}

					<DialogFooter>
						<Button
							type="submit"
							disabled={updatePassword.isPending}
							className="h-11 w-full"
						>
							{updatePassword.isPending ? "Updating…" : "Update password"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	const first = errors[0];
	const message =
		typeof first === "string"
			? first
			: ((first as { message?: string })?.message ?? "Check this field.");

	return (
		<p role="alert" className="text-sm text-destructive">
			{message}
		</p>
	);
}
