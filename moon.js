// Shared moon math + drawing, used by both the website (index.html) and the widget (widget.html).
//
// Phase times use the algorithms from Jean Meeus, "Astronomical Algorithms" (ch. 47 and 49),
// so new, quarter and full moon times are accurate to within a few minutes for any year,
// past or future. Nothing is hard-coded, so the app keeps working year after year.

const SYNODIC = 29.530588861;   // average days between new moons
const DAY_MS = 86400000;
const rad = d => d * Math.PI / 180;
const jdOf = date => date.getTime() / DAY_MS + 2440587.5;   // Date -> Julian Day
const dateOf = jd => new Date((jd - 2440587.5) * DAY_MS);    // Julian Day -> Date

// Exact time of a principal phase. k = lunation number (0 = Jan 2000), q = 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter
function truePhaseJD(k, q) {
  const kk = k + q, T = kk / 1236.85, s = Math.sin, c = Math.cos;
  let jde = 2451550.09766 + 29.530588861 * kk + 0.00015437 * T * T - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const M = rad(2.5534 + 29.1053567 * kk - 0.0000014 * T * T);       // Sun's mean anomaly
  const Mp = rad(201.5643 + 385.81693528 * kk + 0.0107582 * T * T);  // Moon's mean anomaly
  const F = rad(160.7108 + 390.67050284 * kk - 0.0016118 * T * T);   // Moon's argument of latitude
  const O = rad(124.7746 - 1.56375588 * kk + 0.0020672 * T * T);     // longitude of the ascending node
  let corr;
  if (q === 0 || q === 0.5) {
    const a = q === 0 ? [-0.40720, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208]
                      : [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209];
    corr = a[0] * s(Mp) + a[1] * E * s(M) + a[2] * s(2 * Mp) + a[3] * s(2 * F) + a[4] * E * s(Mp - M)
      + a[5] * E * s(Mp + M) + a[6] * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F)
      + 0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F)
      - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O) - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F)
      + 0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F)
      + 0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
  } else {
    corr = -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp) + 0.00804 * s(2 * F)
      + 0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M) - 0.0018 * s(Mp - 2 * F) - 0.0007 * s(Mp + 2 * F)
      - 0.0004 * s(3 * Mp) - 0.00034 * E * s(2 * Mp - M) + 0.00032 * E * s(M + 2 * F) + 0.00032 * E * s(M - 2 * F)
      - 0.00028 * E * E * s(Mp + 2 * M) + 0.00027 * E * s(2 * Mp + M) - 0.00017 * s(O) - 0.00005 * s(Mp - M - 2 * F)
      + 0.00004 * s(2 * Mp + 2 * F) - 0.00004 * s(Mp + M + 2 * F) + 0.00004 * s(Mp - 2 * M) + 0.00003 * s(Mp + M - 2 * F)
      + 0.00003 * s(3 * M) + 0.00002 * s(2 * Mp - 2 * F) + 0.00002 * s(Mp - M + 2 * F) - 0.00002 * s(3 * Mp + M);
    const W = 0.00306 - 0.00038 * E * c(M) + 0.00026 * c(Mp) - 0.00002 * c(Mp - M) + 0.00002 * c(Mp + M) + 0.00002 * c(2 * F);
    corr += q === 0.25 ? W : -W;
  }
  return jde + corr - 69.2 / 86400;   // TT -> UT (ΔT ≈ 69 s)
}

// The principal phases around a moment, in time order: [{ jd, q }]
const phaseCache = new Map();
function phasesAround(date) {
  const k0 = Math.floor((jdOf(date) - 2451550.09766) / SYNODIC);
  const out = [];
  for (let k = k0 - 1; k <= k0 + 2; k++) {
    if (!phaseCache.has(k)) phaseCache.set(k, [0, 0.25, 0.5, 0.75].map(q => ({ jd: truePhaseJD(k, q), q })));
    out.push(...phaseCache.get(k));
  }
  return out.sort((a, b) => a.jd - b.jd);
}

const PHASES = [
  { max: 0.0625, name: 'New Moon' },
  { max: 0.1875, name: 'Waxing Crescent' },
  { max: 0.3125, name: 'First Quarter' },
  { max: 0.4375, name: 'Waxing Gibbous' },
  { max: 0.5625, name: 'Full Moon' },
  { max: 0.6875, name: 'Waning Gibbous' },
  { max: 0.8125, name: 'Last Quarter' },
  { max: 0.9375, name: 'Waning Crescent' },
  { max: 1.01,   name: 'New Moon' },
];

// Where in its cycle the moon is: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
function phaseFraction(date) {
  const jd = jdOf(date), ev = phasesAround(date);
  for (let i = 0; i < ev.length - 1; i++) {
    if (jd >= ev[i].jd && jd < ev[i + 1].jd) {
      return (ev[i].q + 0.25 * (jd - ev[i].jd) / (ev[i + 1].jd - ev[i].jd)) % 1;
    }
  }
  return 0;
}
function moonAge(date) {   // days since the last new moon
  const jd = jdOf(date);
  const prev = phasesAround(date).filter(e => e.q === 0 && e.jd <= jd).pop();
  return prev ? jd - prev.jd : 0;
}
function illumination(date) { return (1 - Math.cos(2 * Math.PI * phaseFraction(date))) / 2; }
function phaseInfo(date) { const f = phaseFraction(date); return PHASES.find(p => f < p.max); }

// Next time the moon reaches a phase after `from` (target 0.25 first quarter, 0.5 full, 0.75 last quarter, 1 new)
function nextPhaseDate(from, target) {
  const q = target % 1, jd = jdOf(from);
  for (let shift = 0; shift < 3; shift++) {
    const probe = new Date(from.getTime() + shift * 20 * DAY_MS);
    const hit = phasesAround(probe).find(e => e.q === q && e.jd > jd);
    if (hit) return dateOf(hit.jd);
  }
  return null;
}

