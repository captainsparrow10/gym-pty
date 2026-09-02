# gym-pty

A personal workout log for the web, with an AI training assistant.

Mobile-first: the phone is the design canvas, and on a wide screen the app stays
a centred 480px column rather than stretching. It is a plain web app — not a
PWA, and online-only.

## Stack

| Layer | Choice |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) on Vite |
| Routing | TanStack Router (file-based, typed search params) |
| Data | TanStack Query · Store · Virtual · Form · Table |
| Components | [shadcn/ui](https://ui.shadcn.com) on Radix |
| Styling | Tailwind CSS v4 |
| Auth + database | Supabase (Postgres + RLS) |
| AI | Gemini, behind a `createServerFn` |
| Toolchain | pnpm · Biome · TypeScript strict |

## Layout

```
apps/web            TanStack Start application
packages/shared     Domain calculations and the generated catalogue
scripts             Build-time data pipeline
supabase/migrations Database schema
```

`packages/shared` has no UI dependencies. Training maths (volume, estimated 1RM)
lives there so it can be tested and reused independently of the front end.

## Getting started

```sh
pnpm install
cp .env.example .env      # fill in the Supabase values
pnpm dev                  # http://localhost:3000
```

`GEMINI_API_KEY` is deliberately **not** prefixed with `VITE_`: anything with
that prefix is inlined into the client bundle, where an API key is public.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm build:catalog` | Regenerate the exercise catalogue and artwork |
| `pnpm check:contrast` | Verify design tokens meet WCAG contrast minimums |

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

The artwork is served from `public/` rather than bundled: 302 exercises come to
24.6 MB, and no one should download all of it to look at one squat.

## Credits and licensing

Exercise artwork and instructions are CC BY-SA 4.0. See [CREDITS.md](./CREDITS.md)
for full attribution — it is a licence condition, not a courtesy.
