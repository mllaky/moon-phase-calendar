"""
Generates the moon surface used by the widget and website.

Output: ../moon-texture.js, one PNG packed into a data URI:
  R, G = surface normal (x, y)  -> lets the app light craters from any angle
  B    = albedo (brightness)     -> dark seas, bright highlands, ray craters

The near side is modelled on the real moon: the main seas (maria) sit at their
true latitude/longitude, plus thousands of craters and the big bright ray
craters (Tycho, Copernicus, Kepler, Aristarchus).

Run:  python3 tools/generate_moon_texture.py
"""
import base64, io, math, os
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, gaussian_filter

N = 640                      # texture size in pixels
rng = np.random.default_rng(42)

# ---------- sphere geometry (image space: x right, y down, z toward viewer) ----------
ax = (np.arange(N) + 0.5) / N * 2 - 1
X, Y = np.meshgrid(ax, ax)
R2 = X**2 + Y**2
inside = R2 < 1.0
Z = np.sqrt(np.clip(1 - R2, 0, 1))
P = np.stack([X, -Y, Z], axis=-1)           # 3D point, y up for lat/lon

def vec(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.sin(lo), math.sin(la), math.cos(la) * math.cos(lo)])

# ---------- 3D value noise / fractal noise ----------
G = 96
lattice = rng.random((G, G, G)).astype(np.float32)
def noise3(p, freq):
    c = (p * freq + 1000.0) % G
    pts = np.stack([c[..., 0].ravel(), c[..., 1].ravel(), c[..., 2].ravel()])
    return map_coordinates(lattice, pts, order=1, mode='grid-wrap').reshape(p.shape[:-1])
def fbm(p, freq, octaves=6, gain=0.5, shift=0.0):
    tot, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        tot = tot + amp * noise3(p + shift + o * 17.3, freq * 2**o)
        norm += amp; amp *= gain
    v = tot / norm
    m = v[inside] if v.shape == inside.shape else v
    return (v - m.mean()) / (m.std() + 1e-9)  # mean 0, spread 1

# ---------- seas (maria) at their real positions: (lat, lon, radius in degrees) ----------
MARIA = [
    (33, -16, 17), (36, -22, 10), (28, -8, 9),          # Imbrium
    (28, 17, 10),                                        # Serenitatis
    (8.5, 31, 11), (4, 24, 7),                          # Tranquillitatis
    (17, 59, 8),                                         # Crisium
    (-8, 51, 9), (-2, 54, 6),                            # Fecunditatis
    (-15, 35, 6),                                        # Nectaris
    (10, -57, 16), (25, -52, 13), (-2, -44, 11), (38, -45, 9), (15, -40, 9),   # Procellarum
    (-21, -17, 9), (-10, -23, 7),                        # Nubium, Cognitum
    (-24, -39, 6),                                       # Humorum
    (7, -31, 7),                                         # Insularum
    (13, 4, 4.5),                                        # Vaporum
    (56, -30, 6), (57, -5, 6), (56, 20, 5), (55, 40, 4), # Frigoris
    (-1, 87, 5), (13, 86, 4), (-38, 88, 6),              # edge seas
]
warp = fbm(P, 2.5, 5, shift=11.0)       # big wobbles in the coastline
edge = fbm(P, 14.0, 4, shift=13.0)      # fine ragged edges
keep = np.ones((N, N), np.float32)
for lat, lon, rad in MARIA:
    d = np.degrees(np.arccos(np.clip(P @ vec(lat, lon), -1, 1)))
    t = d / (rad * (1 + 0.22 * warp)) + 0.08 * edge
    keep *= 1 - np.clip((1.0 - t) / 0.22, 0, 1)
mare = gaussian_filter(1 - keep, 1.4)

# ---------- brightness (albedo) ----------
high = 0.68 + 0.05 * fbm(P, 9.0, 6, shift=3.0) + 0.025 * fbm(P, 40.0, 4, shift=5.0)
sea = 0.33 + 0.035 * fbm(P, 6.0, 6, shift=9.0) + 0.015 * fbm(P, 50.0, 3, shift=2.0)
albedo = high * (1 - mare) + sea * mare

# ---------- height (for craters and rough terrain) ----------
height = 0.0012 * fbm(P, 14.0, 6, shift=21.0) * (1 - 0.7 * mare)

def add_crater(c, r, depth=0.22, bright=0.0, peak=None):
    """c: unit vector of crater centre, r: angular radius (radians)."""
    global height, albedo
    if c[2] < -0.05: return
    cx, cy = c[0], -c[1]
    box = (r * 3.2 + 0.01)
    i0 = max(0, int(((cy - box) + 1) / 2 * N)); i1 = min(N, int(((cy + box) + 1) / 2 * N) + 2)
    j0 = max(0, int(((cx - box) + 1) / 2 * N)); j1 = min(N, int(((cx + box) + 1) / 2 * N) + 2)
    if i1 <= i0 or j1 <= j0: return
    sub = P[i0:i1, j0:j1]
    d = np.arccos(np.clip(sub @ c, -1, 1))
    t = d / r
    h = np.zeros_like(t)
    bowl = t < 1
    h[bowl] = -depth * r * (1 - t[bowl] ** 2)                        # bowl
    h += 0.35 * depth * r * np.exp(-((t - 1.0) / 0.16) ** 2)         # raised rim
    out = t >= 1
    h[out] += 0.08 * depth * r * np.exp(-(t[out] - 1.0) * 2.5)       # ejecta apron
    if peak:                                                          # central peak
        h += peak * depth * r * np.exp(-(t / 0.16) ** 2)
    height[i0:i1, j0:j1] += h
    if bright:
        halo = bright * np.exp(-np.maximum(t - 0.6, 0) * 1.6)
        albedo[i0:i1, j0:j1] = np.minimum(1.0, albedo[i0:i1, j0:j1] + halo)

