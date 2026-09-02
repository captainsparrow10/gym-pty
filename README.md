# gym-pty

A personal workout log for the web.

Mobile-first — the phone is the design canvas — and a real application on a
desktop: a sidebar and a content column capped at 1280px, not a phone column
centred in an empty screen. It is a plain web app: not a PWA, and online-only.

## Stack

| Layer | Choice |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) on Vite |
| Routing | TanStack Router (file-based, typed search params) |
| Data | TanStack Query · Store · Virtual · Form · Table |
| Components | [shadcn/ui](https://ui.shadcn.com) on Radix |
| Charts | Recharts, through shadcn's `Chart` |
| Styling | Tailwind CSS v4 |
| Auth + database | Supabase (Postgres + RLS) |
| AI | Gemini, behind a `createServerFn` — not wired up yet |
| Toolchain | pnpm · Biome · TypeScript strict |

## Layout

```
apps/web            TanStack Start application
packages/shared     Domain calculations and the generated catalogue
scripts             Build-time data pipeline, smoke tests, seeding
supabase/migrations Database schema
docs                Notes on the parts that are not obvious from the code
```

`packages/shared` has no UI dependencies. Training maths — volume, estimated
1RM, session duration, progression — lives there so it can be tested and reused
independently of the front end.

## Getting started

```sh
pnpm install
cp .env.example .env      # fill in the Supabase values
pnpm dev                  # http://localhost:3000
```

`GEMINI_API_KEY` is deliberately **not** prefixed with `VITE_`: anything with
that prefix is inlined into the client bundle, where an API key is public.

## What it does

**Exercises** — 304 movements, every one with three-frame artwork and
instructions. Searchable and filterable by muscle, equipment and type, with the
filters in the URL. Each exercise has its own page carrying your history and a
board showing how everyone else does it.

**Plan** — routines you name, rate, schedule to weekdays and make public or
private, plus one-off plans attached to a single date when a routine would be
overkill. Both carry per-set targets, so a plan can say "8 at 60, 6 at 70, 4 at
80" rather than only "4 × 8".

**Session** — the live logging screen, and the only thing that writes the `sets`
table: every number in every chart and leaderboard comes from here. Rest timer,
Screen Wake Lock, and the next load suggested from your own history.

**Home** — what today is for, the shape of the week, a year of training days,
volume and strength over time, and your body measurements.

**Rankings** — your own training ranked by exercise, muscle, equipment or type,
and the same cuts across every public profile.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm build:catalog` | Regenerate the exercise catalogue and artwork |
| `pnpm import:drawing` | Turn one generated line drawing into catalogue art |
| `pnpm seed:demo` | Fill the database with a year of invented training (`--clear` undoes it) |
| `pnpm clean:test-users` | Delete the accounts the smoke scripts leave behind |
| `pnpm smoke:*` | Exercise one flow against the live database and clean up after itself |
| `pnpm check:estimates` | Verify the duration, calorie and progression maths |
| `pnpm check:contrast` | Verify design tokens meet WCAG contrast minimums |
| `pnpm --filter @gym/web check:links` | Verify every `<Link to>` points at a route that exists |

Everything under `smoke:` runs against the real database with the anon key, so
it exercises the same RLS the app does. Each signs up a throwaway user and
deletes its rows; `clean:test-users` removes the leftover accounts, which
otherwise show up on the leaderboard as people with zero volume.

### The catalogue pipeline

`pnpm build:catalog` is run occasionally, not on every build; its output is
committed. It sparse-checks out two upstream repositories, extracts the SVG path
data for 302 exercises into `apps/web/public/art/`, and merges the metadata with
step-by-step instructions.

The upstream catalogue is strength and calisthenics only. Exercises outside that
— yoga, pilates — go in `scripts/data/extra-exercises.json`, which the merge
stage appends, and their artwork is imported separately with
`pnpm import:drawing` (see [docs/generating-art.md](./docs/generating-art.md)).

Note the ordering: `build:catalog merge` rewrites the catalogue from scratch and
drops the generated instructions, so `build:catalog:ai steps` has to follow it.
That second command reads from cache and costs no quota.

The artwork is served from `public/` rather than bundled: 304 exercises come to
24.6 MB, and no one should download all of it to look at one squat.

## Notes

[docs/architecture.md](./docs/architecture.md) covers the data model and the
decisions that are not obvious from reading the code — why a plan and a session
are separate things, why the leaderboards are Postgres functions, and the traps
that have already cost a day each.

## Credits and licensing

Exercise artwork and instructions are CC BY-SA 4.0. See [CREDITS.md](./CREDITS.md)
for full attribution — it is a licence condition, not a courtesy.
