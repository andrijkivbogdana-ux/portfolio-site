# Portfolio — bogdana andriikiv

One-page portfolio site, ported 1:1 from Figma
([My portfolio](https://www.figma.com/design/hA98tYVohqIYv10YlSnkYy/My-portfolio?node-id=456-1278), frame `Main`, node `456:1278`).

## Layout model

The Figma frame is a free-form collage — 1512 × 10761 px with every element on
absolute coordinates and no auto-layout. The port keeps that model:

- `.canvas` is a fixed **1512 × 10761** box; every element sits at its exact
  Figma coordinate.
- The canvas **never scales up**. Past 1512px the content keeps its design pixel
  size and is centred, and only the background stretches. Below 1512px the whole
  canvas scales down (`--scale`), so the composition shrinks as one piece instead
  of reflowing.
- The background reaches past the canvas by `--bg-overhang`,
  `max(0, (viewportWidth - 1512) / 2)` on each side — background tiles, the hero
  dim and the contact meadow — so the art is full-bleed at any width.
- External links get `target="_blank"` + `rel="noopener noreferrer"` from
  `script.js` rather than per-link markup, so swapping a placeholder anchor for a
  real URL is all that is needed.

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
Keyboard: the stickers are focusable and Escape closes. Touch: tap to toggle.
Everything softens under `prefers-reduced-motion`.

## Full-bleed background

The design canvas is 1512px, but the collage runs edge to edge at any width. JS
sets `--bg-overhang` to `max(0, (viewportWidth - 1512) / 2)`; the background
tiles and the contact meadow reach past the canvas by that much on each side.
Below 1512px the canvas already scales to fill the viewport exactly, so the
overhang is 0 and the tiles sit flush. Content stays on the 1512px canvas.

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

The seven meme slides sit stacked at their Figma positions and are advanced by
scroll: as the block travels through the viewport, each slide gets an equal
share of that journey and cross-fades into the next. There are no arrows and no
pagination — scrolling is the only control.

## Known gaps

- **Fixel Display** (the CTA paragraph) is not on Google Fonts. It currently
  falls back to Inter Bold. Self-host the family and the `--font-fixel` token
  picks it up.
- Below 1512 px the whole canvas scales down, so on a phone the text is small.
  A real mobile layout would need its own breakpoint — there is no mobile frame
  in the Figma file to port.
- Nav links, article links and the work cards point at in-page anchors. Swap in
  real URLs when the case studies and articles are published.

## Run

```bash
python3 -m http.server 4173 --directory .
```
