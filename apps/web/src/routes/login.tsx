import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	authErrorMessage,
	useSession,
	useSignIn,
	useSignUp,
} from "@/core/api/auth";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

const credentials = z.object({
	email: z.string().email("That email does not look valid."),
	password: z.string().min(6, "At least 6 characters."),
});

function LoginPage() {
	const navigate = useNavigate();
	const { data: session } = useSession();
	const [mode, setMode] = useState<"signin" | "signup">("signin");
	const [serverError, setServerError] = useState<string | null>(null);

	const signIn = useSignIn();
	const signUp = useSignUp();
	const pending = signIn.isPending || signUp.isPending;

	// Redirecting during render is a side effect in the wrong place; this also
	// covers arriving at /login with a session already restored from storage.
	useEffect(() => {
		if (session) navigate({ to: "/", replace: true });
	}, [session, navigate]);

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: { onSubmit: credentials },
		onSubmit: async ({ value }) => {
			setServerError(null);
			try {
				const action = mode === "signin" ? signIn : signUp;
				await action.mutateAsync(value);
				navigate({ to: "/", replace: true });
			} catch (error) {
				setServerError(authErrorMessage(error));
			}
		},
	});

	return (
		<div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
			<div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-2xl">
				<div className="mb-6 flex flex-col items-center gap-2 text-center">
					<Dumbbell className="size-8 text-primary" aria-hidden />
					<h1 className="font-display text-3xl font-bold uppercase tracking-wide">
						GYM
					</h1>
					<p className="text-sm text-muted-foreground">
						{mode === "signin"
							? "Sign in to track your progress."
							: "Create your account."}
					</p>
				</div>

				<form
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
					className="space-y-4"
					noValidate
				>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-1.5">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									inputMode="email"
									autoComplete="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									aria-invalid={field.state.meta.errors.length > 0}
									aria-describedby={`${field.name}-error`}
									className="h-11"
								/>
								<FieldError
									id={`${field.name}-error`}
									errors={field.state.meta.errors}
								/>
							</div>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<div className="space-y-1.5">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									autoComplete={
										mode === "signin" ? "current-password" : "new-password"
									}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(event) => field.handleChange(event.target.value)}
									aria-invalid={field.state.meta.errors.length > 0}
									aria-describedby={`${field.name}-error`}
									className="h-11"
								/>
								<FieldError
									id={`${field.name}-error`}
									errors={field.state.meta.errors}
								/>
							</div>
						)}
					</form.Field>

					{serverError && (
						// role="alert" so the failure is announced, not just shown.
						<p role="alert" className="text-sm text-destructive">
							{serverError}
						</p>
					)}

					<Button type="submit" disabled={pending} className="h-11 w-full">
						{pending
							? "Un momento…"
							: mode === "signin"
								? "Entrar"
								: "Create account"}
					</Button>
				</form>

				<button
					type="button"
					onClick={() => {
						setMode(mode === "signin" ? "signup" : "signin");
						setServerError(null);
					}}
					className="mt-4 min-h-11 w-full text-sm text-muted-foreground hover:text-foreground"
				>
					{mode === "signin"
						? "I need an account"
						: "I already have an account"}
				</button>
			</div>
		</div>
	);
}

function FieldError({ id, errors }: { id: string; errors: unknown[] }) {
	if (errors.length === 0) return null;
	const first = errors[0];
	const message =
		typeof first === "string"
			? first
			: ((first as { message?: string })?.message ?? "Check this field.");

	return (
		<p id={id} className="text-sm text-destructive">
			{message}
		</p>
	);
}
