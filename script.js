/* ============================================================================
   Canvas scaling + memes deck
   ========================================================================== */

(function () {
  'use strict';

  var CANVAS_W = 1512;
  var CANVAS_H = 10761;

  // The pinned area covers the heading and the deck together, so both stay
  // framed while the pile plays. PER_SLIDE is how much scrolling each meme gets
  // before it hands over to the next.
  var MEMES_TOP = 5724;   // "Break for memes"
  var MEMES_H   = 834;    // down to the bottom of the lowest card
  var PER_SLIDE = 280;

  var stage  = document.getElementById('stage');
  var canvas = document.getElementById('canvas');
  var scale  = 1;

  var slides = Array.prototype.slice.call(
    document.querySelectorAll('#memes-carousel .slide'));
  var heading = document.getElementById('memes-h');
  var last    = slides.length - 1;

  // Holding the page still is a desktop affordance. On touch it fights the
  // momentum scroller — the pin can only be corrected once per frame from the
  // main thread, and every frame it misses shows up as the whole block jumping
  // — and with reduced motion it has no business stopping the page at all.
  // Without the pin the deck simply plays as the block crosses the viewport.
  var mqPin = window.matchMedia(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Below this width the page stops being a scaled 1512px canvas and becomes an
  // ordinary flowing document — see the mobile block at the end of styles.css.
  // Every scroll scene below is written in canvas coordinates and against
  // elements the mobile layout re-poses, so in that mode they all stand down and
  // the stylesheet has the page to itself.
  var mqMobile = window.matchMedia('(max-width: 899px)');
  var mobile   = mqMobile.matches;

  // The mobile design is its own canvas — the Figma frame "iPhone 16 - 1",
  // 393 x 8206 — and it is fitted by the mirror of the desktop rule. There the
  // canvas may only shrink; here it may also grow, so the art still reaches
  // both edges of a phone wider than the frame, and it stops at M_SCALE_MAX
  // and centres rather than climbing all the way to the breakpoint.
  var M_W = 393;
  var M_SCALE_MAX = 1.35;

  var runway  = 0;   // extra document height the pin borrows
  var pinFrom = 0;   // scroll offset where pinning starts

  /* --- keep the 1512px canvas proportionally fitted to the viewport ------- */

  function fit() {
    var was = mobile;
    mobile = mqMobile.matches;
    document.documentElement.classList.toggle('is-mobile', mobile);

    if (mobile) {
      var cw = document.documentElement.clientWidth;
      scale = Math.min(M_SCALE_MAX, cw / M_W);
      runway = 0; pinFrom = 0;
      document.documentElement.style.setProperty('--scale', scale);
      // The background tiles are 1512 design px on a 393px frame, so they reach
      // past any viewport this breakpoint allows on their own. The contact
      // meadow does not — it is 402 wide, barely wider than the canvas — and
      // past the scale cap the canvas stops growing while the viewport does
      // not, which leaves the meadow a band with sky either side of it. So it
      // gets the same overhang the desktop gives it, in canvas px: how far the
      // canvas has to reach on each side to cover the viewport.
      document.documentElement.style.setProperty('--bg-overhang',
        Math.max(0, (cw / scale - M_W) / 2).toFixed(2) + 'px');
      // Centring is a translate rather than an auto margin, because the margin
      // centres the box before the scale and past the cap the two disagree.
      document.documentElement.style.setProperty('--m-shift',
        ((cw - M_W * scale) / 2).toFixed(2) + 'px');
      document.documentElement.classList.remove('js-reveal');
      // height and transform both come from the stylesheet in this mode
      stage.style.height = '';
      canvas.style.transform = '';
      canvas.style.willChange = '';
      pinCss = '';
      // Unconditionally, not just on the crossing. A viewport change can arrive
      // as several events in a row — a resize, then the pointer query flipping,
      // then the width query — and if any of them lands while the width still
      // reads as desktop, that pass draws the scenes again after the crossing
      // has already cleaned up. Every write here is a no-op once the styles are
      // clear, so repeating it costs nothing and closes the race.
      resetScenes();
      return;
    }
    if (was) armReveal();

    // Never scale up: past the 1512px design width the content stays at its
    // Figma pixel size and is centred, and only the background stretches.
    // Below it, the whole canvas scales down so the design still fits.
    // clientWidth, not innerWidth: a classic scrollbar is inside innerWidth but
    // outside the box the canvas is centred in, and counting it would scale the
    // page a scrollbar's width too wide and clip its right edge.
    scale = Math.min(1, document.documentElement.clientWidth / CANVAS_W);
    document.documentElement.style.setProperty('--scale', scale);

    // The memes block is held still while its deck plays, so the document
    // carries that much extra height and everything after it sits lower.
    runway  = mqPin.matches ? slides.length * PER_SLIDE : 0;
    pinFrom = Math.max(0, (MEMES_TOP + MEMES_H / 2) * scale - window.innerHeight / 2);
    stage.style.height = (CANVAS_H * scale + runway) + 'px';

    // how far the background has to reach past the 1512px canvas on each side to
    // stay full-bleed. Narrower than that, the canvas is already wider than the
    // viewport and the background covers it.
    var overhang = Math.max(0, (document.documentElement.clientWidth - CANVAS_W) / 2);
    document.documentElement.style.setProperty('--bg-overhang', overhang + 'px');

    pinCss = '';            // the scale changed, so the cached string is stale
  }

  /* --- the deck ----------------------------------------------------------- */

  // Each meme is a print dealt onto the laptop. It sweeps in from the side,
  // undersized and tipped back, turns flat and lands on top of the pile with a
  // small overshoot. The card it covers doesn't disappear — it sinks back a
  // step, fans out to its own angle and takes on some shade, so the stack
  // visibly grows underneath rather than the memes just replacing each other.
  //
  // Nothing ever cross-fades between two visible memes: a card is opaque within
  // a sliver of its arrival, while it is still small and far and moving fast,
  // so that reads as motion rather than as a fade.

  var ENTER  = 1;       // a card lands exactly as the next one sets off, so
                        // there is always something moving and never a lull
  var OPAQUE = 0.14;    // share of a slot spent becoming solid
  var DEPTH  = 3.4;     // slots over which a covered card sinks into the pile
  var SMOOTH = 0.20;    // deck spring, per 60Hz frame

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // Eases out AND in. An ease-out alone put the whole arrival in the first
  // third of the slot and left the rest of it dead, which is what made the
  // block read as a series of little jolts rather than as a run.
  function glide(t) { return t * t * (3 - 2 * t); }
  function outQuad(t) { var m = 1 - t; return 1 - m * m; }
  // a nudge past the resting size just before the card lands, gone again by the
  // time it gets there — the flick of a print being dropped on the pile
  function land(t) { return Math.sin(Math.PI * Math.pow(t, 2.4)); }

  // A stable hash, so the scatter is hand-dropped rather than mechanical but
  // stays identical between reloads and across resizes.
  function noise(i, k) {
    var x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;                      // -1 … 1
  }

  var cards = slides.map(function (el, i) {
    var side = i % 2 ? -1 : 1;
    return {
      el:   el,
      inX:  side * (86 + 30 * Math.abs(noise(i, 1))),        // where it comes from
      inY:  74 + 16 * noise(i, 2),
      inZ:  side * (9 + 5 * Math.abs(noise(i, 3))),          // turn on the way in
      inT:  15 + 6 * Math.abs(noise(i, 4)),                  // tip on the way in
      // Cards fan alternately left and right as they are buried, each keeping
      // the side it flew in from, so the pile grows outwards both ways instead
      // of leaning.
      offX: side * (17 + 15 * Math.abs(noise(i, 5))),
      offY: -11 - 14 * Math.abs(noise(i, 6)),
      rot:  side * (4 + 4 * Math.abs(noise(i, 7))),
      css:  '', op: '', sink: ''
    };
  });

  function drawDeck(s) {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var u = s - i + 1;                       // 0 = about to arrive, 1 = on top

      if (u <= 0) { setStyle(c, 'op', 'opacity', '0.000'); continue; }
      setStyle(c, 'op', 'opacity', clamp01(u / OPAQUE).toFixed(3));

      var e = clamp01(u / ENTER);
      var rest = 1 - glide(e);                 // the run in, eased at both ends
      var turn = 1 - outQuad(e);               // angles flatten before it lands

      var p = clamp01((u - 1) / DEPTH);        // how far it has sunk into the pile
      var b = 1 - (1 - p) * (1 - p);           // most of that happens right away

      setStyle(c, 'css', 'transform',
        'translate3d(' + (c.inX * rest + c.offX * b).toFixed(2) + 'px,'
                       + (c.inY * rest + c.offY * b).toFixed(2) + 'px,0)'
        + 'rotate('  + (c.inZ * turn + c.rot * b).toFixed(2) + 'deg)'
        + 'rotateX(' + (c.inT * turn - 3 * b).toFixed(2) + 'deg)'
        + 'scale('   + ((0.82 + 0.18 * (1 - rest) + 0.02 * land(e)) * (1 - 0.105 * b)).toFixed(4) + ')');

      // one number drives both halves of the shading filter; two decimals is
      // finer than the eye can follow and keeps most frames from writing at all
      setStyle(c, 'sink', '--sink', b.toFixed(2));
    }

    // the heading drifts a touch against the deck — a hint of depth
    if (heading && last > 0) {
      var y = (-30 * (s / last)).toFixed(2) + 'px';
      if (y !== headCss) { headCss = y; heading.style.transform = 'translate3d(0,' + y + ',0)'; }
    }
  }

  // Writing a style that is already set still costs a style invalidation, and
  // at 7 cards a frame that adds up — so every write goes through here.
  function setStyle(c, key, prop, value) {
    if (c[key] === value) return;
    c[key] = value;
    if (prop.charCodeAt(0) === 45) c.el.style.setProperty(prop, value);
    else c.el.style[prop] = value;
  }

  var headCss = '';

  /* --- about: the folder is pulled out, then laid up ---------------------- */

  // Scrubbed off the scroll, like the deck above, rather than played on a timer
  // once the block appears: the composition assembles as you come down to it,
  // and comes apart again on the way back up.
  //
  // Two scenes, because it runs from the gem at canvas y 6805 down to the
  // button at 8082 — about a screen and a half. One range over all of it would
  // either crawl, or finish the card and its button while they were still below
  // the fold. Each scene is measured off an element with a clean box: #about-h
  // sits 57px under the top of the folder artwork and .about-card is a plain
  // div, unlike the images, whose boxes carry a few hundred px of transparent
  // margin around the art. Measuring live rects also means the canvas scale and
  // the memes pin are already accounted for — there is no arithmetic here to
  // keep in step with them.

  var FADE = 0.24;      // share of a part's window spent becoming solid

  //           selector, window start & length, and the pose it travels in from
  function part(sel, at, len, x, y, rot, sc, fadeAt) {
    var el = document.querySelector(sel);
    if (!el) return null;
    return { el: el, at: at, len: len, x: x, y: y, rot: rot, sc: sc,
             fadeAt: fadeAt || 0, css: '', op: '', home: false };
  }

  // head and tail are where the reference element's top sits, as a share of the
  // viewport height, when the scene starts and when it finishes
  var reveal = [
    { ref: '#about-h', head: 0.95, tail: 0.15, parts: [
      part('[data-in="folder"]', 0.00, 0.42,   0,  210, -2.6, 0.93),
      part('[data-in="note"]',   0.13, 0.40, -96,  -86, -8,   0.92),
      part('[data-in="title"]',  0.26, 0.34,   0,   56,  0,   0.90),
      part('[data-in="orb"]',    0.34, 0.40,  64,   72,  0,   0.55),
      part('[data-in="gem"]',    0.48, 0.38,   0,  -84, -46,  0.35)
    ]},
    // The card and the button are welded along one edge, so they travel on a
    // single window — anything else tears a gap open between them. Only the
    // button's fade is held back.
    { ref: '.about-card', head: 1, tail: 0.25, parts: [
      part('[data-in="card"]',   0.00, 0.62,   0,  140,  0,   1),
      part('[data-in="btn"]',    0.00, 0.62,   0,  140,  0,   1, 0.22)
    ]}
  ].filter(function (s) {
    s.el = document.querySelector(s.ref);
    s.parts = s.parts.filter(Boolean);
    s.pos = s.target = 0;
    return s.el && s.parts.length;
  });

  // Nothing is hidden until this class is set, and it is only set once the
  // scenes are known to be present and worth playing — so with scripting off,
  // or with reduced motion, the block simply renders.
  var canReveal = reveal.length > 0 && !mqReduce.matches;
  if (!canReveal) reveal = [];

  // Armed per mode rather than once at startup: the mobile layout lays the
  // block out itself and must never be handed a hidden part to reveal.
  function armReveal() { if (canReveal) document.documentElement.classList.add('js-reveal'); }
  if (!mobile) armReveal();

  function aimAbout() {                                  // reads, no writes
    var vh = window.innerHeight;
    for (var i = 0; i < reveal.length; i++) {
      var s = reveal[i];
      s.target = clamp01((s.head * vh - s.el.getBoundingClientRect().top) /
                         ((s.head - s.tail) * vh));
    }
  }

  function drawAbout(f) {                                // writes, no reads
    for (var i = 0; i < reveal.length; i++) {
      var s = reveal[i];
      s.pos += (s.target - s.pos) * f;
      if (Math.abs(s.target - s.pos) < 0.0008) s.pos = s.target;
      for (var j = 0; j < s.parts.length; j++) place(s.parts[j], s.pos);
    }
  }

  function aboutSettled() {
    for (var i = 0; i < reveal.length; i++) {
      if (reveal[i].pos !== reveal[i].target) return false;
    }
    return true;
  }

  function place(p, s) {
    var u = clamp01((s - p.at) / p.len);

    // Once a part is home it is handed back to the stylesheet: the inline
    // transform comes off, which is what lets the button keep its own hover
    // lift instead of being outranked by a written-in identity transform.
    if (u >= 1) {
      if (p.home) return;
      p.home = true;
      p.css = p.op = '';
      p.el.style.transform = p.el.style.opacity = '';
      p.el.classList.add('is-in');
      return;
    }
    if (p.home) { p.home = false; p.el.classList.remove('is-in'); }

    var rest = 1 - glide(u);
    setStyle(p, 'op', 'opacity', clamp01((u - p.fadeAt) / FADE).toFixed(3));
    setStyle(p, 'css', 'transform',
      'translate3d(' + (p.x * rest).toFixed(2) + 'px,' + (p.y * rest).toFixed(2) + 'px,0)'
      + 'rotate(' + (p.rot * rest).toFixed(2) + 'deg)'
      + 'scale(' + (1 - (1 - p.sc) * rest).toFixed(4) + ')');
  }

  /* --- cats: the collage drifts apart as it goes past --------------------- */

  // Parallax rather than another assemble — the block is a scatter of prints and
  // stickers, so what it wants is depth, not a build. Each element travels at
  // its own rate while the block crosses the screen, and the drift is symmetric
  // about the middle of that pass: everything sits exactly on its Figma
  // coordinate at the moment the block is centred, which is where you stop to
  // look at it. Depth follows the paint order — the photo at the back lags
  // furthest, the stickers in front lead — so the parallax agrees with what
  // overlaps what instead of fighting it.
  //
  // Progress comes off the scroll offset rather than a measured rect, because
  // these elements carry the transform this very function writes; reading their
  // position back would feed the drift into its own input.

  var CATS_TOP = 8220;    // canvas y, top of the upper photo
  var CATS_H   = 1750;    // down to the bottom of the flower
  var POP      = 0.21;    // share of the pass an element spends arriving

  // A sticker's own canvas y is kept so its arrival can be timed to the moment it
  // actually clears the bottom of the screen. A fixed share of the pass cannot
  // do that: how much of the block fits on screen depends on the viewport and
  // the canvas scale, and at a tall window the lower stickers would have played
  // their whole pop while still below the fold.
  function cat(sel, drift, spin, top, kind, tilt) {
    var el = document.querySelector(sel);
    if (!el) return null;
    // a print hinges on its top edge, so it unfolds downwards onto the board
    // rather than growing out of its own middle
    if (kind === 'print') el.style.transformOrigin = '50% 0';
    return { el: el, drift: drift, spin: spin || 0,
             top: top === undefined ? -1 : top, kind: kind, tilt: tilt || 0,
             css: '', op: '' };
  }

  // Two kinds of arrival, because the two kinds of thing want different ones. A
  // sticker is small and light, so it pops on scale. A framed print is heavy —
  // popping one that size looks like a bug — so it lands the way a photo dropped
  // on a table does: a little low, a degree or two crooked, tipped back just
  // enough to catch the depth, and then it settles square. The two tilt opposite
  // ways so they don't read as one gesture played twice.
  //
  //                                         drift  spin  canvas y   arrival  entry turn
  var cats = mqReduce.matches ? [] : [
    cat('[src$="cats-1.webp"]',                 92,    0,     8220, 'print',  -3.2),
    cat('[src$="cats-latte.webp"]',             58,   -8,     9574, 'pop',   -24),
    cat('[src$="cats-2.webp"]',                 30,    0,     9096, 'print',   3.6),
    cat('[src$="cats-sticker.webp"]',         -112,  -10,     8980, 'pop',     26),
    cat('[src$="flower.webp"]',               -140,   12,     9685, 'pop',    -30)
  ].filter(Boolean);

  var catsPos = 0, catsTarget = 0;

  function aimCats() {
    if (!cats.length) return;
    var vh = window.innerHeight, h = CATS_H * scale;
    var top = CATS_TOP * scale + runway;          // document y of the block
    catsTarget = clamp01((window.scrollY + vh - top) / (vh + h));
  }

  function drawCats(f) {
    if (!cats.length) return;
    catsPos += (catsTarget - catsPos) * f;
    if (Math.abs(catsTarget - catsPos) < 0.0004) catsPos = catsTarget;

    var d = catsPos - 0.5;                         // zero when the block is centred
    var span = window.innerHeight + CATS_H * scale;
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      var ty = c.drift * d, rz = c.spin * d, sc = 1, tip = '';

      if (c.top >= 0) {
        // The share of the pass at which this element clears the bottom edge.
        // A print starts a little earlier than a sticker so that it is settled
        // by the time the block is centred — which is the moment the whole
        // composition is supposed to be sitting exactly on its Figma numbers.
        var seen = (c.top - CATS_TOP) * scale / span;
        var lead = c.kind === 'print' ? 0.05 : 0.03;
        var u = clamp01((catsPos - Math.max(0, seen - lead)) / POP);
        var rest = 1 - glide(u);
        setStyle(c, 'op', 'opacity', clamp01(u / 0.3).toFixed(3));

        if (c.kind === 'print') {
          ty += 74 * rest;
          rz += c.tilt * rest;
          sc = 1 - 0.07 * rest + 0.012 * land(u);
          // Perspective as a transform function rather than on a parent: it
          // keeps the 3D scoped to this element and leaves the section's
          // stacking alone. Dropped once the print has landed — left in, it
          // holds a 2686px-wide photo in a 3D rendering context for the rest
          // of the page's life for no benefit.
          if (rest > 0.0005) {
            tip = 'perspective(1500px)rotateX(' + (-44 * rest).toFixed(2) + 'deg)';
          }
        } else {
          rz += c.tilt * rest;
          sc = 1 - 0.62 * rest + 0.035 * land(u);
        }
      }

      setStyle(c, 'css', 'transform',
        'translate3d(0,' + ty.toFixed(2) + 'px,0)' + tip
        + 'rotate(' + rz.toFixed(2) + 'deg)'
        + 'scale(' + sc.toFixed(4) + ')');
    }
  }

  function catsSettled() { return !cats.length || catsPos === catsTarget; }

  /* --- pinned scrolling --------------------------------------------------- */

  // While the pin is active the canvas is pushed down by exactly as much as the
  // page scrolls, so the view stands still and only the deck moves. Past the
  // runway the offset stays put and the page carries on as normal.
  //
  // That correction has to be exact — smoothing it would set the whole page
  // adrift — so it is read from the live scroll offset every frame. The deck on
  // top of it is the opposite: it follows a spring, which is what turns a mouse
  // wheel's 100px steps into a glide instead of seven little jumps a slot.

  var pinCss  = '';
  var deckPos = 0;

  function pinOffset() {
    return Math.min(Math.max(window.scrollY - pinFrom, 0), runway);
  }

  function deckTarget() {
    if (runway) return clamp01((window.scrollY - pinFrom) / runway) * last;

    // unpinned: the deck plays as the block crosses the viewport
    var vh = window.innerHeight;
    var from = MEMES_TOP * scale - vh * 0.85;
    var to   = (MEMES_TOP + MEMES_H) * scale - vh * 0.2;
    return to > from ? clamp01((window.scrollY - from) / (to - from)) * last : 0;
  }

  function drawPin() {
    var css = 'translate3d(0,' + pinOffset() + 'px,0) scale(' + scale + ')';
    if (css === pinCss) return;
    pinCss = css;
    canvas.style.transform = css;
  }

  /* --- the frame loop ----------------------------------------------------- */

  // The loop runs only while the page is actually moving, plus however long the
  // spring needs to come to rest, and then gets out of the way.

  var running = false, prevAt = 0, movedAt = 0;

  function frame(now) {
    // A frame already in flight when the page crosses into the mobile layout
    // would land after `fit()` has reset the scenes and write the desktop pose
    // straight back over them. It stops here instead; `kick()` starts the loop
    // again if the window comes back the other way.
    if (mobile) { running = false; canvas.style.willChange = ''; return; }

    // Every read first, then every write. The About scenes are measured off
    // live element rects, and interleaving those with style writes would have
    // the browser redo layout in between.
    var target = deckTarget();
    aimAbout();
    aimCats();

    var dt = Math.min(80, now - prevAt);
    prevAt = now;

    // exponential smoothing, expressed per frame but corrected for the real
    // frame time, so a 120Hz display doesn't settle twice as fast
    var f = 1 - Math.pow(1 - SMOOTH, dt / 16.6667);

    drawPin();
    deckPos += (target - deckPos) * f;
    if (Math.abs(target - deckPos) < 0.0008) deckPos = target;
    drawDeck(deckPos);
    drawAbout(f);
    drawCats(f);

    if (deckPos === target && aboutSettled() && catsSettled() && now - movedAt > 400) {
      running = false;
      canvas.style.willChange = '';
      return;
    }
    requestAnimationFrame(frame);
  }

  function kick() {
    if (mobile) return;
    movedAt = performance.now();
    if (running) return;
    running = true;
    prevAt = movedAt;
    // The canvas is the whole page, and a layer that size is only cheap to
    // shift if the compositor is already holding it — without this the pin can
    // cost a repaint per frame, which is what tears. It is claimed only while
    // the page is actually moving, and handed back as soon as it settles.
    canvas.style.willChange = 'transform';
    requestAnimationFrame(frame);
  }

  // Crossing into the mobile layout hands the page back to the stylesheet. Every
  // scene writes inline styles, and an inline transform or opacity left over
  // from the desktop pose would sit on top of the mobile rules and win, so each
  // one is wiped along with the cache that would otherwise suppress the rewrite.
  function resetScenes() {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      c.el.style.opacity = c.el.style.transform = '';
      c.el.style.removeProperty('--sink');
      c.css = c.op = c.sink = '';
    }
    if (heading) { heading.style.transform = ''; headCss = ''; }

    for (i = 0; i < reveal.length; i++) {
      var sc = reveal[i];
      sc.pos = sc.target = 0;
      for (var j = 0; j < sc.parts.length; j++) {
        var p = sc.parts[j];
        p.el.style.transform = p.el.style.opacity = '';
        p.el.classList.remove('is-in');
        p.css = p.op = ''; p.home = false;
      }
    }

    for (i = 0; i < cats.length; i++) {
      // opacity as well as the transform: a cat below the fold when the window
      // crossed the breakpoint was written to 0, and inline it would stay there
      cats[i].el.style.transform = cats[i].el.style.opacity = '';
      cats[i].css = cats[i].op = '';
    }
    catsPos = catsTarget = 0;
    deckPos = 0;
  }

  // Snap the deck to where the scroll offset says it should be, with no spring
  // — on load and after a resize there is nothing to ease from.
  function settle() {
    if (mobile) return;
    deckPos = deckTarget();
    aimAbout();
    aimCats();
    drawPin();
    drawDeck(deckPos);
    drawAbout(1);
    drawCats(1);
  }

  fit();
  settle();

  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { fit(); settle(); }, { passive: true });
  // the browser restores the scroll offset after this script has already run
  window.addEventListener('load', settle);
  if (mqPin.addEventListener) {
    mqPin.addEventListener('change', function () { fit(); settle(); });
    mqMobile.addEventListener('change', function () { fit(); settle(); });
  }

  /* --- external links open in a new tab ----------------------------------- */

  // Applied here rather than per-link so that swapping a placeholder anchor for
  // a real URL is enough — nothing else has to be remembered.
  Array.prototype.forEach.call(document.links, function (a) {
    var href = a.getAttribute('href') || '';
    if (!/^https?:/i.test(href)) return;          // in-page anchors and mailto stay put
    if (a.hostname === location.hostname) return; // same site
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });

  /* --- anchor navigation, corrected for the scale ------------------------- */

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;

    var id = link.getAttribute('href').slice(1);
    if (!id) return;

    var target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // The mobile canvas has its own y for each block, on its own 393x8206
    // grid, so the section carries both and the mode picks one. No runway to
    // add back either: the deck does not pin here.
    if (mobile) {
      var my = parseFloat(target.getAttribute('data-m-anchor'));
      if (!isFinite(my)) my = 0;
      window.scrollTo({
        top: Math.max(0, my * scale - 16),
        behavior: reduce ? 'auto' : 'smooth'
      });
      return;
    }

    // Every section is a zero-height static wrapper — its children are all
    // absolutely positioned, so the section's own offsetTop is 0 and measuring
    // it would send every nav link back to the top of the page. `data-anchor`
    // carries the canvas y the block starts at, in the same unscaled Figma
    // pixels as the inline `top` on each element. Anything without one (a
    // heading, a card) is measured the usual way.
    var top;
    if (target.hasAttribute('data-anchor')) {
      top = parseFloat(target.getAttribute('data-anchor')) || 0;
    } else {
      top = 0;
      var node = target;
      while (node && node !== canvas) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
    }

    // targets after the memes block sit `runway` px further down the document
    var extra = top > MEMES_TOP ? runway : 0;

    window.scrollTo({
      top: Math.max(0, top * scale + extra - 24),
      behavior: reduce ? 'auto' : 'smooth'
    });
  });

})();

