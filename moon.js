// Shared moon math + drawing, used by both the website (index.html) and the widget (widget.html).

const SYNODIC = 29.530588853;                       // average days between new moons
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);  // a known new moon
const DAY_MS = 86400000;

const PHASES = [
  { max: 1.84566,  name: 'New Moon' },
  { max: 5.53699,  name: 'Waxing Crescent' },
  { max: 9.22831,  name: 'First Quarter' },
  { max: 12.91963, name: 'Waxing Gibbous' },
  { max: 16.61096, name: 'Full Moon' },
  { max: 20.30228, name: 'Waning Gibbous' },
  { max: 23.99361, name: 'Last Quarter' },
  { max: 27.68493, name: 'Waning Crescent' },
  { max: 99,       name: 'New Moon' },
];

function moonAge(date) {
  const days = (date.getTime() - REF_NEW_MOON) / DAY_MS;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}
function phaseFraction(date) { return moonAge(date) / SYNODIC; }
function illumination(date) { return (1 - Math.cos(2 * Math.PI * phaseFraction(date))) / 2; }
function phaseInfo(date) { const a = moonAge(date); return PHASES.find(p => a < p.max); }

// Next time the moon reaches a given fraction of its cycle (0.25 = first quarter, 0.5 = full, 1 = new)
function nextPhaseDate(from, target) {
  const f = phaseFraction(from);
  let diff = target - f;
  if (diff <= 0) diff += 1;
  return new Date(from.getTime() + diff * SYNODIC * DAY_MS);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Whole calendar days between today and a date
function daysUntil(date) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(date); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / DAY_MS);
}
function relDays(n) { return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; }

// ---------- Realistic moon rendering ----------
// The surface (seas, craters, rays) comes from moon-texture.js:
//   red/green = which way each bit of ground faces, blue = how bright it is.
// For each pixel we light that surface from the sun's direction for the given phase,
// so craters throw shading near the shadow line, just like through a telescope.

let moonTextureImg = null;
const moonReadyCallbacks = [];
function whenMoonReady(fn) {
  if (moonTextureImg && moonTextureImg.complete) fn(); else moonReadyCallbacks.push(fn);
}
if (typeof document !== 'undefined' && typeof MOON_TEXTURE !== 'undefined') {
  moonTextureImg = new Image();
  moonTextureImg.onload = () => moonReadyCallbacks.splice(0).forEach(fn => fn());
  moonTextureImg.src = MOON_TEXTURE;
}

const surfaceCache = {};
function surfaceAt(size) {
  if (surfaceCache[size]) return surfaceCache[size];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(moonTextureImg, 0, 0, size, size);
  return (surfaceCache[size] = g.getImageData(0, 0, size, size).data);
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Draw the moon on a canvas. frac: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter.
function drawMoon(canvas, frac) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  if (!moonTextureImg || !moonTextureImg.complete) { whenMoonReady(() => drawMoon(canvas, frac)); return; }

  const tex = surfaceAt(S);
  const out = ctx.createImageData(S, S);
  const px = out.data;

  // Sun direction: seen from Earth (z toward us), it swings around as the month goes on
  const theta = 2 * Math.PI * frac;
  const Lx = Math.sin(theta), Lz = -Math.cos(theta);
  const earthshine = 0.07 * (0.5 + 0.5 * Math.cos(theta));   // brightest near new moon
  const relief = 0.05 + 0.35 * Math.abs(Math.sin(theta));     // craters show most at half moon, least at full
  const half = S / 2;

  for (let j = 0; j < S; j++) {
    const v = (j + 0.5) / half - 1;
    for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / half - 1;
      const rr = u * u + v * v;
      const k = (j * S + i) * 4;
      const edge = (1 - Math.sqrt(rr)) * half + 0.5;          // smooth outer edge
      if (edge <= 0) { px[k + 3] = 0; continue; }

      const mu = Math.sqrt(Math.max(0, 1 - rr));               // facing us
      const nx = tex[k] / 127.5 - 1, ny = tex[k + 1] / 127.5 - 1;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const albedo = tex[k + 2] / 255;

      const mu0 = nx * Lx + nz * Lz;                           // sunlight on the bumpy surface
      const mu0Smooth = u * Lx + mu * Lz;                      // sunlight on a smooth ball
      const day = smoothstep(-0.04, 0.08, mu0Smooth);

      let I = 0;
      if (mu0 > 0) I = albedo * (1.5 * mu0 / (mu0 + 0.5 * (nz + mu) + 0.05) + relief * mu0) * day;
      I += albedo * earthshine * (0.4 + 0.6 * mu) * (1 - day); // faint glow on the dark side

      const g = 255 * Math.pow(Math.min(1, I * 1.15), 0.9);
      px[k] = px[k + 1] = px[k + 2] = g;
      px[k + 3] = 255 * Math.min(1, edge);
    }
  }
  ctx.clearRect(0, 0, S, S);
  ctx.putImageData(out, 0, 0);
}

// Let Node (tests) import it too
if (typeof module !== 'undefined') {
  module.exports = { SYNODIC, moonAge, phaseFraction, illumination, phaseInfo, nextPhaseDate };
}
