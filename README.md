# Portfolio — bogdana andriikiv

One-page portfolio site, ported 1:1 from Figma
([My portfolio](https://www.figma.com/design/hA98tYVohqIYv10YlSnkYy/My-portfolio?node-id=456-1278), frame `Main`, node `456:1278`).

## Layout model

The Figma frame is a free-form collage — 1512 × 10761 px with every element on
absolute coordinates and no auto-layout. The port keeps that model:

- `.canvas` is a fixed **1512 × 10761** box; every element sits at its exact
  Figma coordinate.
- The canvas **never scales up**. Past 1512px the content keeps its design pixel
  size and is centred, and only the background stretches. Between 900 and 1512px
  the whole canvas scales down (`--scale`), so the composition shrinks as one
  piece instead of reflowing.
- **At 900px it swaps canvases.** The scale is already 0.6 there and the body
  copy is down to 14px; a phone would put it at 6px. Below 900px the page
  switches to the mobile frame's own canvas, 393 × 8206 — see
  [Mobile layout](#mobile-layout).
- The background reaches past the canvas by `--bg-overhang`,
  `max(0, (viewportWidth - 1512) / 2)` on each side — background tiles, the hero
  dim and the contact meadow — so the art is full-bleed at any width.
- External links get `target="_blank"` + `rel="noopener noreferrer"` from
  `script.js` rather than per-link markup, so swapping a placeholder anchor for a
  real URL is all that is needed.
- **Section anchors** carry a `data-anchor` — the canvas y the block starts at,
  in the same unscaled Figma pixels as every inline `top`. Sections are only
  wrappers: their children are all absolutely positioned, so a section's own
  `offsetTop` is 0 and measuring it would send every nav link back to the top of
  the page. The nav bar and the footer share one delegated handler, so a block
  moves by editing its `data-anchor` and nothing else.

**Rotation.** Figma's `rotation` maps to CSS `rotate()` **with the same sign**,
about `transform-origin: 0 0` — the corner Figma rotates about. An element's
`absoluteBoundingBox` is the box of the *rotated* node, so it is never the size
to build at; use `size` + `relativeTransform` and let CSS do the rotation.

**Borders.** Figma strokes are drawn inside the frame and do not offset its
children. A CSS `border` does, so framed components use
`box-shadow: inset 0 0 0 Npx` instead — otherwise every child lands N px off.

Verified: key elements land within ±1 px of their Figma bounding boxes, and the
document height is exactly 10761 px.

## Assets

`assets/img/` holds 38 files (4.4 MB), all exported from Figma.

**Every standalone image is a rendered Figma node, not a raw image fill.** This
matters: the stickers carry rotations of up to 90°, some nodes stack two image
fills where the lower one is switched off, one node's only fill is invisible, and
several carry corner radii or a crop transform. Pulling the raw fill bitmap and
placing it in a box reproduces none of that. Asking Figma to render the node
bakes rotation, both fills, visibility, cropping and radius into the asset, and
its `absoluteBoundingBox` is then exactly where the asset goes — no CSS
transform needed.

| what | how |
| --- | --- |
| `bg-0…5.webp` | the `BG` frame rendered as one 1512 × 10032 PNG, sliced into six 1672 px tiles |
| `gallery-card.webp` | one "coming soon" card rendered whole — its case text sits under a frosted-glass overlay in the design, so it is not live text |
| stickers, thumbnails, decorations | one rendered node each, WebP; resized to 2× display size with a 2400 px ceiling — **never above the source's own resolution** |

Never upscale during conversion. `sips -Z` enlarges a source that is smaller
than the target, and interpolating up and then recompressing is what makes an
asset look mushy. The cap is `min(2 × display, native)`.

One asset is soft for a reason nothing here can fix: the third article's
thumbnail is **399 × 501** in the Figma file and is shown at 618 × 598, so the
browser upscales it. The node has a single image fill, so there is no
higher-resolution version to pull — replacing it in Figma is the only fix.

Originals totalled 163 MB; the optimised set is 4.4 MB.

## Hero hover hints

Ported from the six `Main_Hover` frames on the Figma "Site" page
([node 456:604](https://www.figma.com/design/hA98tYVohqIYv10YlSnkYy/My-portfolio?node-id=456-604)).
Pointing at a hero sticker dims the rest of the hero behind 49% black, lifts
that sticker above the dim, draws a hand-made arrow to it and drops in a label:

| sticker | label |
| --- | --- |
| toast | I bake bread, and I love bread |
| sneaker | Well, running is part of my life |
| portrait | Nice to meet you |
| fur letters Z-I-P | ZIP is my nickname |
| latte | I'm half made of coffee |
| cat | This is my cat |

Figma's z-order puts the dimming rectangle **above** the headline and the nav,
so those dim too — only the pointed-at sticker, its arrow and its label stay lit.

Two implementation notes:

- **Hit testing is per-pixel, not per-box.** The stickers are cut-out PNGs with
  heavily overlapping rectangles — the cat's box and the latte's box share a
  corner over empty sky — so `:hover` would fire the wrong hint, or fire one
  over transparent background. Each sticker gets a cached, downscaled alpha map
  and the topmost sticker that is actually opaque under the pointer wins. If a
  canvas read is blocked (opening the page over `file://` taints it), it falls
  back to rectangle hit testing.
- **Arrows are inlined SVG, not `<img>`.** Each is a single stroked path, so the
  draw-on is a `stroke-dashoffset` transition over a dash length measured at
  runtime with `getTotalLength()` — nothing hard-coded per arrow.

The hover frames carry no prototype timing, so the durations (620 ms draw,
260 ms dim, label settling at 62% of the draw) are authored, not exported.
Keyboard: the stickers are focusable and Escape closes. Between 900 and 1512px
a touch device taps to toggle; below 900px the mobile frame carries no hints at
all, so they are off entirely — arrows and button semantics both.
Everything softens under `prefers-reduced-motion`.

## Full-bleed background

The design canvas is 1512px, but the collage runs edge to edge at any width. JS
sets `--bg-overhang` to `max(0, (viewportWidth - 1512) / 2)`; the background
tiles and the contact meadow reach past the canvas by that much on each side.
Between 900 and 1512px the canvas already scales to fill the viewport exactly,
so the overhang is 0 and the tiles sit flush, and content stays on the 1512px
canvas. Below 900px the mobile canvas carries the same tiles at their design width,
moved to x −559 as the frame places them, and 1512px is wider than that
breakpoint can be — so the tiles need no overhang of their own. The overhang is
still computed there, in canvas px, for the two pieces that do: the contact
meadow is only 402 wide and the memes laptop 837, and past the scale cap the
canvas stops growing while the viewport does not, which would leave each of them
a band with sky either side. The meadow stretches into it; the laptop crops,
because a stretched lid is obvious and a cropped one is a slightly taller lid.

The tiles stretch horizontally rather than cropping — `object-fit: cover` would
make each tile crop its own middle and the six slices would stop lining up. On
an abstract landscape the stretch reads fine to roughly 2×; past ~3000px it
starts to show.

## Articles block

Ported from the Figma "Root Frame"
([node 489:1830](https://www.figma.com/design/hA98tYVohqIYv10YlSnkYy/My-portfolio?node-id=489-1830)).

Each card is **1340 × 622** and rotated ±2° about its top-left corner — the same
origin Figma rotates about, so `left`/`top` stay the design coordinates and
`transform-origin: 0 0` does the rest. Their bounding boxes (1361 × 668) are the
box of the *rotated* card and are not what gets built.

The block's own decoration is four rendered nodes: the torn grid-paper backing
(five rotated textures flattened into one), the binder clip, the pushpin and the
paperclip. Thumbnails stay raw image fills so they can sit unrotated inside a
rotated card — `object-fit: cover` for the Figma `FILL` one, `fill` for the two
`STRETCH` ones.

Typography is Londrina Solid 40/47 for titles and Inter Light 24/29 for body.
All six text blocks match their Figma heights exactly (188, 174, 141, 232, 94,
203 px), which also means the line breaks match. One paragraph needed help:
Google's Inter is slightly narrower than the cut Figma renders with, and in card
two that was enough for one word to squeeze onto the previous line. The box keeps
its 658px design width and `padding-right` moves the wrap point in — see
`.card p.metric-fix`.

## Memes block

The block pins. Scrolling into it holds the view still — heading and slide stack
framed together — while the seven slides cross-fade one into the next, 320px of
scroll each; past the last one the page carries on.

The pin is done by pushing the canvas down by exactly as much as the page
scrolls, so the view stands still without any position juggling. The document
carries `slides × 320px` of extra height for that runway, and anchor navigation
adds it back for targets below the block. There are no arrows and no pagination
— scrolling is the only control.

Three things keep it from stuttering, all learned the hard way:

- **No CSS transition on the slides.** Opacity and transform are written every
  frame from the scroll offset; a transition trying to animate the same
  properties fights those writes and the result judders.
- **No custom property on `:root`.** The pin offset is written straight onto the
  canvas element. An inherited custom property invalidates style for every
  element in the page on each frame.
- **No `requestAnimationFrame` hop.** The browser already coalesces scroll to one
  event per frame; the extra hop only adds a frame of lag, which reads as the
  animation dragging behind the wheel.

The slides are *dealt*, not cross-faded: each arrives opaque, sliding up 150px
on an ease-out with a slight tip, and covers the one before it. An earlier
version cross-faded, which meant two memes showing through each other at every
handover — the fade is now short enough (45px of scroll) that it happens while
the card is still far out and moving fast, so it reads as motion.

## Known gaps

- **Fixel Display** (the CTA paragraph) is not on Google Fonts. It currently
  falls back to Inter Bold. Self-host the family and the `--font-fixel` token
  picks it up.
- The four work cards are still placeholders in the Figma file — a blurred
  "Case Name / +11% / Metrics" behind frosted glass — so the mobile card reuses
  the desktop's flat export rather than rebuilding that placeholder as live
  text. Swapping in real case copy means re-exporting both.
- Nav links, article links and the work cards point at in-page anchors. Swap in
  real URLs when the case studies and articles are published.
- **Resume** points at `assets/resume.pdf`, which is not in the repo yet. Drop
  the PDF in at exactly that path and the tab works — the anchors already carry
  `target="_blank"` in both the nav bar and the footer, since `script.js` only
  re-targets cross-host `http(s):` links and a same-origin file is not one.

## Mobile layout

Ported from the Figma frame `iPhone 16 - 1` on the Site page — **393 × 8206**.
It is not a reflow of the desktop design: it is a second canvas, built the same
way, every element on an absolute coordinate inside a fixed box. So the mobile
block at the end of `styles.css` does not rebuild the page, it swaps the
coordinate set. Each element carries its mobile `left/top/width/height` inline
as `--m-*` beside its desktop ones, and one rule reads them:

```css
.a {
  left:  var(--m-l) !important;
  top:   var(--m-t) !important;
  width: var(--m-w) !important;
  ...
}
```

`!important` is the point of that rule rather than a smell — the desktop
coordinate is an inline style on every one of these elements, and an inline
style is exactly what it has to reach past. Keeping the mobile value inline too
means both sets sit on the element together instead of a stylesheet holding half
the answer.

**Nothing needed re-exporting.** Every rotation in the mobile frame is identical
to the desktop one to two decimals — the same nodes, just smaller — so every
asset, with its rotation already baked in, drops straight in at the mobile
bounding box. The work card is the same composition at 0.5435 scale (650 × 873
→ 353 × 475, gem 275 → 149.4), so even the flat card export reuses cleanly. Two
exceptions, both handled in CSS: the About gem is rotated 10.21° further here
and gets that difference back as a rotation, and the contact heading is a live
text node booleaned into the meadow rather than baked into the artwork, so the
element that exists for the document outline becomes the heading itself.

**Scale mirrors the desktop rule.** There it is `min(1, width / 1512)` — fit the
design, never past it. Here it is `min(1.35, width / 393)`: a phone narrower
than the frame scales down, a wider one scales up so the art still reaches both
edges, and past about 530px it stops and centres on the sky, exactly as the
desktop canvas stops at 1512. Centring is a translate rather than an auto
margin, because a margin centres the box *before* the transform and past the cap
the two disagree.

The background tiles need no overhang here: the frame drops the desktop `BG` in
whole — 1512 wide at x −559 — and lets the 393px artboard crop it, and 1512
design px is wider than this breakpoint can ever be. The contact meadow and the
memes laptop do need one, though, and take it the same way the desktop art does.

Three things differ from the desktop and are worth knowing:

- **No header menu.** The frame keeps only the wordmark up top; the four links
  live in the footer, stacked. Anchor navigation switches from `data-anchor` to
  `data-m-anchor`, the same block's y on the 393 × 8206 grid.
- **The memes are a strip.** `Frame 13` is a horizontal row of eight prints,
  2483px of them across a 393px artboard with clipping off. So the deck's
  scroll-driven dealing — a wheel gesture — stands down and the row becomes a
  snapping swipe. The prints are wider than the frame's containers (the design
  crops each meme to its own box, the asset is the whole print), so each is
  fitted inside the row's box and keeps its own proportions.
- **The hover hints are gone**, which the frame agrees with: their arrows are
  single paths drawn in the 1512px frame's own coordinates and point nowhere
  here, so the button semantics come off the stickers with them.

`script.js` carries the same switch. The four scroll scenes are written in
canvas coordinates against elements the mobile frame re-poses, so they stand
down, and `resetScenes()` wipes every inline style they left behind — an inline
transform would outrank the mobile rules.

Verified: all 42 measured elements land within **0.01px** of their Figma
bounding box once the hero's levitation is frozen (the stickers drift around
their design position by design), and the document is exactly 8206 × scale.

## Run

```bash
python3 -m http.server 4173 --directory .
```
