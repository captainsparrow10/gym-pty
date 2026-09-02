#!/usr/bin/env node
/**
 * End-to-end check of the session flow against the live database.
 *
 * The session screens sit behind the auth gate, so the server renders a splash
 * for them and they cannot be verified over HTTP. This exercises the same
 * queries the UI issues, as a real authenticated user, and then cleans up.
 *
 *   pnpm smoke:session
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
	bestOneRepMax,
	exerciseVolume,
	formatKg,
	type LoggedSet,
} from "../packages/shared/src/domain/index.ts";
import { ROOT } from "./lib/sources.ts";

const env = Object.fromEntries(
	readFileSync(path.join(ROOT, ".env"), "utf8")
		.split("\n")
		.filter((line) => line.includes("=") && !line.startsWith("#"))
		.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const check = (label: string, ok: boolean, detail = "") => {
	console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
	if (!ok) process.exitCode = 1;
};

/*
 * A throwaway account per run.
 *
 * Not @example.com: Supabase rejects it as an invalid address. The domain only
 * has to look real — nothing is ever sent to it.
 *
 * This requires "Confirm email" to be OFF for the project (Authentication >
 * Sign In / Providers > Email). With it on, signUp returns a user but no
 * session, and every authenticated query below fails.
 */
const email = `smoke-${Date.now()}@gmail.com`;
const password = "smoke-test-password";

console.log("→ auth");
const CONFIRM_HINT =
	"\n  El proyecto tiene la confirmación de email activada.\n" +
	"  Desactivala en Authentication > Sign In / Providers > Email > Confirm email\n" +
	"  y volvé a correr esto. Sin eso el registro no devuelve sesión y nada de\n" +
	"  lo que sigue puede autenticarse.";

const { data: signUp, error: signUpError } = await supabase.auth.signUp({ email, password });

if (signUpError) {
	// With confirmations on, Supabase tries to send mail and trips its own
	// built-in send limit long before anything here gets a session.
	if (signUpError.code === "over_email_send_rate_limit") {
		console.error(CONFIRM_HINT);
		process.exit(1);
	}
	throw signUpError;
}

if (!signUp.session) {
	console.error(CONFIRM_HINT);
	process.exit(1);
}

const userId = signUp.user?.id;
check("cuenta creada y con sesión", Boolean(userId));

// The schema creates a profile row from a trigger on auth.users.
const { data: profile } = await supabase.from("profiles").select("id, unit, rest_seconds").single();
check("perfil creado por el trigger", profile?.id === userId, `unit=${profile?.unit}`);

console.log("\n→ sesión");
const { data: session, error: sessionError } = await supabase
	.from("sessions")
	.insert({ user_id: userId as string })
	.select("id, started_at, finished_at")
	.single();
if (sessionError) throw sessionError;
check("sesión abierta", session.finished_at === null);

// The partial unique index must reject a second open session.
const { error: duplicate } = await supabase
	.from("sessions")
	.insert({ user_id: userId as string });
check("una sola sesión abierta por usuario", duplicate !== null, duplicate?.code ?? "");

console.log("\n→ ejercicios y series");
const { data: logged, error: loggedError } = await supabase
	.from("logged_exercises")
	.insert({ session_id: session.id, exercise_slug: "bench-press", position: 0 })
	.select("id")
	.single();
if (loggedError) throw loggedError;
check("ejercicio agregado", Boolean(logged.id));

const planned: LoggedSet[] = [
	{ reps: 10, weightKg: 60 },
	{ reps: 8, weightKg: 70 },
	{ reps: 6, weightKg: 80 },
];

const { error: setsError } = await supabase.from("sets").insert(
	planned.map((set, position) => ({
		logged_exercise_id: logged.id,
		position,
		reps: set.reps,
		weight_kg: set.weightKg,
	})),
);
if (setsError) throw setsError;
check("3 series registradas", true);

// The same shape the live session screen reads.
const { data: readBack } = await supabase
	.from("sessions")
	.select("id, logged_exercises(exercise_slug, sets(position, reps, weight_kg))")
	.is("finished_at", null)
	.maybeSingle();

const readSets = (readBack?.logged_exercises?.[0]?.sets ?? []).map((set) => ({
	reps: set.reps,
	weightKg: Number(set.weight_kg),
}));

check("se leen las 3 series", readSets.length === 3);

const volume = exerciseVolume({ slug: "bench-press", sets: readSets });
const oneRm = bestOneRepMax(readSets);
// 10x60 + 8x70 + 6x80 = 600 + 560 + 480
check("volumen correcto", volume === 1640, `${formatKg(volume)} kg`);
// Epley on the top set: 80 x (1 + 6/30) = 96
check("1RM estimado correcto", Math.abs(oneRm - 96) < 0.01, `${formatKg(oneRm)} kg`);

console.log("\n→ cierre");
const { error: finishError } = await supabase
	.from("sessions")
	.update({ finished_at: new Date().toISOString(), duration_sec: 3600 })
	.eq("id", session.id);
check("sesión cerrada", !finishError);

const { data: stillOpen } = await supabase
	.from("sessions")
	.select("id")
	.is("finished_at", null)
	.maybeSingle();
check("ya no queda sesión abierta", stillOpen === null);

// With the first one closed, a new session must be allowed.
const { error: secondError } = await supabase
	.from("sessions")
	.insert({ user_id: userId as string });
check("se puede abrir una nueva", !secondError);

console.log("\n→ aislamiento");
await supabase.auth.signOut();
const { data: leaked } = await supabase.from("sessions").select("id");
check("sin sesión no se lee nada", (leaked ?? []).length === 0, `filas=${(leaked ?? []).length}`);

const { error: forgedWrite } = await supabase
	.from("sessions")
	.insert({ user_id: userId as string });
check("sin sesión no se escribe", forgedWrite !== null, forgedWrite?.code ?? "");

console.log(
	`\n${process.exitCode ? "hubo fallos" : "todo en verde"} — usuario de prueba ${email}`,
);
console.log("borralo desde Authentication > Users en el dashboard si te molesta.");
