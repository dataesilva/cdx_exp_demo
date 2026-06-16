import * as THREE from 'three';

/**
 * Create a volfuse "depthproj" single-sensor point-cloud player.
 *
 * Unlike the Depthkit mesh player (DepthkitScene.js), this renders the
 * combined-per-pixel video (colour on top, luma-encoded depth on bottom) as a
 * GPU-unprojected point cloud: a flat grid is displaced in the vertex shader by
 * the sampled depth and coloured from the top half. One video decode + one
 * unprojection, no mesh/.drc churn — the frame-rate-stable path.
 *
 * Expects a volfuse `depthproj` single-sensor export laid out as:
 *
 *   media/video/MyClip/take.mp4        <- combined colour/depth video
 *   media/video/MyClip/depthproj.json  <- depth intrinsics, near/far, depthToWorld, bounds
 *
 * `clipPath` is the folder path (no trailing slash), served from Vite's public/
 * root, e.g. './media/video/03_capture-antibody_s1'.
 *
 * Returns the same interface as createDepthkitPlayer so Timeline drives it
 * unchanged: { player, video, update, add, remove }. `video` is the combined
 * video element — Timeline seeks it to (playhead − start) and the unprojection
 * follows automatically.
 *
 * Placement: the depthproj world frame is the reference *camera* frame (y-down,
 * not gravity-aligned), so the cloud is wrapped in a group that is oriented
 * upright / onto the stage by `media/video/_placement.json` (shared across all
 * clips for the fixed rig), overridable via `opts.placement`.
 *
 * @param {import('three').Scene} scene
 * @param {string} clipPath
 * @param {{ autoplay?: boolean, loop?: boolean, autoAdd?: boolean,
 *           gridStep?: number, edgeTol?: number, pointSize?: number,
 *           placement?: {position?:number[], rotationEuler?:number[], scale?:number} }} [opts]
 */
export async function createDepthProjPlayer(scene, clipPath, opts = {}) {
  const {
    autoplay = true, loop = true, autoAdd = true,
    gridStep = 1, edgeTol = 0.10, pointSize = 2.5,
  } = opts;

  const meta = await (await fetch(`${clipPath}/depthproj.json`, { cache: 'no-cache' })).json();

  // --- video + texture ----------------------------------------------------
  const video = document.createElement('video');
  video.src = `${clipPath}/${meta.video || 'take.mp4'}`;
  video.loop = loop;
  video.muted = true;            // Depthkit colour/depth carries no usable audio
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';

  const tex = new THREE.VideoTexture(video);
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;

  // --- bounds (world-AABB cull) ------------------------------------------
  // baseMin/baseMax are the immutable depthproj.json values; bMin/bMax are a
  // separate clone fed to the uniform and live-mutated by setBoundsTrim.
  const b = meta.bounds && meta.bounds.min && meta.bounds.max ? meta.bounds : null;
  const baseMin = new THREE.Vector3(...(b ? b.min : [-1e9, -1e9, -1e9]));
  const baseMax = new THREE.Vector3(...(b ? b.max : [1e9, 1e9, 1e9]));
  const bMin = baseMin.clone();
  const bMax = baseMax.clone();

  const uniforms = {
    uMap: { value: tex },
    uDepthToWorld: { value: new THREE.Matrix4().set(...meta.depthToWorld) },
    uNear: { value: meta.near }, uFar: { value: meta.far },
    uW: { value: meta.depth.width }, uH: { value: meta.depth.height },
    uFx: { value: meta.depth.fx }, uFy: { value: meta.depth.fy },
    uCx: { value: meta.depth.cx }, uCy: { value: meta.depth.cy },
    uFlipV: { value: 0 }, uEdgeCull: { value: 1 }, uEdgeTol: { value: edgeTol },
    uPointSize: { value: pointSize },
    uBoundsMin: { value: bMin }, uBoundsMax: { value: bMax },
    uBoundsCull: { value: b ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
  });

  const geo = makeGrid(meta.depth.width, meta.depth.height, gridStep);
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;

  // --- placement group (upright / on stage; shared across clips) ----------
  const root = new THREE.Group();
  root.add(points);
  let placement = opts.placement;
  if (!placement) {
    const url = clipPath.replace(/\/[^/]+$/, '/_placement.json');
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) placement = await r.json();
    } catch { /* no shared placement file; identity */ }
  }
  applyPlacement(root, placement);

  let added = false;
  const add = () => { if (!added) { scene.add(root); added = true; } };
  const remove = () => { if (added) { scene.remove(root); added = false; } };

  if (autoplay) video.play().catch(() => {});
  if (autoAdd) {
    video.addEventListener('loadeddata', add, { once: true });
  }

  return {
    player: root,
    root,
    isDepthProj: true,
    video,
    update() { /* VideoTexture auto-updates each render */ },
    add,
    remove,
    /** Live-set the placement rotation (degrees) — used by the placement tuner. */
    setRotationEuler(x, y, z) {
      root.rotation.set(
        THREE.MathUtils.degToRad(x),
        THREE.MathUtils.degToRad(y),
        THREE.MathUtils.degToRad(z),
      );
    },
    /**
     * Live-trim the world-AABB cull (camera-frame metres) — used by the bounds
     * tuner. `trim.maxY` shrinks `bounds.max.y` by that amount, which crops
     * points near the subject's feet/floor after the upright placement flip.
     */
    setBoundsTrim(trim = {}) {
      const { maxY = 0, minY = 0 } = trim;
      uniforms.uBoundsMax.value.y = baseMax.y - maxY;
      uniforms.uBoundsMin.value.y = baseMin.y + minY;
    },
    getBaseBounds() { return { min: baseMin.clone(), max: baseMax.clone() }; },
  };
}

