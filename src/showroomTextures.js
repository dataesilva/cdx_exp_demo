import * as THREE from 'three';

/**
 * Procedural showroom textures, generated on a canvas at runtime — no image
 * files to download or decode, so loading stays instant. Detail (resolution,
 * anisotropy, bump maps) scales with the quality level; the app drops the level
 * if the framerate sags (see Showroom.reduceDetail / main.js).
 *
 *   - concrete / soft marble  -> walls + floor (grayscale, tinted by material)
 *   - dark wood (subtle grain) -> centre stage platform (colour baked in)
 */

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// One octave of bilinearly-interpolated value noise, added into `field`.
function addValueNoise(field, size, freq, amp, seed) {
  const gw = Math.max(2, Math.ceil(freq) + 1);
  const grid = new Float32Array(gw * gw);
  let s = seed >>> 0;
  for (let i = 0; i < grid.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    grid[i] = s / 4294967296;
  }
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * (gw - 1);
    const y0 = Math.floor(fy);
    const ty = smooth(fy - y0);
    const y1 = Math.min(y0 + 1, gw - 1);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * (gw - 1);
      const x0 = Math.floor(fx);
      const tx = smooth(fx - x0);
      const x1 = Math.min(x0 + 1, gw - 1);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x1];
      const c = grid[y1 * gw + x0];
      const d = grid[y1 * gw + x1];
      const top = a + (b - a) * tx;
      const bot = c + (d - c) * tx;
      field[y * size + x] += (top + (bot - top) * ty) * amp;
    }
  }
}

// Fractal Brownian motion field in [0,1].
function fbmField(size, { octaves = 4, baseFreq = 4, gain = 0.5, lacunarity = 2, seed = 1 }) {
  const field = new Float32Array(size * size);
  let amp = 1;
  let freq = baseFreq;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    addValueNoise(field, size, freq, amp, seed + o * 101);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  for (let i = 0; i < field.length; i++) field[i] /= norm;
  return field;
}

function toTexture(size, fill, { srgb, anisotropy }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  fill(img.data);
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping; // hide tile seams cheaply
  tex.anisotropy = anisotropy;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * @param {{ size?: number, anisotropy?: number, bump?: boolean }} opts
 * @returns {{ wallMap, wallBump, floorMap, floorBump, woodMap, woodBump }}
 *          bump maps are null when `bump` is false.
 */
export function makeShowroomTextures({ size = 512, anisotropy = 4, bump = true } = {}) {
  const px = size * size;

  // --- concrete / soft marble (shared field, two tinted instances) ----------
  const cf = fbmField(size, { octaves: 5, baseFreq: 3, seed: 7 });

  const concreteColor = (lo, warm) =>
    toTexture(size, (d) => {
      for (let i = 0; i < px; i++) {
        const v = Math.max(0, Math.min(1, lo + (cf[i] - 0.5) * 0.34));
        const c = v * 255;
        d[i * 4] = c;
        d[i * 4 + 1] = c * (warm ? 0.99 : 1);
        d[i * 4 + 2] = c * (warm ? 0.96 : 1);
        d[i * 4 + 3] = 255;
      }
    }, { srgb: true, anisotropy });

  const concreteBump = () =>
    toTexture(size, (d) => {
      for (let i = 0; i < px; i++) {
        const c = cf[i] * 255;
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c;
        d[i * 4 + 3] = 255;
      }
    }, { srgb: false, anisotropy });

  const wallMap = concreteColor(0.84, true);
  const floorMap = concreteColor(0.78, false);
  const wallBump = bump ? concreteBump() : null;
  const floorBump = bump ? concreteBump() : null;

  // --- dark wood (restrained grain) -----------------------------------------
  const wf = fbmField(size, { octaves: 4, baseFreq: 5, seed: 23 });
  const RINGS = 6; // few long streaks -> "not too much grain"
  const WARP = 2.4;

  const woodMap = toTexture(size, (d) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const n = wf[i];
        const grain = Math.sin((y / size) * Math.PI * 2 * RINGS + (n - 0.5) * WARP);
        const detail = n * 0.5 + (0.5 + 0.5 * grain) * 0.5;
        const l = 0.16 + detail * 0.12; // dark, low-contrast
        d[i * 4] = Math.min(1, l * 1.5) * 255; // R (warm brown)
        d[i * 4 + 1] = Math.min(1, l * 0.95) * 255; // G
        d[i * 4 + 2] = Math.min(1, l * 0.6) * 255; // B
        d[i * 4 + 3] = 255;
      }
    }
  }, { srgb: true, anisotropy });

  const woodBump = bump
    ? toTexture(size, (d) => {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = y * size + x;
            const n = wf[i];
            const grain = Math.sin((y / size) * Math.PI * 2 * RINGS + (n - 0.5) * WARP);
            const c = (n * 0.5 + (0.5 + 0.5 * grain) * 0.5) * 255;
            d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c;
            d[i * 4 + 3] = 255;
          }
        }
      }, { srgb: false, anisotropy })
    : null;

  return { wallMap, wallBump, floorMap, floorBump, woodMap, woodBump };
}
