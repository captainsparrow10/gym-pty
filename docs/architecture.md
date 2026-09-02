# Architecture notes

Things that are not obvious from reading the code, and the traps that have
already cost real time. Everything here is a decision with a reason; where a
reason later turned out to be wrong, that is recorded too.

## The data model

```
profiles ─┬─ routines ─── routine_exercises ─┐
          │      └ weekdays[]                ├─ set_targets
          ├─ planned_exercises ──────────────┘
          ├─ sessions ─── logged_exercises ─── sets
          ├─ bodyweight
          └─ body_measurements
```

### A plan and a session are different things

`routines` and `planned_exercises` say what you intend to do. `sessions` says
what happened. They never merge, and the session screen deliberately has no
editor: a plan that rewrote itself from one bad day would stop being a plan.
The session links back to its routine for editing instead.

`sessions.routine_id` is what carries that link, and it is also what makes the
per-routine history ("last performed", "average volume") answerable at all.

### Routines and day plans are separate tables

A routine is a template: named, rated, repeated, and its history is the point.
Sometimes you just decide Thursday is deadlifts, once. Modelling that as a
routine was the obvious shortcut and gets worse over time — every one-off would
land in the routine list, the rating and averages would be meaningless on a
single-use row, and a routine has no date, so "what did I plan for Thursday"
could not be asked.

`routines.weekdays` answers "what does my week look like". `planned_exercises`
answers "what am I doing on Thursday". A day can have both, or neither, and
neither is a rest day.

### `set_targets` has two possible parents

One table serves both a routine exercise and an exercise planned for a date,
with two nullable foreign keys and

```sql
check ((routine_exercise_id is not null) <> (planned_exercise_id is not null))
```

Two near-identical tables would mean two of every query, mutation and editor,
drifting apart the first time one of them was fixed. The check is what the
nullable keys cannot express on their own: exactly one parent, never both and
never neither.

This replaced a single `target_sets` / `target_reps` / `target_weight` on the
exercise, which could only ever say "every set the same". Those columns were
dropped rather than kept in sync — two representations of one plan disagree the
moment either is edited.

### Ordering columns are `deferrable initially deferred`

`(parent, position)` uniqueness has to be deferrable, or a swap collides on its
first update. An immediate constraint is what caused an early reordering bug
that lost rows; `supabase/migrations/20260902030000_atomic_reorder.sql` moved
reordering into a Postgres function for the same reason.

## Cross-user reads

RLS is owner-only on everything. The three leaderboards are the sanctioned way
around it, and only in the aggregate direction:

| Function | Question |
|---|---|
| `leaderboard(days)` | Who trains the most |
| `exercise_leaderboard(slug, days)` | How does everyone do this movement |
| `category_leaderboard(slugs[], days)` | How does everyone do this muscle / machine |

All three are `security definer` with `set search_path = ''` and fully qualified
table names, which closes the usual hole where a caller able to create a schema
shadows an unqualified name. `revoke all ... from public` comes before the grant
to `authenticated`, because Postgres grants `EXECUTE` to `PUBLIC` by default and
through PostgREST that means anonymous.

They return aggregates and nothing else. There is no path from a returned row
back to an individual set.

**The category mapping stays out of Postgres.** A muscle or a piece of equipment
belongs to `packages/shared/catalog`, a build artefact the client already holds.
`category_leaderboard` takes the resolved slugs. Copying the classification into
the database would give the app two of them, disagreeing silently after the next
catalogue rebuild.

## Ranking on the right number

Estimated 1RM, not load: two people with 100 kg on the bar are not doing the
same thing if one did a single and the other did eight. Epley in SQL mirrors
`estimatedOneRepMax` exactly, including that a 1-rep set returns the load itself
rather than an estimate.

Unweighted work is stored at 0 kg, so a pull-up board ranked on load is a column
of zeroes ordered by nothing — a calisthenics lifter once led it by accident.
The ordering falls through `best_one_rm_kg → volume_kg → reps → top_seconds`;
each term only decides anything when the ones before it are tied at zero, which
is exactly when they do not apply. The UI picks its label from the data rather
than from the catalogue's exercise type, so a weighted pull-up switches back to
kilograms on its own.

## Dates are calendar days, not instants

A session dated `2026-08-31` happened on the 31st wherever you were. Both
directions of the JavaScript conversion have a trap and both were hit:

```js
new Date("2026-08-31")   // UTC midnight → reads as the 30th west of Greenwich
date.toISOString()       // converts to UTC → an evening in Panama is tomorrow
```

Use `parseIso` / `toIso` from `features/progress/queries.ts`. Skipping them
shifted every key in the weekly volume chart by one day: the series asked for
Sundays while the totals were filed under Mondays, so every lookup missed and
the chart read zero. It was invisible until there was more than a week of data.

Weekday indices are Monday-first (0 = Monday). `extract(dow)` in Postgres and
`getDay()` in JavaScript are both Sunday-first, so every crossing goes through
`weekdayOf()`.

## Layout

There is one content width, `CONTENT_WIDTH` in `core/ui/app-frame.tsx`, used by
the header and every page body so their left edges line up. There used to be
three, chosen per page, and the content edge moved as you navigated. Line length
is still a real constraint, but it belongs to a block of text rather than to the
page: a screen that needs a narrow reading column puts that column inside this
one.

**A scrollable region needs a bounded ancestor chain.** `h-dvh`, not
`min-h-dvh`, and `min-h-0` on every flex item between the scroll box and that
ancestor — a flex item's default minimum size is its content, so one missing
`min-h-0` silently disables the whole thing.

This was not cosmetic. With `min-h-dvh` the app shell never scrolled: the
document did, and the "scroll element" on the exercises page measured 9024px
tall. TanStack Virtual asks that element how big the viewport is, believed it,
and mounted all 304 rows; each row fetches its own artwork, and the resulting
burst of query notifications hit React's nested-update limit and took the page
down with `Maximum update depth exceeded`.

## Working on it

**PostgREST batch inserts.** A batch is normalised to the union of its keys and
an omitted column is sent as an explicit `NULL`, so a column default never
applies inside one. Name every column on every row, or insert one at a time.

**`numeric` comes back as a string.** The generated types say `number`; they are
wrong. Every read of a `numeric` column goes through `Number()`.

**`create or replace function` cannot change OUT parameters.** Adding a return
column needs `drop function if exists ... (argtypes)` first, or `db push` fails
with an unhelpful "rerun with --debug".

**A check constraint cannot contain a subquery.** Counting distinct array
elements needs one, so it lives in an `immutable` helper function that the
constraint calls.

**`sd` treats `$name` in a replacement as a capture group.** A rename turned
`to="/catalog/$slug"` into `to="/exercises/"`, which type checks and throws at
render — on the one page that mounted the component holding the link.
`pnpm --filter @gym/web check:links` exists to catch exactly that.

**Verify against hand-computed values, not against the code's own output.**
`check:estimates` asserts literals worked out on paper; a test that compares a
function to itself proves only that it is consistent.

**Realistic seed data is a test.** `seed:demo` writes a year for nine lifters
with different shapes — a strong low-volume one, a high-volume one, a beginner,
someone who trains only bodyweight — and it has already surfaced two bugs that
two-row fixtures could not.
