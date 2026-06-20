import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { makeShowroomTextures } from './showroomTextures.js';

/**
 * Showroom — a procedural take on Unity HDRP's "Material Samples" room: an
 * enclosed studio with dark, softly-textured (concrete/marble) walls, a
 * dark-wood centre stage, and soft, even lighting.
 *
 * Textures are generated procedurally (see showroomTextures.js) so there are no
 * assets to download. Detail scales with a quality level; if the framerate
 * drops, callers invoke `reduceDetail()` to step the textures down a level.
 *
 * Fixed in world space (the player walks around inside it). Pair with ACES tone
 * mapping + a scene.environment for the closest match.
 *
 * @param {import('three').Scene} scene
 * @param {{ quality?: 'high'|'medium'|'low' }} [opts]
 * @returns {{ group: THREE.Group, ROOM_SIZE: number, ROOM_HEIGHT: number,
 *            reduceDetail: () => boolean, quality: string }}
 */
const QUALITY_LEVELS = ['high', 'medium', 'low'];
const QUALITY_SETTINGS = {
  high: { size: 512, anisotropy: 4, bump: true },
  medium: { size: 256, anisotropy: 2, bump: true },
  low: { size: 128, anisotropy: 1, bump: false },
};

export function createShowroom(scene, { quality = 'high' } = {}) {
  RectAreaLightUniformsLib.init(); // required before RectAreaLights render

  const ROOM_SIZE = 16; // floor footprint (m)
  const ROOM_HEIGHT = 6;
  const half = ROOM_SIZE / 2;

  const group = new THREE.Group();
  group.name = 'Showroom';

  // Dark studio air to match the darkened walls.
  const BG = 0x1a1a1a; // 0x2b2b2c
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.1); // .012

  // --- Materials (maps are assigned by applyTextures, below) ----------------
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 }); // color: 0x6f6f6f, roughness: 0.8, metalness: 0, envMapIntensity: 0.5 
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x4d4d4d, roughness: 0.2, metalness: 0, envMapIntensity: 0.35 }); // color: 0x4d4d4d, roughness: 0., metalness: 0, envMapIntensity: 0.35 
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1, metalness: 0, envMapIntensity: 0.3 }); // color: 0x3a3a3a, roughness: 1, metalness: 0, envMapIntensity: 0.3 
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, envMapIntensity: 0.3 }); // color: 0xffffff, roughness: 0.5, metalness: 0, envMapIntensity: 0.6 

  // --- Surfaces -------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_HEIGHT;
  group.add(ceiling);

  const wallGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_HEIGHT);
  const wallDefs = [
    { pos: [0, ROOM_HEIGHT / 2, -half], rot: 0 },
    { pos: [0, ROOM_HEIGHT / 2, half], rot: Math.PI },
    { pos: [-half, ROOM_HEIGHT / 2, 0], rot: Math.PI / 2 },
    { pos: [half, ROOM_HEIGHT / 2, 0], rot: -Math.PI / 2 },
  ];
  for (const w of wallDefs) {
    const m = new THREE.Mesh(wallGeo, wallMat);
    m.position.set(...w.pos);
    m.rotation.y = w.rot;
    m.receiveShadow = true;
    group.add(m);
  }

  // --- Centre stage (dark wood) ---------------------------------------------
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.12, 64), woodMat); //2.2, 2.2, 0.12, 64
  platform.position.y = 0.06;
  platform.castShadow = false; // true
  platform.receiveShadow = true;
  group.add(platform);

  // --- Procedural textures + adaptive detail --------------------------------
  let qIndex = Math.max(0, QUALITY_LEVELS.indexOf(quality));
  let owned = []; // textures to dispose when regenerating

  function applyTextures(level) {
    for (const t of owned) t.dispose();
    const tex = makeShowroomTextures(QUALITY_SETTINGS[level]);

    const assign = (mat, map, bumpMap, repeat, bumpScale) => {
      map.repeat.set(...repeat);
      mat.map = map;
      mat.bumpMap = bumpMap || null;
      mat.bumpScale = bumpMap ? bumpScale : 0;
      if (bumpMap) bumpMap.repeat.set(...repeat);
      mat.needsUpdate = true;
    };

    assign(wallMat, tex.wallMap, tex.wallBump, [3, 1.2], 0.006);
    assign(floorMat, tex.floorMap, tex.floorBump, [5, 5], 0.005);
    assign(woodMat, tex.woodMap, tex.woodBump, [2, 2], 0.004);

    owned = [tex.wallMap, tex.wallBump, tex.floorMap, tex.floorBump, tex.woodMap, tex.woodBump].filter(Boolean);
  }
  applyTextures(QUALITY_LEVELS[qIndex]);

  /** Step texture detail down one level. Returns false if already at lowest. */
  function reduceDetail() {
    if (qIndex >= QUALITY_LEVELS.length - 1) return false;
    qIndex += 1;
    applyTextures(QUALITY_LEVELS[qIndex]);
    return true;
  }

  // --- Soft, even studio lighting -------------------------------------------
  // Low hemisphere fill on top of the image-based ambient (set in main.js).
  group.add(new THREE.HemisphereLight(0xe6e6e6, 0x6a6a68, 0.1)); // .5

  // Overhead "softbox": a large area light just under the ceiling, aimed down.
  const softbox = new THREE.RectAreaLight(0xfff4ec, 20, ROOM_SIZE * 0.6, ROOM_SIZE * 0.6); // intensity 9
  softbox.position.set(0, ROOM_HEIGHT - 0.05, 0);
  softbox.lookAt(0, 0, 0);
  group.add(softbox);

  // Gentle front fill so the subject's facing side isn't flat.
  const fill = new THREE.RectAreaLight(0xeaf0ff, 3, 6, 4);
  fill.position.set(0, 3, half - 0.5);
  fill.lookAt(0, 1.5, 0);
  group.add(fill);

  // Shadow-casting key light (RectAreaLights can't cast shadows in three.js).
  const key = new THREE.DirectionalLight(0xfff4ec, 1.1); //1.1
  key.position.set(4, 8, 5);
  key.target.position.set(0, 1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const sc = key.shadow.camera;
  sc.near = 0.5;
  sc.far = 24;
  sc.left = sc.bottom = -7;
  sc.right = sc.top = 7;
  group.add(key);
  group.add(key.target);

  /**
   * Adjust shadow cost without recreating anything. Used to free GPU budget for
   * the depthproj cloud (notably in VR, where stereo doubles the per-fragment
   * soft-PCF sampling cost):
   *   'high' — 2048² / radius 4   (desktop default)
   *   'low'  — 1024² / radius 2   (VR baseline; map realloc only, no recompile)
   *   'off'  — no shadow at all   (deepest tier; one-time material recompile)
   */
  function setShadowProfile(level) {
    if (level === 'off') {
      key.castShadow = false;
      return;
    }
    key.castShadow = true;
    const high = level === 'high';
    key.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    key.shadow.radius = high ? 4 : 2;
    key.shadow.map?.dispose();
    key.shadow.map = null; // force the renderer to realloc the depth map at the new size
  }

  // Visible glowing ceiling panel coincident with the softbox.
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_SIZE * 0.5, ROOM_SIZE * 0.5),
    new THREE.MeshStandardMaterial({ color: 0x000000,
      emissive: 0xedf6ff, emissiveIntensity: 1, side: THREE.DoubleSide }) // old 0xfff4ec
  );
  panel.rotation.x = Math.PI / 2;
  panel.position.y = ROOM_HEIGHT - 0.04;
  group.add(panel);

  scene.add(group);
  return {
    group,
    ROOM_SIZE,
    ROOM_HEIGHT,
    reduceDetail,
    setShadowProfile,
    get quality() {
      return QUALITY_LEVELS[qIndex];
    },
  };
}
