import type { Session } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";

export const sessionKey = ["session"] as const;

/**
 * The current Supabase session.
 *
 * The session lives in localStorage, so the server cannot know it: SSR always
 * renders the signed-out state and the client corrects it on hydration. That is
 * why route protection is a client-side gate rather than a `beforeLoad`
 * redirect, which would bounce every visitor on the server.
 *
 * This is a UX gate, not the security boundary. Row level security is what
 * actually protects the data — a forged client can reach the API, and gets
 * nothing back.
 */
export function useSession() {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: sessionKey,
		queryFn: async (): Promise<Session | null> => {
			const { data, error } = await supabase.auth.getSession();
			if (error) throw error;
			return data.session;
		},
		staleTime: Number.POSITIVE_INFINITY,
	});

	// Sign-in, sign-out and token refresh all have to reach the cache, including
	// when they happen in another tab.
	useEffect(() => {
		const { data } = supabase.auth.onAuthStateChange((_event, session) => {
			queryClient.setQueryData(sessionKey, session);
		});
		return () => data.subscription.unsubscribe();
	}, [queryClient]);

	return query;
}

export function useSignIn() {
	return useMutation({
		mutationFn: async ({
			email,
			password,
		}: {
			email: string;
			password: string;
		}) => {
			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password,
			});
			if (error) throw error;
			return data.session;
		},
	});
}

export function useSignUp() {
	return useMutation({
		mutationFn: async ({
			email,
			password,
		}: {
			email: string;
			password: string;
		}) => {
			const { data, error } = await supabase.auth.signUp({ email, password });
			if (error) throw error;
			return data.session;
		},
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const { error } = await supabase.auth.signOut();
			if (error) throw error;
		},
		onSuccess: () => {
			// Everything cached belongs to the user who just left.
			queryClient.clear();
		},
	});
}

/**
 * Supabase returns English error strings. These are the ones a single user
 * signing in to their own app will actually hit.
 */
export function authErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);

	if (/invalid login credentials/i.test(message))
		return "Email o contraseña incorrectos.";
	if (/user already registered/i.test(message))
		return "Ya existe una cuenta con ese email.";
	if (/password should be at least/i.test(message))
		return "La contraseña necesita al menos 6 caracteres.";
	if (
		/unable to validate email/i.test(message) ||
		/invalid email/i.test(message)
	)
		return "Ese email no parece válido.";
	if (/email not confirmed/i.test(message)) return "Falta confirmar el email.";
	if (/rate limit|too many/i.test(message))
		return "Demasiados intentos. Esperá un momento.";

	return message;
}
