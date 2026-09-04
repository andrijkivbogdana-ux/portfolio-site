/* ============================================================================
   Canvas scaling + memes carousel
   ========================================================================== */

(function () {
  'use strict';

  var CANVAS_W = 1512;
  var CANVAS_H = 10761;

  var stage  = document.getElementById('stage');
  var canvas = document.getElementById('canvas');
  var scale  = 1;

  /* --- keep the 1512px canvas proportionally fitted to the viewport ------- */

  function fit() {
    scale = Math.min(1, window.innerWidth / CANVAS_W);
    document.documentElement.style.setProperty('--scale', scale);
    // the scaled canvas no longer contributes its real height to layout,
    // so the stage has to reserve it explicitly
    stage.style.height = CANVAS_H * scale + 'px';
  }

  fit();
  window.addEventListener('resize', fit, { passive: true });

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

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: Math.max(0, top * scale - 24),
      behavior: reduce ? 'auto' : 'smooth'
    });
  });

  /* --- memes carousel ----------------------------------------------------- */

  var carousel = document.getElementById('memes-carousel');
  if (!carousel) return;

  var slides = Array.prototype.slice.call(carousel.querySelectorAll('.slide'));
  var dots   = carousel.querySelector('.dots');
  var index  = 0;

  slides.forEach(function (_, i) {
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', 'Meme ' + (i + 1));
    dot.addEventListener('click', function () { show(i); });
    dots.appendChild(dot);
  });

  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
    Array.prototype.forEach.call(dots.children, function (d, i) {
      d.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });
  }

  carousel.querySelector('.prev').addEventListener('click', function () { show(index - 1); });
  carousel.querySelector('.next').addEventListener('click', function () { show(index + 1); });

  carousel.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft')  show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  show(0);
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

    for (var i = 0; i < stackOrder.length; i++) {
      var el = stackOrder[i];
      var l = el.offsetLeft, t = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      if (x < l || x > l + w || y < t || y > t + h) continue;
      if (opaqueAt(el, (x - l) / w, (y - t) / h)) return el;
    }
    return null;
  }

  var queued = false;
  hero.addEventListener('mousemove', function (e) {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var el = hitAt(e.clientX, e.clientY);
      if (el) open(el.dataset.hint); else close();
    });
  });
  hero.addEventListener('mouseleave', close);

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

  // touch has no hover: tap the sticker itself to toggle its hint
  hero.addEventListener('click', function (e) {
    var el = hitAt(e.clientX, e.clientY);
    if (!el) { close(); return; }
    if (active === el.dataset.hint) close(); else open(el.dataset.hint);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