def rand_unit_front():
    while True:
        v = rng.normal(size=3); v /= np.linalg.norm(v)
        if v[2] > -0.02: return v

def mare_at(v):
    if v[2] <= 0: return 0.0
    j = int((v[0] + 1) / 2 * N); i = int((-v[1] + 1) / 2 * N)
    return float(mare[min(N - 1, max(0, i)), min(N - 1, max(0, j))])

# Many craters, big ones rare, fewer on the smooth seas
for k in range(4200):
    r = 0.004 * (1 - rng.random()) ** (-1 / 1.35)       # power-law sizes
    r = min(r, 0.07)
    v = rand_unit_front()
    if rng.random() < mare_at(v) * 0.75: continue
    fresh = rng.random() < 0.12
    add_crater(v, r, depth=rng.uniform(0.12, 0.24),
               bright=(rng.uniform(0.06, 0.18) if fresh else 0.0),
               peak=(0.35 if r > 0.03 else None))

# Famous craters (real positions)
FAMOUS = [  # lat, lon, radius(rad), brightness, rays
    (-43.3, -11.2, 0.026, 0.30, 1.0),   # Tycho
    (9.6, -20.1, 0.027, 0.20, 0.7),     # Copernicus
    (8.1, -38.0, 0.009, 0.22, 0.45),    # Kepler
    (23.7, -47.4, 0.011, 0.40, 0.25),   # Aristarchus
    (-8.9, 61.1, 0.006, 0.20, 0.3),     # Langrenus-ish bright spot
    (-21.0, 61.0, 0.01, 0.10, 0.0),     # Petavius area
    (-9.2, -1.9, 0.045, 0.0, 0.0),      # Ptolemaeus (big flat crater)
    (51.6, -9.3, 0.029, 0.0, 0.0),      # Plato (dark floor)
    (-58.4, -14.4, 0.06, 0.0, 0.0),     # Clavius
]
for lat, lon, r, b, rays in FAMOUS:
    c = vec(lat, lon)
    add_crater(c, r, depth=0.25, bright=b, peak=0.4)
    if rays:
        d = np.arccos(np.clip(P @ c, -1, 1))
        # direction around the crater in the tangent plane
        e1 = np.cross([0, 1, 0], c); e1 /= np.linalg.norm(e1); e2 = np.cross(c, e1)
        phi = np.arctan2(P @ e2, P @ e1)
        streak = np.zeros_like(d)
        for _ in range(int(40 * rays) + 8):
            a0 = rng.uniform(-math.pi, math.pi); w = rng.uniform(0.03, 0.09)
            L = rng.uniform(0.05, 0.3) * rays
            dphi = np.angle(np.exp(1j * (phi - a0)))
            streak += np.exp(-(dphi / w) ** 2) * np.exp(-d / max(L, 0.05)) * (d > r)
        streak *= np.clip(0.7 + 0.5 * fbm(P, 30.0, 3, shift=a0), 0, 2)
        blanket = np.exp(-np.maximum(d - r, 0) / (2.5 * r)) * (d > r * 0.8)
        albedo = np.minimum(1.0, albedo + 0.09 * np.clip(streak, 0, 1.5) + 0.08 * rays * blanket)

# Plato has a famously dark floor
dp = np.arccos(np.clip(P @ vec(51.6, -9.3), -1, 1))
albedo -= 0.18 * np.exp(-(dp / 0.025) ** 4)

# ---------- normals from height ----------
px = 2.0 / N
gy, gx = np.gradient(height, px)
EXAG = 1.0
nx = Z * 0 + X - gx * EXAG * Z
ny = Y - gy * EXAG * Z
nz = Z + 0.0
ln = np.sqrt(nx**2 + ny**2 + nz**2) + 1e-9
nx, ny = nx / ln, ny / ln

albedo = np.clip(albedo, 0.02, 1.0)
img = np.zeros((N, N, 4), np.uint8)
img[..., 0] = np.clip((nx * 0.5 + 0.5) * 255, 0, 255)
img[..., 1] = np.clip((ny * 0.5 + 0.5) * 255, 0, 255)
img[..., 2] = np.clip(albedo * 255, 0, 255)
img[..., 3] = 255
img[~inside] = 0

buf = io.BytesIO()
Image.fromarray(img, 'RGBA').save(buf, 'PNG', optimize=True)
b64 = base64.b64encode(buf.getvalue()).decode()

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'moon-texture.js')
with open(out, 'w') as f:
    f.write('// Generated by tools/generate_moon_texture.py. Do not edit by hand.\n')
    f.write('// R,G = surface normal, B = brightness. See the script for details.\n')
    f.write(f'const MOON_TEXTURE = "data:image/png;base64,{b64}";\n')
print(f'wrote {out}: {len(b64) // 1024} KB')

# Also save a plain preview of the full moon albedo for checking
Image.fromarray((albedo * 255 * inside).astype(np.uint8)).save(
    os.environ.get('MOON_PREVIEW', '/dev/null'), 'PNG')
