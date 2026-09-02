import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync("/Users/sparrow/Development/GYM/.env","utf8")
  .split("\n").filter(l=>l.includes("=")&&!l.startsWith("#"))
  .map(l=>[l.slice(0,l.indexOf("=")), l.slice(l.indexOf("=")+1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const check=(l:string,ok:boolean,d="")=>{console.log(`  ${ok?"✓":"✗"} ${l}${d?"  "+d:""}`); if(!ok) process.exitCode=1;};

const { data: up } = await sb.auth.signUp({ email:`smoke-${Date.now()}@gmail.com`, password:"smoke-test-password" });
const userId = up!.user!.id;

// Réplica exacta de useAddToSession
async function addToSession(slug: string) {
  const { data: existing } = await sb.from("sessions")
    .select("id, logged_exercises(exercise_slug, position)").is("finished_at", null).maybeSingle();
  let sessionId = existing?.id; let position = 0;
  if (existing) {
    if ((existing.logged_exercises ?? []).some((e:any)=>e.exercise_slug===slug))
      return { sessionId: existing.id, added:false };
    position = Math.max(-1, ...(existing.logged_exercises ?? []).map((e:any)=>e.position)) + 1;
  } else {
    const { data: created } = await sb.from("sessions").insert({ user_id:userId }).select("id").single();
    sessionId = created!.id;
  }
  const { error } = await sb.from("logged_exercises")
    .insert({ session_id: sessionId!, exercise_slug: slug, position });
  if (error) { if (!existing && sessionId) await sb.from("sessions").delete().eq("id", sessionId); throw error; }
  return { sessionId: sessionId!, added:true };
}

console.log("→ sin sesión abierta");
const r1 = await addToSession("seated-dumbbell-press");
check("abre sesión y agrega", r1.added);

console.log("\n→ con sesión abierta");
const r2 = await addToSession("bench-press");
check("agrega a la misma sesión", r2.added && r2.sessionId === r1.sessionId);

console.log("\n→ repetido");
const r3 = await addToSession("seated-dumbbell-press");
check("no duplica", !r3.added, "added=false");

const { data: rows } = await sb.from("logged_exercises")
  .select("exercise_slug, position").eq("session_id", r1.sessionId).order("position");
check("2 ejercicios, posiciones 0 y 1", rows!.length===2 && rows![0].position===0 && rows![1].position===1,
      rows!.map((r:any)=>`${r.position}:${r.exercise_slug}`).join(" "));

console.log("\n→ una sola sesión abierta");
const { data: open } = await sb.from("sessions").select("id").is("finished_at", null);
check("exactamente una", open!.length===1, `abiertas=${open!.length}`);

await sb.from("sessions").delete().eq("id", r1.sessionId);
console.log(`\n${process.exitCode ? "hubo fallos" : "todo en verde"}`);
