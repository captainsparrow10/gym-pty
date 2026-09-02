# Generating exercise art

The catalogue's illustrations are one filled SVG path with `fill-rule="evenodd"`
on a 512 × 512 canvas, drawn with `fill="currentColor"` so they take the theme's
colour. The white strokes are filled shapes; the body interior is a hole.

That is also what a bitmap tracer returns for line art, which is why a generated
image can round-trip into this format at all.

```sh
pnpm import:drawing <slug> <image.png> --weight 1              # one held pose
pnpm import:drawing <slug> <strip.png> --panels 3 --weight 1   # animated
```

`--weight` thickens the stroke before tracing. Generators reliably draw finer
lines than the catalogue's existing art, and asking for a thicker stroke in the
prompt is a request rather than a guarantee — dilating is deterministic. Start
at 1. Two is heavier than Everkinetic; zero is noticeably lighter beside it, and
at the 56px the catalogue list uses, lighter means harder to read.

---

## Prompt — a single pose

Copy this whole block, replacing only the line marked `EXERCISE`.

```
Anatomical line drawing of a single human figure.

EXERCISE: standing forward fold, feet together, knees straight, torso hinged
fully at the hips, hands reaching down to the floor, head hanging relaxed.

Style: clean white outline on a solid black background. Continuous closed
contour lines of even weight. Interior lines only where they describe real
anatomy — the edge of a muscle group, the ribcage, the line of a joint.

Line weight: every line at least 3 pixels thick. No hairlines.

Strictly: pure white lines on pure black. Nothing in between — no grey, no
colour, no gradient, no glow, no anti-aliased halo. No shading, no hatching,
no stippling, no texture.

Nothing but the figure: no floor, no mat, no shadow, no wall, no props unless
the exercise itself requires equipment. No text, no numbers, no arrows, no
labels, no logo, no watermark, no signature, no border.

Framing: the whole body inside the frame with a clear margin on every side.
Nothing cropped or touching an edge. Realistic human proportions and joint
angles. Side view or three-quarter view, whichever shows the position most
clearly. Square image.
```

## Prompt — a three-frame animation

Same rules, plus the panel instruction. Ask for one image, never three.

```
Three panels side by side in a single image, left to right, showing the same
human figure at three points of one movement.

EXERCISE: barbell bench press.
Panel 1: bar at arm's length above the chest, elbows locked.
Panel 2: bar halfway down, elbows at roughly forty-five degrees.
Panel 3: bar touching the chest, elbows bent fully.

The figure must be identical in all three panels: same body, same proportions,
same camera angle, same distance, same scale, same line weight. Only the limbs
move. The panels are equal width with no gap, no divider line and no border
between them.

Style: clean white outline on a solid black background. Continuous closed
contour lines of even weight. Interior lines only where they describe real
anatomy — the edge of a muscle group, the ribcage, the line of a joint.

Line weight: every line at least 3 pixels thick. No hairlines.

Strictly: pure white lines on pure black. Nothing in between — no grey, no
colour, no gradient, no glow, no anti-aliased halo. No shading, no hatching,
no stippling, no texture.

Nothing but the figure: no floor, no shadow, no background, no props unless the
exercise requires equipment. No text, no numbers, no arrows, no panel labels,
no logo, no watermark.

Framing: the whole body inside each panel with a clear margin. Nothing cropped
or touching an edge. Realistic proportions and joint angles.
```

---

## Why those constraints

Most of the prompt is not about taste. Each line exists because the tracer
needs it.

**"At least 3 pixels thick."** A one-pixel line survives on screen and does not
survive compression. Where it breaks, the traced outline opens and the fill
leaks across the figure.

**"Nothing in between — no grey."** Tracing binarises at a threshold. A grey
pixel lands on one side or the other of it, arbitrarily, and soft anti-aliased
edges come out ragged.

**"No floor, no mat, no shadow."** Anything drawn gets traced. Nothing else in
the catalogue has a floor, and a shadow becomes a solid blob.

**"No text, no watermark."** Same reason, and a traced watermark cannot be
removed afterwards without editing path data by hand.

**"Nothing touching an edge."** A limb cropped at the frame traces as a shape
cut flat against the border.

**"One image, not three."** Three separate generations produce three subtly
different people — different proportions, different angle, different line
weight — and the crossfade between them reads as a cut rather than as movement.
One image holding the sequence keeps a single figure.

## Why one shared transform

`--panels` splits the strip, traces each panel, and centres all of them using a
transform computed from the union of their bounds rather than each panel's own.

Scaling every frame to its own bounding box would resize the body each time a
limb moved: reaching an arm out makes that frame's box wider, so the figure
would shrink to fit and the animation would pulse.

## Checking the result

The importer prints the character count and subpath count per frame. Somewhere
between roughly twenty and eighty subpaths is a clean trace. Several hundred
means it picked up noise, usually a gradient or a watermark the prompt failed
to suppress. A handful means detail was swallowed — either the threshold or too
much `--weight`, since thickening merges neighbouring lines into one shape.

Character count is the better health check: it should stay roughly constant as
weight rises. If it collapses, the drawing did too.

Then look at it in the app. `/catalog/<slug>` draws it exactly as the catalogue
will.
