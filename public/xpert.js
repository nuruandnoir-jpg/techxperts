// Xpert, the brand mascot: a little person typing away behind a laptop, as a live SVG.
// Everything is drawn once and CSS shows the state that matches data-mood:
//   look   - typing calmly, eyes on the screen
//   typing - typing fast, little bits of code floating up
//   wave   - one hand up, waving hello
//   think  - hands still, eyes up, thought bubbles
//   party  - both hands up, sparkles and a heart
//   closed - ducked down behind the laptop (peekaboo)
//   sleepy - head resting on the laptop, Zzz
// The lid faces us (its back, with stickers), so the person's face peeks over it.
// See "Xpert, the brand mascot" in styles.css. The static logo is /mascot.svg.

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let uid = 0;

export function xpert(mood = 'look', { size = 96, cls = '' } = {}) {
  const id = `xp${++uid}`;
  const SKIN = '#b9784e';
  const INK = '#240046';
  const hand = (side, cx) => `
    <g class="xp-hand xp-hand-${side}">
      <ellipse cx="${cx}" cy="51.6" rx="3.9" ry="2.5" fill="#9d4edd"/>
      <circle cx="${cx}" cy="49" r="3.2" fill="url(#${id}-skin)"/>
      <circle cx="${cx - 1}" cy="47.9" r=".9" fill="#fff" opacity=".25"/>
    </g>`;
  return `
<svg class="xpert ${cls}" data-mood="${mood}" viewBox="-6 -10 80 78" width="${size}" height="${Math.round(size * 78 / 80)}" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b06cec"/><stop offset=".55" stop-color="#8f3fd6"/><stop offset="1" stop-color="#7024b8"/></linearGradient>
    <linearGradient id="${id}-hood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d49bff"/><stop offset="1" stop-color="#a45be8"/></linearGradient>
    <radialGradient id="${id}-skin" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#d0936a"/><stop offset="1" stop-color="${SKIN}"/></radialGradient>
    <radialGradient id="${id}-shadow"><stop offset="0" stop-color="#3c096c" stop-opacity=".28"/><stop offset="1" stop-color="#3c096c" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}-lidclip"><rect x="11" y="23" width="42" height="27.5" rx="6"/></clipPath>
  </defs>
  <ellipse cx="32" cy="57.5" rx="30" ry="3.4" fill="url(#${id}-shadow)"/>
  <g class="xp-person">
    <path d="M7 54q0-25 25-26 25 1 25 26z" fill="url(#${id}-hood)"/>
    <path d="M10.5 44q2-11 12-14.5" stroke="#fff" stroke-width="1.4" opacity=".25" fill="none" stroke-linecap="round"/>
    <g class="xp-head">
      <circle cx="20.2" cy="15" r="2.6" fill="${SKIN}"/><circle cx="43.8" cy="15" r="2.6" fill="${SKIN}"/>
      <circle cx="20.4" cy="15.2" r="1.1" fill="#9a5e38"/><circle cx="43.6" cy="15.2" r="1.1" fill="#9a5e38"/>
      <circle cx="32" cy="14" r="12" fill="url(#${id}-skin)"/>
      <ellipse cx="32" cy="23.4" rx="7.6" ry="3.2" fill="#e0aaff" opacity=".28"/>
      <circle cx="32" cy="-1.6" r="4.7" fill="${INK}"/>
      <path d="M29.6-4.4q1.8-1.6 4-1" stroke="#7b2cbf" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".9"/>
      <path d="M20 14.5q0-12.5 12-12.5t12 12.5q-3.5-6.5-12-6.8-8.5.3-12 6.8z" fill="${INK}"/>
      <path d="M25.4 7.6q4.2 5.4 11.4 2.8-4.6-.3-7-4.4z" fill="${INK}"/>
      <path d="M24.2 6.2q3-3.2 7.4-3.6" stroke="#7b2cbf" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".9"/>
      <ellipse cx="32" cy="2.4" rx="3.6" ry="1.15" fill="#e0aaff"/>
      <ellipse cx="24.2" cy="19.2" rx="2.4" ry="1.35" fill="#ff8fb1" opacity=".5"/><ellipse cx="39.8" cy="19.2" rx="2.4" ry="1.35" fill="#ff8fb1" opacity=".5"/>
      <g class="xp-face xp-eyes">
        <ellipse cx="27.5" cy="15.6" rx="1.75" ry="2" fill="${INK}"/><ellipse cx="36.5" cy="15.6" rx="1.75" ry="2" fill="${INK}"/>
        <circle cx="28.1" cy="14.9" r=".62" fill="#fff"/><circle cx="37.1" cy="14.9" r=".62" fill="#fff"/>
      </g>
      <path class="xp-face xp-happy" d="M25.6 16.2q1.9-2.5 3.8 0M34.6 16.2q1.9-2.5 3.8 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path class="xp-face xp-shut" d="M25.6 15.6q1.9 1.5 3.8 0M34.6 15.6q1.9 1.5 3.8 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path class="xp-face xp-smile" d="M30.3 20.3q1.7 1.5 3.4 0" stroke="${INK}" stroke-width="1.35" fill="none" stroke-linecap="round"/>
      <path class="xp-face xp-grin" d="M29.7 19.7h4.6a2.3 2.3 0 0 1-4.6 0z" fill="${INK}"/>
      <circle class="xp-face xp-o" cx="32" cy="20.6" r="1.05" fill="${INK}"/>
    </g>
  </g>
  <g class="xp-laptop">
    <rect x="5" y="49.5" width="54" height="5" rx="2.5" fill="#5a189a"/>
    <path d="M7.5 50.4h49" stroke="#c77dff" stroke-width=".8" opacity=".55" stroke-linecap="round"/>
    <g class="xp-lid">
      <rect x="11" y="23" width="42" height="27.5" rx="6" fill="url(#${id}-lid)"/>
      <g clip-path="url(#${id}-lidclip)"><path d="M11 23h17L15 50.5h-4z" fill="#fff" opacity=".09"/></g>
      <rect x="11.6" y="23.6" width="40.8" height="26.3" rx="5.4" fill="none" stroke="#e9c8ff" stroke-width=".7" opacity=".45"/>
      <path d="M32 44.8s-3.7-2.3-3.7-4.7a1.95 1.95 0 0 1 3.7-1 1.95 1.95 0 0 1 3.7 1c0 2.4-3.7 4.7-3.7 4.7z" fill="#ffd6ec"/>
      <path d="M18.5 28.5l1 2.1 2.3.4-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.4z" fill="#fff" opacity=".92"/>
      <g transform="translate(45.5 31)"><circle r="3.3" fill="#10002b"/><path d="M-1.3-1.3l2.6 2.6m0-2.6-2.6 2.6" stroke="#e0aaff" stroke-width="1.1" stroke-linecap="round"/></g>
      <circle cx="44" cy="44" r="1" fill="#e0aaff" opacity=".7"/><circle cx="20" cy="43" r=".8" fill="#e0aaff" opacity=".6"/>
    </g>
  </g>
  <g class="xp-hands">${hand('l', 12.5)}${hand('r', 51.5)}
  </g>
  <g class="xp-extra xp-bits" fill="none" stroke="#9d4edd" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M55 12l-2.5 2.5 2.5 2.5M60 12l2.5 2.5-2.5 2.5"/>
    <path d="M6 16q-1.5 0-1.5 1.5v1q0 1-1 1 1 0 1 1v1q0 1.5 1.5 1.5"/>
    <circle cx="62" cy="26" r="1.2" fill="#c77dff" stroke="none"/>
  </g>
  <g class="xp-extra xp-thought" fill="#c77dff"><circle cx="47" cy="4" r="1.4"/><circle cx="51.5" cy="-1" r="2.1"/><circle cx="57.5" cy="-6" r="3"/></g>
  <g class="xp-extra xp-zzz" fill="#9d4edd" font-family="Nunito, sans-serif" font-weight="900">
    <text x="48" y="14" font-size="9">z</text><text x="55" y="6" font-size="7">z</text><text x="60" y="-1" font-size="5">z</text>
  </g>
  <g class="xp-extra xp-spark" fill="#c77dff">
    <path d="M2 4l1.5 3.5L7 9 3.5 10.5 2 14 .5 10.5-3 9 .5 7.5z"/>
    <path d="M64 6l1.2 2.8L68 10l-2.8 1.2L64 14l-1.2-2.8L60 10l2.8-1.2z"/>
    <path d="M14-.5s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z" fill="#ff9fb8"/>
  </g>
</svg>`;
}

/** Changes the state of a mascot. After `ms`, it moves on to `next` (by default, the state it had before). */
export function setMood(svg, mood, ms, next = svg?.dataset.mood) {
  if (!svg) return;
  svg.dataset.mood = mood;
  clearTimeout(svg._moodTimer);
  if (ms) svg._moodTimer = setTimeout(() => { svg.dataset.mood = next; }, ms);
}

/** Ducks behind the laptop, then pops back up into `mood` (a little "peekaboo"). */
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