/* ============================================================================
   Hero hover hints — ported from the six `Main_Hover` frames in Figma.

   Hovering a sticker dims the rest of the hero, lifts that sticker above the
   dim, draws its arrow and drops the label in. Several stickers share one hint
   (the three fur letters all spell ZIP).

   Hit testing is per-pixel, not per-box. The stickers are cut-out PNGs whose
   rectangles overlap heavily — the cat's box and the latte's box share a corner
   over empty sky — so a plain :hover would fire the wrong hint, or fire one
   over transparent background. Each sticker gets a downscaled alpha map and the
   topmost sticker that is actually opaque under the pointer wins.
   ========================================================================== */

(function () {
  'use strict';

  var hero = document.getElementById('hero');
  var stage = document.getElementById('canvas');
  if (!hero || !stage) return;

  var HIT_ALPHA  = 24;    // 0-255; below this the pixel counts as background
  var SAMPLE_MAX = 200;   // longest side of the cached alpha map

  // The hints are a desktop affordance twice over: the arrows are single paths
  // drawn in the 1512px frame's own coordinates, so they point nowhere once the
  // mobile layout re-poses the collage, and a tap-to-toggle hint on a phone
  // competes with the scroll it sits under. Below the breakpoint the whole
  // mechanism stands down — including the button semantics, which would
  // otherwise have a screen reader announce a label that can never appear.
  var mqMobile = window.matchMedia('(max-width: 899px)');

  var hotspots = Array.prototype.slice.call(hero.querySelectorAll('.hotspot'));
  var hints    = {};
  var active   = null;
  var alphaOK  = true;    // false once a canvas read is blocked (e.g. file://)

  Array.prototype.forEach.call(hero.querySelectorAll('.hint'), function (hint) {
    hints[hint.dataset.for] = hint;

    // dash length comes from the real geometry rather than a hard-coded number
    var path = hint.querySelector('.hint-arrow path');
    if (path) {
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      hint.style.setProperty('--len', len);
    }
  });

  /* --- alpha maps -------------------------------------------------------- */

  function buildMap(img) {
    if (!alphaOK || !img.complete || !img.naturalWidth) return null;
    var r = SAMPLE_MAX / Math.max(img.naturalWidth, img.naturalHeight);
    var w = Math.max(1, Math.round(img.naturalWidth  * Math.min(1, r)));
    var h = Math.max(1, Math.round(img.naturalHeight * Math.min(1, r)));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    try {
      return { w: w, h: h, data: ctx.getImageData(0, 0, w, h).data };
    } catch (err) {
      // tainted canvas — fall back to rectangle hit testing for every sticker
      alphaOK = false;
      return null;
    }
  }

  function opaqueAt(el, u, v) {
    if (el._hitMap === undefined) el._hitMap = buildMap(el);
    var m = el._hitMap;
    if (!m) return true;                       // no map: treat the box as solid
    var px = Math.min(m.w - 1, Math.max(0, Math.floor(u * m.w)));
    var py = Math.min(m.h - 1, Math.max(0, Math.floor(v * m.h)));
    return m.data[(py * m.w + px) * 4 + 3] > HIT_ALPHA;
  }

  /* --- open / close ------------------------------------------------------- */

  function open(key) {
    if (mqMobile.matches) return;
    if (active === key) return;
    close();
    var hint = hints[key];
    if (!hint) return;

    active = key;
    hero.classList.add('is-hinting');
    hint.classList.add('is-on');
    hint.setAttribute('aria-hidden', 'false');
    hotspots.forEach(function (h) {
      if (h.dataset.hint === key) h.classList.add('is-lit');
    });
  }

  function close() {
    if (!active) return;
    var hint = hints[active];
    if (hint) {
      hint.classList.remove('is-on');
      hint.setAttribute('aria-hidden', 'true');
    }
    hero.classList.remove('is-hinting');
    hotspots.forEach(function (h) { h.classList.remove('is-lit'); });
    active = null;
  }

  /* --- pointer ------------------------------------------------------------ */

  // topmost first: later siblings paint over earlier ones
  var stackOrder = hotspots.slice().reverse();

  function hitAt(clientX, clientY) {
    var box = stage.getBoundingClientRect();
    var scale = box.width / stage.offsetWidth || 1;
    var x = (clientX - box.left) / scale;
    var y = (clientY - box.top)  / scale;

    // nothing below the hero can be a hotspot — skip the per-sticker work
    if (y < 0 || y > 982) return null;

    for (var i = 0; i < stackOrder.length; i++) {
      var el = stackOrder[i];
      var l = el.offsetLeft, t = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      if (x < l || x > l + w || y < t || y > t + h) continue;
      if (opaqueAt(el, (x - l) / w, (y - t) / h)) return el;
    }
    return null;
  }

  // Listen on the document, not on #hero. Every child of #hero is absolutely
  // positioned, so the section collapses to zero height and has no hit area of
  // its own: moves over a sticker still bubble up to it, but moves over the
  // background never reach it, and the open hint would stay stuck.
  var queued = false;
  document.addEventListener('mousemove', function (e) {
    if (mqMobile.matches) return;
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var el = hitAt(e.clientX, e.clientY);
      if (el) open(el.dataset.hint); else close();
    });
  }, { passive: true });

  // pointer left the window entirely
  document.addEventListener('mouseleave', close);

  function armHints() {
    var on = !mqMobile.matches;
    hotspots.forEach(function (el) {
      var hint  = hints[el.dataset.hint];
      var label = hint && hint.querySelector('.hint-label');
      if (on) {
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        if (label) el.setAttribute('aria-label', label.textContent);
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
        el.removeAttribute('aria-label');
      }
    });
    if (!on) close();
  }

  /* --- keyboard + touch --------------------------------------------------- */

  hotspots.forEach(function (el) {
    el.addEventListener('focus', function () { open(el.dataset.hint); });
    el.addEventListener('blur', close);
  });

  armHints();
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', armHints);

  // touch has no hover: tap the sticker itself to toggle its hint. On the
  // document for the same reason as mousemove — a tap on the background has to
  // be able to dismiss an open hint.
  document.addEventListener('click', function (e) {
    if (mqMobile.matches) return;
    var el = hitAt(e.clientX, e.clientY);
    if (!el) { close(); return; }
    if (active === el.dataset.hint) close(); else open(el.dataset.hint);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();

/* ============================================================================
   Work cards on touch

   The card's whole point is what hover does to it — the plumbob shrinks and
   rises to sit over her head while the portrait comes up under it. A phone has
   no hover to give it, so the card plays the same move once, as it comes up
   into the viewport, and holds the open pose. Same two transitions, same
   easing; only the trigger changes.
   ========================================================================== */

(function () {
  'use strict';

  var mqMobile = window.matchMedia('(max-width: 899px)');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card-link'));
  if (!cards.length || !window.IntersectionObserver) return;

  // Reduced motion keeps the card at rest: the resting pose is the design, and
  // the reveal is decoration on top of it.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var io = new IntersectionObserver(function (entries) {
    if (!mqMobile.matches) return;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -22% 0px', threshold: 0.35 });

  cards.forEach(function (card) { io.observe(card); });

  // Back on a pointer device the class would pin the card open, so it comes off
  // — hover is the trigger again from there.
  if (mqMobile.addEventListener) {
    mqMobile.addEventListener('change', function () {
      if (mqMobile.matches) return;
      cards.forEach(function (card) { card.classList.remove('is-revealed'); });
    });
  }
})();
