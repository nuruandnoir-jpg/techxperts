// Xpert, the laptop mascot, as a live SVG that can change mood.
// Every face is drawn once and CSS shows the one that matches data-mood:
//   look  - open eyes that follow the pointer (and blink)
//   wave  - look, plus a waving hand
//   think - eyes up, small mouth, dots on the screen
//   party - happy eyes, open smile, sparkles
//   sleepy - closed eyes and floating Zzz
// The static logo stays in /mascot.svg; this is for the moments where Xpert reacts.

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

export function xpert(mood = 'look', { size = 96, cls = '', follow = false } = {}) {
  const id = `xp${++uid}`;
  return `
<svg class="xpert ${cls}" data-mood="${mood}" ${follow ? 'data-follow' : ''} viewBox="-6 -10 80 78" width="${size}" height="${Math.round(size * 78 / 80)}" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9d4edd"/><stop offset="1" stop-color="#7b2cbf"/></linearGradient>
    <linearGradient id="${id}-scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f1e2ff"/></linearGradient>
  </defs>
  <g class="xp-body" transform="translate(0 5)">
    <g class="xp-hand"><path d="M55 40 61 27" stroke="#5a189a" stroke-width="3.2" stroke-linecap="round"/><circle cx="62" cy="24.5" r="4.6" fill="#c77dff"/></g>
    <rect x="10" y="9" width="44" height="34" rx="9" fill="url(#${id}-lid)"/>
    <rect x="14.5" y="13.5" width="35" height="25" rx="5.5" fill="url(#${id}-scr)"/>
    <ellipse cx="20.5" cy="30" rx="2.6" ry="1.6" fill="#e0aaff"/>
    <ellipse cx="43.5" cy="30" rx="2.6" ry="1.6" fill="#e0aaff"/>
    <g class="xp-face xp-open" fill="#3c096c">
      <g class="xp-pupils">
        <ellipse class="xp-eye" cx="25.5" cy="24.5" rx="2.5" ry="3.1"/>
        <ellipse class="xp-eye" cx="38.5" cy="24.5" rx="2.5" ry="3.1"/>
        <circle cx="26.3" cy="23.4" r=".8" fill="#fff"/><circle cx="39.3" cy="23.4" r=".8" fill="#fff"/>
      </g>
    </g>
    <path class="xp-face xp-smile" d="M29.5 31q2.5 2 5 0" stroke="#3c096c" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle class="xp-face xp-o" cx="32" cy="32" r="1.4" fill="#3c096c"/>
    <g class="xp-face xp-dots" fill="#9d4edd"><circle cx="27" cy="35" r="1"/><circle cx="32" cy="35" r="1"/><circle cx="37" cy="35" r="1"/></g>
    <path class="xp-face xp-happy" d="M22.5 25.5q3-3.2 6 0M35.5 25.5q3-3.2 6 0" stroke="#3c096c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path class="xp-face xp-grin" d="M28.3 30h7.4a3.7 3.7 0 0 1-7.4 0z" fill="#3c096c"/>
    <path class="xp-face xp-shut" d="M22.5 25.5q3 1.6 6 0M35.5 25.5q3 1.6 6 0" stroke="#3c096c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M5 45.5a2.5 2.5 0 0 1 2.5-2.5h49a2.5 2.5 0 0 1 2.5 2.5v0a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#5a189a"/>
    <rect x="27" y="43" width="10" height="2" rx="1" fill="#c77dff"/>
  </g>
  <g class="xp-face xp-zzz" fill="#9d4edd" font-family="Nunito, sans-serif" font-weight="900">
    <text x="52" y="8" font-size="9">z</text><text x="59" y="0" font-size="7">z</text><text x="64" y="-6" font-size="5">z</text>
  </g>
  <g class="xp-face xp-spark" fill="#e0aaff">
    <path d="M2 4l1.5 3.5L7 9 3.5 10.5 2 14 .5 10.5-3 9 .5 7.5z"/>
    <path d="M64 6l1.2 2.8L68 10l-2.8 1.2L64 14l-1.2-2.8L60 10l2.8-1.2z"/>
  </g>
</svg>`;
}

/** Changes the mood of an Xpert, optionally going back to the previous one after `ms`. */
export function setMood(svg, mood, ms) {
  if (!svg) return;
  const before = svg.dataset.mood;
  svg.dataset.mood = mood;
  clearTimeout(svg._moodTimer);
  if (ms) svg._moodTimer = setTimeout(() => { svg.dataset.mood = before; }, ms);
}

// One pointer listener for the whole page: every Xpert marked data-follow turns its eyes
// toward the pointer. Pupils move at most 2.2 units, so the face stays calm.
let frame = 0;
let pointer = null;
function aim(svg, x, y) {
  const box = svg.getBoundingClientRect();
  if (!box.width) return;
  const dx = x - (box.left + box.width / 2);
  const dy = y - (box.top + box.height * 0.42);
  const dist = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, dist / 220);
  svg.querySelector('.xp-pupils')?.setAttribute('transform', `translate(${((dx / dist) * 2.2 * reach).toFixed(2)} ${((dy / dist) * 1.8 * reach).toFixed(2)})`);
}
window.addEventListener('pointermove', (e) => {
  pointer = [e.clientX, e.clientY];
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    document.querySelectorAll('.xpert[data-follow]').forEach((svg) => aim(svg, ...pointer));
  });
}, { passive: true });

/** Points an Xpert's eyes at an element (for example the field someone is typing in). */
export function lookAt(svg, el) {
  const r = el.getBoundingClientRect();
  aim(svg, r.left + r.width / 2, r.top + r.height / 2);
}

/** A short burst of confetti in the brand colours. Skipped when reduced motion is on. */
export function confetti(count = 90) {
  if (reducedMotion()) return;
  const colors = ['#e0aaff', '#c77dff', '#9d4edd', '#7b2cbf', '#5a189a', '#ffffff'];
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};`
      + `--drift:${(Math.random() - 0.5) * 220}px;--spin:${(Math.random() - 0.5) * 1080}deg;`
      + `animation-delay:${Math.random() * 0.35}s;animation-duration:${1.8 + Math.random() * 1.2}s;`
      + `${Math.random() > 0.5 ? 'border-radius:50%;width:8px;height:8px;' : ''}`;
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3600);
}
