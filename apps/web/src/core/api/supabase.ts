import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Browser Supabase client.
 *
 * Both values are safe in the bundle: the URL is public and the anon key is
 * designed to be published — every table is behind row level security, so the
 * key grants nothing on its own. The Gemini key is the opposite case and never
 * appears here.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
	throw new Error(
		"VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required. Copy .env.example to .env.",
	);
}

export const supabase = createClient<Database>(url, anonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		// The magic-link and OAuth callbacks land as a URL fragment, so the client
		// has to read it on load. Harmless for email/password sign-in.
		detectSessionInUrl: true,
	},
});
