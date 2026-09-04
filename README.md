# Portfolio — bogdana andriikiv

One-page portfolio site, ported 1:1 from Figma
([My portfolio](https://www.figma.com/design/hA98tYVohqIYv10YlSnkYy/My-portfolio?node-id=456-1278), frame `Main`, node `456:1278`).

## Layout model

The Figma frame is a free-form collage — 1512 × 10761 px with every element on
absolute coordinates and no auto-layout. The port keeps that model:

- `.canvas` is a fixed **1512 × 10761** box; every element sits at its exact
  Figma coordinate.
- `script.js` sets `--scale` to `min(1, viewportWidth / 1512)` and reserves the
  scaled height on `.stage`, so the composition stays pixel-identical at any
  width instead of reflowing.
- `transform-origin: top left` — the only origin that keeps the canvas inside
  the clipped stage when it is scaled below the viewport width.

Verified: all key elements land within ±1 px of their Figma coordinates, and the
document height is exactly 10761 px.

## Assets

`assets/img/` holds 69 files (8.3 MB), all exported from Figma:

| what | how |
| --- | --- |
| `bg-0…5.webp` | the `BG` frame rendered as one 1512 × 10032 PNG, sliced into six 1672 px tiles |
| `gallery-card.webp` | one "coming soon" card rendered whole — its case text sits under a frosted-glass overlay in the design, so it is not live text |
| everything else | individual image fills, resized to 2× display size (2400 px ceiling) and encoded as WebP q82 |

Originals totalled 163 MB; the optimised set is 8.3 MB.

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
