/* ============================================================================
   Canvas scaling + memes carousel
   ========================================================================== */

(function () {
  'use strict';

  var CANVAS_W = 1512;
  var CANVAS_H = 10761;

  // The pinned area covers the heading and the slide stack together, so both
  // stay framed while the stack plays. PER_SLIDE is how much scrolling each
  // slide gets before it hands over to the next.
  var MEMES_TOP  = 5724;   // "Break for memes"
  var MEMES_H    = 932;    // down to the bottom of the tallest slide
  var PER_SLIDE  = 320;

  var stage  = document.getElementById('stage');
  var canvas = document.getElementById('canvas');
  var scale  = 1;

  var memeSlides = Array.prototype.slice.call(
    document.querySelectorAll('#memes-carousel .slide'));
  var runway  = memeSlides.length * PER_SLIDE;   // extra document height for the pin
  var pinFrom = 0;                               // scroll offset where pinning starts

  /* --- keep the 1512px canvas proportionally fitted to the viewport ------- */

  function fit() {
    // Never scale up: past the 1512px design width the content stays at its
    // Figma pixel size and is centred, and only the background stretches.
    // Below it, the whole canvas scales down so the design still fits.
    scale = Math.min(1, window.innerWidth / CANVAS_W);
    document.documentElement.style.setProperty('--scale', scale);

    // The memes block is held still while its slides play, so the document
    // carries that much extra height and everything after it sits lower.
    pinFrom = Math.max(0, (MEMES_TOP + MEMES_H / 2) * scale - window.innerHeight / 2);
    stage.style.height = (CANVAS_H * scale + runway) + 'px';

    // how far the background has to reach past the 1512px canvas on each side to
    // stay full-bleed. Narrower than that, the canvas is already wider than the
    // viewport and the background covers it.
    var overhang = Math.max(0, (window.innerWidth - CANVAS_W) / 2);
    document.documentElement.style.setProperty('--bg-overhang', overhang + 'px');
  }

  fit();
  window.addEventListener('resize', function () { fit(); syncPin(); }, { passive: true });

  /* --- pinned memes ------------------------------------------------------- */

  // While the pin is active the canvas is pushed down by exactly as much as the
  // page scrolls, so the view stands still and only the slides move. Past the
  // runway the offset stays put and the page carries on as normal.
  //
  // Everything here is driven straight from the scroll offset, with no CSS
  // transitions in the way: a transition fighting a per-frame update is what
  // makes this kind of thing stutter. The slides cross-fade and drift on a
  // continuous curve instead of snapping between states.

  // Each slide is dealt onto the stack: it arrives opaque, sliding up into place
  // with a slight tip, and covers the one before it. Nothing cross-fades while
  // half-transparent — two memes showing through each other is what made the
  // earlier version look muddy.
  var ENTER   = 0.62;   // share of a slot spent arriving
  var OPAQUE  = 0.12;   // share spent becoming solid — kept short so that two
                        // memes are never visible through each other, and it
                        // happens while the card is still far out and moving
                        // fast, so it reads as motion rather than a fade
  var TRAVEL  = 150;    // px the card covers on its way in
  var RETIRE  = 2;      // slots behind before a covered slide is dropped
  var memesHeading = document.getElementById('memes-h');

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function pinOffset() {
    return Math.min(Math.max(window.scrollY - pinFrom, 0), runway);
  }

  function syncPin() {
    var off = pinOffset();

    // set the transform on the element, not as a custom property on :root —
    // an inherited property invalidates every element in the page each frame
    canvas.style.transform =
      'translate3d(0,' + off + 'px,0) scale(' + scale + ')';

    var n = memeSlides.length;
    if (!n || !runway) return;

    // slide 0 rests at the start, slide n-1 rests at the end
    var s = off / runway * (n - 1);

    for (var i = 0; i < n; i++) {
      var u  = s - i + 1;                     // 0 = about to arrive, 1 = settled
      var el = memeSlides[i];

      if (u <= 0) { el.style.opacity = 0; continue; }

      var a = clamp01(u / OPAQUE);
      if (u > RETIRE) a *= clamp01(RETIRE + 1 - u);   // covered anyway, drop it
      el.style.opacity = a;
      if (a === 0) continue;

      var e = clamp01(u / ENTER);
      var k = 1 - Math.pow(1 - e, 3);         // ease-out, so it lands softly
      var rest = 1 - k;
      var tip  = (i % 2 ? -1 : 1) * 3.5 * rest;

      el.style.transform =
        'translate3d(0,' + (rest * TRAVEL).toFixed(2) + 'px,0)' +
        ' rotate(' + tip.toFixed(2) + 'deg)' +
        ' scale(' + (0.93 + 0.07 * k).toFixed(4) + ')';
    }

    // the heading drifts a touch against the stack — a hint of depth
    if (memesHeading) {
      memesHeading.style.transform =
        'translate3d(0,' + (-(off / runway) * 26).toFixed(2) + 'px,0)';
    }
  }

  // Called straight from the scroll event rather than through requestAnimationFrame:
  // the browser already coalesces scroll to at most one event per frame, and the
  // extra rAF hop only adds a frame of lag between the wheel and the paint —
  // which is exactly what reads as the animation dragging behind the scroll.
  window.addEventListener('scroll', syncPin, { passive: true });

  syncPin();

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

    // offsetTop is measured in unscaled canvas pixels
    var top = 0;
    var node = target;
    while (node && node !== canvas) {
      top += node.offsetTop;
      node = node.offsetParent;
    }

    // targets after the memes block sit `runway` px further down the document
    var extra = top > MEMES_TOP ? runway : 0;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  /* --- keyboard + touch --------------------------------------------------- */

  hotspots.forEach(function (el) {
    var hint  = hints[el.dataset.hint];
    var label = hint && hint.querySelector('.hint-label');

    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    if (label) el.setAttribute('aria-label', label.textContent);

    el.addEventListener('focus', function () { open(el.dataset.hint); });
    el.addEventListener('blur', close);
  });

  // touch has no hover: tap the sticker itself to toggle its hint. On the
  // document for the same reason as mousemove — a tap on the background has to
  // be able to dismiss an open hint.
  document.addEventListener('click', function (e) {
    var el = hitAt(e.clientX, e.clientY);
    if (!el) { close(); return; }
    if (active === el.dataset.hint) close(); else open(el.dataset.hint);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
