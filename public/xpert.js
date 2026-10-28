// Xpert, the brand laptop, as a live SVG whose lid opens and closes.
// Everything is drawn once and CSS shows the state that matches data-mood:
//   look   - lid open, </> on the screen with a blinking cursor
//   wave   - look, with a happy little hop
//   typing - lid open, lines of code typing across the screen
//   think  - lid open, loading dots on the screen
//   party  - lid open, a heart on the screen and sparkles around it
//   closed - lid shut, stickers on the back
//   sleepy - lid shut, with a floating Zzz
// The lid closes by folding the screen down onto the keyboard; see "Xpert, the brand laptop" in styles.css.
// The static logo is /mascot.svg.

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

export function xpert(mood = 'look', { size = 96, cls = '' } = {}) {
  const id = `xp${++uid}`;
  return `
<svg class="xpert ${cls}" data-mood="${mood}" viewBox="-6 -10 80 78" width="${size}" height="${Math.round(size * 78 / 80)}" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a95ee6"/><stop offset="1" stop-color="#7b2cbf"/></linearGradient>
    <linearGradient id="${id}-scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#f1e2ff"/></linearGradient>
    <linearGradient id="${id}-deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9d4edd"/><stop offset="1" stop-color="#7b2cbf"/></linearGradient>
  </defs>
  <ellipse cx="32" cy="58" rx="26" ry="2.6" fill="#3c096c" opacity=".16"/>
  <g class="xp-body">
    <!-- keyboard deck, seen from slightly above -->
    <path d="M9.5 40h45l5.5 11.5a2 2 0 0 1-1.8 2.9H5.8A2 2 0 0 1 4 51.5z" fill="url(#${id}-deck)"/>
    <g fill="#e0aaff" opacity=".55">
      <rect x="13" y="42.4" width="38" height="2" rx="1"/><rect x="11.6" y="45.4" width="40.8" height="2" rx="1"/>
    </g>
    <rect x="26" y="48.6" width="12" height="3.4" rx="1.2" fill="#e0aaff" opacity=".7"/>
    <rect x="3.6" y="53.6" width="56.8" height="3.4" rx="1.7" fill="#5a189a"/>
    <!-- lid, open: screen faces us; it folds down toward the hinge at y=40 -->
    <g class="xp-lid-front">
      <rect x="10" y="5" width="44" height="35" rx="8" fill="url(#${id}-lid)"/>
      <rect x="14" y="9" width="36" height="27" rx="5" fill="url(#${id}-scr)"/>
      <circle cx="32" cy="7" r=".9" fill="#e0aaff"/>
      <g class="xp-scr xp-code" stroke="#7b2cbf" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M25.5 17.5l-4.5 4.5 4.5 4.5M38.5 17.5l4.5 4.5-4.5 4.5M34.5 15.5l-5 13"/>
        <path class="xp-caret" d="M29 32.5h6" stroke="#c77dff"/>
      </g>
      <g class="xp-scr xp-typing" stroke-width="2.2" stroke-linecap="round">
        <path d="M19 15h14" stroke="#9d4edd"/><path d="M22 20h18" stroke="#c77dff"/><path d="M22 25h10" stroke="#9d4edd"/><path d="M19 30h20" stroke="#c77dff"/>
      </g>
      <g class="xp-scr xp-dots" fill="#9d4edd"><circle cx="26" cy="22.5" r="2"/><circle cx="32" cy="22.5" r="2"/><circle cx="38" cy="22.5" r="2"/></g>
      <g class="xp-scr xp-heart">
        <path d="M32 29.5s-7.5-4.6-7.5-9.4a4 4 0 0 1 7.5-2 4 4 0 0 1 7.5 2c0 4.8-7.5 9.4-7.5 9.4z" fill="#9d4edd"/>
        <path d="M19.5 14.5l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8zM44.5 26.5l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" fill="#c77dff"/>
      </g>
    </g>
    <!-- lid, closed: the back of the lid lies over the deck, with stickers -->
    <g class="xp-lid-back">
      <path d="M9.5 40h45l5.5 11.5a2 2 0 0 1-1.8 2.9H5.8A2 2 0 0 1 4 51.5z" fill="url(#${id}-lid)"/>
      <path d="M9.5 40h45" stroke="#e0aaff" stroke-width="1" opacity=".6"/>
      <path d="M20 50.2s-3.6-2.2-3.6-4.5a1.9 1.9 0 0 1 3.6-1 1.9 1.9 0 0 1 3.6 1c0 2.3-3.6 4.5-3.6 4.5z" fill="#ffd6ec"/>
      <path d="M32 42.8l1.1 2.3 2.5.4-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.4z" fill="#fff" opacity=".9"/>
      <g transform="translate(44 46.5)"><circle r="3.4" fill="#10002b"/><path d="M-1.4-1.4l2.8 2.8m0-2.8-2.8 2.8" stroke="#e0aaff" stroke-width="1.2" stroke-linecap="round"/></g>
    </g>
  </g>
  <g class="xp-extra xp-zzz" fill="#9d4edd" font-family="Nunito, sans-serif" font-weight="900">
    <text x="50" y="30" font-size="9">z</text><text x="57" y="22" font-size="7">z</text><text x="62" y="15" font-size="5">z</text>
  </g>
  <g class="xp-extra xp-spark" fill="#c77dff">
    <path d="M2 4l1.5 3.5L7 9 3.5 10.5 2 14 .5 10.5-3 9 .5 7.5z"/>
    <path d="M64 6l1.2 2.8L68 10l-2.8 1.2L64 14l-1.2-2.8L60 10l2.8-1.2z"/>
  </g>
</svg>`;
}

/** Changes the state of a laptop. After `ms`, it moves on to `next` (by default, the state it had before). */
export function setMood(svg, mood, ms, next = svg?.dataset.mood) {
  if (!svg) return;
  svg.dataset.mood = mood;
  clearTimeout(svg._moodTimer);
  if (ms) svg._moodTimer = setTimeout(() => { svg.dataset.mood = next; }, ms);
}

/** Closes the lid, then opens it again into `mood` (a little "blink" of the laptop). */
export function blink(svg, mood = svg?.dataset.mood ?? 'look', ms = 650) {
  if (!svg) return;
  clearTimeout(svg._moodTimer);
  svg.dataset.mood = 'closed';
  svg._moodTimer = setTimeout(() => { svg.dataset.mood = mood; }, reducedMotion() ? 0 : ms);
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