function applyPlacement(obj, p) {
  if (!p) return;
  if (p.position) obj.position.fromArray(p.position);
  if (p.rotationEuler) obj.rotation.set(
    THREE.MathUtils.degToRad(p.rotationEuler[0] || 0),
    THREE.MathUtils.degToRad(p.rotationEuler[1] || 0),
    THREE.MathUtils.degToRad(p.rotationEuler[2] || 0),
  );
  if (typeof p.scale === 'number') obj.scale.setScalar(p.scale);
  else if (Array.isArray(p.scale)) obj.scale.fromArray(p.scale);
}

// (W'xH') grid of vertices carrying their [0,1] grid coord in position.xy;
// `step` subsamples for fewer points. Ported from webxr/loaders/depthProj.js.
function makeGrid(W, H, step) {
  step = Math.max(1, step | 0);
  const nx = Math.max(2, Math.floor((W - 1) / step) + 1);
  const ny = Math.max(2, Math.floor((H - 1) / step) + 1);
  const pos = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = i / (nx - 1);
      pos[k + 1] = j / (ny - 1);
      pos[k + 2] = 0;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geo;
}

// GLSL ported from webxr/shaders/depthProj.js (point-cloud variant): unproject
// each grid point through the depth intrinsics using depth from the video's
// bottom half, colour from the top half, with silhouette/edge cull and a
// world-space AABB bounds cull.
const VERT = /* glsl */ `
uniform sampler2D uMap;
uniform mat4 uDepthToWorld;
uniform float uNear, uFar, uW, uH;
uniform float uFx, uFy, uCx, uCy;
uniform float uFlipV, uEdgeCull, uEdgeTol, uPointSize;
uniform vec3 uBoundsMin, uBoundsMax;
uniform float uBoundsCull;

varying vec2 vColorUV;
varying float vValid;

float lumAt(vec2 g) {
  float px = g.x * (uW - 1.0);
  float py = g.y * (uH - 1.0);
  float u = (px + 0.5) / uW;
  float v = (uH + py + 0.5) / (2.0 * uH);   // depth is the bottom half
  v = mix(v, 1.0 - v, uFlipV);
  return texture2D(uMap, vec2(u, v)).r;
}

float sampleZ(vec2 g) {
  float L = lumAt(g) * 255.0;
  if (L < 0.5) return -1.0;
  float t = (L - 1.0) / 254.0;
  return uNear + t * (uFar - uNear);
}

bool breaks(float z, vec2 g, vec2 off) {
  float zn = sampleZ(clamp(g + off, 0.0, 1.0));
  if (zn < 0.0) return true;
  return abs(z - zn) > uEdgeTol;
}

void main() {
  vec2 g = clamp(position.xy, 0.0, 1.0);
  float z = sampleZ(g);

  float px = g.x * (uW - 1.0);
  float py = g.y * (uH - 1.0);
  float cu = (px + 0.5) / uW;
  float cv = (py + 0.5) / (2.0 * uH);        // colour is the top half
  cv = mix(cv, 1.0 - cv, uFlipV);
  vColorUV = vec2(cu, cv);

  bool valid = z > 0.0;
  if (valid && uEdgeCull > 0.5) {
    vec2 dx = vec2(1.0 / max(uW - 1.0, 1.0), 0.0);
    vec2 dy = vec2(0.0, 1.0 / max(uH - 1.0, 1.0));
    if (breaks(z, g, dx) || breaks(z, g, -dx) || breaks(z, g, dy) || breaks(z, g, -dy))
      valid = false;
  }
  vValid = valid ? 1.0 : 0.0;

  if (!valid) {
    gl_Position = vec4(0.0 / 0.0);
    gl_PointSize = 0.0;
    return;
  }

  vec3 cam = vec3((px - uCx) * z / uFx, (py - uCy) * z / uFy, z);
  vec4 world = uDepthToWorld * vec4(cam, 1.0);

  if (uBoundsCull > 0.5 &&
      (any(lessThan(world.xyz, uBoundsMin)) || any(greaterThan(world.xyz, uBoundsMax)))) {
    vValid = 0.0;
    gl_Position = vec4(0.0 / 0.0);
    gl_PointSize = 0.0;
    return;
  }

  gl_Position = projectionMatrix * modelViewMatrix * world;
  gl_PointSize = uPointSize;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
varying vec2 vColorUV;
varying float vValid;

void main() {
  if (vValid < 0.5) discard;
  gl_FragColor = vec4(texture2D(uMap, vColorUV).rgb, 1.0);
}
`;
