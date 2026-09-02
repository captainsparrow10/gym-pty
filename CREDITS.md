# Credits

## Exercise illustrations

The exercise artwork in `apps/web/public/art/` comes from
[Workout Guide](https://github.com/bryllim/workout-guide) by
[Bryl Lim](https://bryllim.com), which builds on pose artwork from
[Everkinetic](https://github.com/everkinetic/data).

Both are licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and this
project's copy stays under that same licence.

**Changes made.** Each Workout Guide frame is a 512 × 512 SVG containing a
single `<path>`. `scripts/build-catalog.ts` extracts the `d` attribute of that
path into one JSON file per exercise — three entries, one per frame — so the app
can draw it with `fill="currentColor"` and tint it with the active theme instead
of shipping a fixed colour. The geometry is untouched.

Every exercise in the catalogue is keyed by the Workout Guide slug, so any frame
can be traced back to its original.

> Note: the published npm package `@bryllim/workout-guide@1.0.0` ships PNG
> frames only. The SVG frames exist in the repository, which is why the build
> pipeline reads from a sparse checkout rather than from npm.

## Exercise instructions

Step-by-step instructions are drawn from
[Everkinetic](https://github.com/everkinetic/data) (CC BY-SA 4.0) where an
exercise could be matched to an everkinetic entry by its source id.

Instructions for exercises with no everkinetic counterpart are generated. They
are marked `stepsFrom: "generated"` in the catalogue so the two are never
confused. No fuzzy name matching is used: measured against this data it produced
confident but wrong pairings (matching "Overhead Press" to "JM Press", or
"Cable Lateral Raise" to "Seated Rear Lateral Cable Raise"), and serving the
wrong instructions for a loaded movement is an injury risk.

## Body model

The muscle map is [react-body-highlighter](https://github.com/giavinh79/react-body-highlighter)
by Gia Vinh Lam, MIT licensed.

## Fonts

Barlow and Barlow Condensed, by Jeremy Tribby, under the
[SIL Open Font License](https://openfontlicense.org/).

## Components

UI components from [shadcn/ui](https://ui.shadcn.com) (MIT), built on
[Radix Primitives](https://www.radix-ui.com) (MIT).
