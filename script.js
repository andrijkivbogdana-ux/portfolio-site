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
