const SCROLLERS = '.modal__body, .cmdk__list, .notif__list';
const FIELDS = 'input, textarea, select';

/**
 * Plays the closing animation for an element React is removing.
 *
 * React takes a node out of the DOM in one step, so there is nothing left to animate. Instead a
 * static, inert copy is put where the original was, given the `is-closing` class (see base.css)
 * and removed when the animation is over. Call it from a layout-effect cleanup with the node and
 * the parent it was rendered into.
 */
export function animateOut(node, parent, duration = 200) {
  if (!node || !parent) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  // Decide after React has finished the commit: a cleanup that runs while the node stays in the
  // page (StrictMode re-running effects in development) is not a close.
  queueMicrotask(() => {
    if (node.isConnected || !parent.isConnected) return;

    const ghost = node.cloneNode(true);
    // A clone copies markup — not what was typed or picked, and not scroll positions.
    const live = node.querySelectorAll(FIELDS);
    ghost.querySelectorAll(FIELDS).forEach((field, i) => {
      field.value = live[i].value;
      field.checked = live[i].checked;
    });
    for (const el of [ghost, ...ghost.querySelectorAll('[id], [aria-modal]')]) {
      el.removeAttribute('id');
      el.removeAttribute('aria-modal');
    }
    ghost.classList.add('is-closing');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    parent.appendChild(ghost);

    const liveScrollers = [node, ...node.querySelectorAll(SCROLLERS)];
    [ghost, ...ghost.querySelectorAll(SCROLLERS)].forEach((el, i) => {
      el.scrollTop = liveScrollers[i].scrollTop;
    });

    window.setTimeout(() => ghost.remove(), duration);
  });
}
