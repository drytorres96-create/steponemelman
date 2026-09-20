/* Decorative depth only: no storage, application state or network requests. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');
  let scene = null, frame = 0, currentX = 0, currentY = 0, targetX = 0, targetY = 0;
  const clamp = n => Math.max(-1, Math.min(1, n));
  const allowed = () => !reduced.matches && fine.matches && !document.hidden;
  const quiet = el => el.closest('[data-depth-static], [data-motion="quieto"], [data-motion="0"]');
  const calm = el => el.closest('[data-depth-calm="true"], .study-focus, .enfoque, .reading-focus') || document.body?.classList.contains('enfoque');
  function paint() {
    frame = 0;
    if (!scene?.isConnected || !allowed() || quiet(scene)) { reset(); return; }
    currentX += (targetX - currentX) * .12;
    currentY += (targetY - currentY) * .12;
    const factor = calm(scene) ? .24 : 1;
    scene.style.setProperty('--depth-x', (currentX * 18 * factor).toFixed(2) + 'px');
    scene.style.setProperty('--depth-y', (currentY * 12 * factor).toFixed(2) + 'px');
    scene.style.setProperty('--depth-rx', (-currentY * 5 * factor).toFixed(2) + 'deg');
    scene.style.setProperty('--depth-ry', (currentX * 7 * factor).toFixed(2) + 'deg');
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .002) frame = requestAnimationFrame(paint);
  }
  function reset() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (scene) for (const key of ['x','y','rx','ry']) scene.style.removeProperty('--depth-' + key);
    scene = null; currentX = currentY = targetX = targetY = 0;
  }
  function preferences() {
    root.toggleAttribute('data-depth-paused', reduced.matches || document.hidden);
    if (!allowed()) reset();
  }
  document.addEventListener('pointermove', event => {
    if (!allowed() || event.pointerType === 'touch') return;
    const next = event.target.closest?.('[data-depth-scene]');
    if (!next || quiet(next)) { reset(); return; }
    if (next !== scene) { reset(); scene = next; }
    const bounds = scene.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    targetX = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1);
    targetY = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1);
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (scene && (!event.relatedTarget || !scene.contains(event.relatedTarget))) reset();
  }, { passive: true });
  // Keyboard reading and input stay visually calm; pointer activity can resume later.
  document.addEventListener('focusin', event => { if (event.target.matches?.('input, textarea, select, [contenteditable="true"]')) reset(); });
  document.addEventListener('visibilitychange', preferences);
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  reduced.addEventListener('change', preferences);
  fine.addEventListener('change', preferences);
  preferences();
})();