// ---------- Full moon names ----------
// Traditional names (as used by the Old Farmer's Almanac), worked out for any year:
//  - each month has its own name
//  - the Harvest Moon is the full moon closest to the September equinox; the Hunter's Moon is the one after it
//  - a second full moon in the same calendar month is a Blue Moon
//  - a full moon closer than about 362,500 km is a Supermoon; farther than 405,000 km is a Micromoon
const MONTH_MOONS = ['Wolf Moon', 'Snow Moon', 'Worm Moon', 'Pink Moon', 'Flower Moon', 'Strawberry Moon',
  'Buck Moon', 'Sturgeon Moon', 'Corn Moon', "Hunter's Moon", 'Beaver Moon', 'Cold Moon'];
const MOON_MEANINGS = {
  'Wolf Moon': 'Wolves howling in midwinter', 'Snow Moon': 'The snowiest time of year',
  'Worm Moon': 'Earthworms return as the ground thaws', 'Pink Moon': 'Pink wildflowers bloom in spring',
  'Flower Moon': 'Flowers everywhere in May', 'Strawberry Moon': 'Strawberry picking season',
  'Buck Moon': "Deer grow new antlers", 'Sturgeon Moon': 'Sturgeon fishing season',
  'Corn Moon': 'Corn harvest time', 'Harvest Moon': 'Bright evenings to bring in the harvest',
  "Hunter's Moon": 'Moonlit autumn hunting', 'Beaver Moon': 'Beavers prepare for winter',
  'Cold Moon': 'The long, cold nights of December', 'Blue Moon': 'A second full moon in one month',
};

function fullMoonsOfYear(year) {
  const k0 = Math.floor((year - 2000) * 12.3685) - 1;
  const list = [];
  for (let k = k0; k <= k0 + 15; k++) {
    const d = dateOf(truePhaseJD(k, 0.5));
    if (d.getFullYear() === year) list.push(d);
  }
  return list;
}

// Earth–Moon distance in km (Meeus ch. 47, main terms; good to a few hundred km)
function moonDistanceKm(date) {
  const T = (jdOf(date) - 2451545) / 36525, c = Math.cos;
  const D = rad(297.8501921 + 445267.1114034 * T), M = rad(357.5291092 + 35999.0502909 * T);
  const Mp = rad(134.9633964 + 477198.8675055 * T), F = rad(93.272095 + 483202.0175233 * T);
  return 385000.56 + (-20905355 * c(Mp) - 3699111 * c(2 * D - Mp) - 2955968 * c(2 * D) - 569925 * c(2 * Mp)
    + 48888 * c(M) - 3149 * c(2 * F) + 246158 * c(2 * D - 2 * Mp) - 152138 * c(2 * D - M - Mp)
    - 170733 * c(2 * D + Mp) - 204586 * c(2 * D - M) - 129620 * c(M - Mp) + 108743 * c(D)
    + 104755 * c(M + Mp) + 10321 * c(2 * D - 2 * F) + 79661 * c(Mp - 2 * F) - 34782 * c(4 * D - Mp)
    - 23210 * c(3 * Mp) - 21636 * c(4 * D - 2 * Mp) + 24208 * c(2 * D + M - Mp) + 30824 * c(2 * D + M)) / 1000;
}

// Name and extras for one full moon (pass the exact full moon time)
function fullMoonName(fullDate) {
  const y = fullDate.getFullYear(), list = fullMoonsOfYear(y);
  const idx = list.findIndex(d => Math.abs(d - fullDate) < DAY_MS);
  const equinox = Date.UTC(y, 8, 22, 18);
  let harvest = 0;
  list.forEach((d, i) => { if (Math.abs(d - equinox) < Math.abs(list[harvest] - equinox)) harvest = i; });

  let name = MONTH_MOONS[fullDate.getMonth()];
  if (idx === harvest) name = 'Harvest Moon';
  else if (idx === harvest + 1) name = "Hunter's Moon";
  else if (idx > 0 && list[idx - 1].getMonth() === fullDate.getMonth()) name = 'Blue Moon';

  const km = moonDistanceKm(fullDate);
  const extra = km < 362500 ? 'Supermoon' : km > 405000 ? 'Micromoon' : '';
  return { name, extra, km: Math.round(km), meaning: MOON_MEANINGS[name] || '' };
}

// The named full moon that belongs to the moon cycle a date is in
function currentMoonCycle(date) {
  const jd = jdOf(date), ev = phasesAround(date);
  const prevNew = ev.filter(e => e.q === 0 && e.jd <= jd).pop();
  const full = ev.find(e => e.q === 0.5 && e.jd > (prevNew ? prevNew.jd : jd - SYNODIC));
  const fullDate = dateOf(full.jd);
  return { fullDate, ...fullMoonName(fullDate) };
}

// Short line for the UI, e.g. "Tonight: Hunter's Moon" or "Growing toward the Beaver Moon"
function moonNameLine(date) {
  const cyc = currentMoonCycle(date);
  const label = cyc.name + (cyc.extra ? ` · ${cyc.extra}` : '');
  if (sameDay(date, cyc.fullDate)) return { text: `Tonight: the ${label}`, cyc };
  if (date < cyc.fullDate) return { text: `Growing toward the ${label}`, cyc };
  return { text: `Fading after the ${label}`, cyc };
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
  module.exports = { SYNODIC, moonAge, phaseFraction, illumination, phaseInfo, nextPhaseDate, fullMoonsOfYear, fullMoonName, moonDistanceKm, moonNameLine, truePhaseJD, dateOf };
}
