import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

/**
 * CoffeeTable — a faithful re-creation of the "Coffee Table" prefab from Forge
 * Creative's "Modern Furniture Pieces Pack" (free Unity asset):
 *
 *   https://assetstore.unity.com/packages/3d/props/furniture/modern-furniture-pieces-pack-81417
 *   © Forge Creative — "Modern Furniture Pieces Pack" (Unity Asset Store, 2018).
 *
 * Unlike a procedural approximation, this loads the asset's actual mesh
 * (Coffee Table.fbx, exported to public/models/) and re-builds its two Unity
 * materials in three.js so the look matches the source. Mapping comes straight
 * from the Unity prefab + .mat files (Assets/Modern Furniture/...):
 *
 *   prefab "Coffee Table.prefab"
 *     ├─ mesh "Cube"     → material Frame.mat  (metal body + legs)
 *     └─ mesh "Plane001" → material Glass.mat  (glass table top)
 *
 *   Frame.mat (HDRP/Lit): white albedo, metalness from map, smoothness 0.5,
 *     maps: Base_Normal, Base_Metallic, Base_AO  (Base_Height = parallax, omitted)
 *   Glass.mat (Standard, transparent): white, smoothness 0.5, ZWrite off,
 *     maps: Glass_Colour (16 MB albedo, omitted), Glass_Normal, Glass_AO
 *
 * Unity smoothness s → three roughness (1 - s). Unity colours are linear; the
 * scalar values used here are converted to sRGB. The 16 MB Glass_Colour albedo
 * and the parallax/height maps are intentionally left out (web/VR weight); the
 * glass instead uses MeshPhysicalMaterial transmission for real refraction,
 * which reads far better than Unity's alpha-blend in an IBL-lit room.
 *
 * Returns a Group immediately; the FBX streams in and is parented + scaled
 * (normalised to a ~1.4 m-wide real-world coffee table) once loaded. Its base
 * is seated at the group's local y=0 so callers can drop it onto any surface.
 *
 * @param {{ targetWidth?: number, onReady?: (g: THREE.Group) => void }} [opts]
 * @returns {THREE.Group}
 */
const TEX = './textures/coffeetable/';
const MODEL = './models/CoffeeTable.fbx';

export function createCoffeeTable({ targetWidth = 2.5, onReady } = {}) {
  const group = new THREE.Group();
  group.name = 'CoffeeTable';

  const texLoader = new THREE.TextureLoader();
  const loadTex = (file, { srgb = false } = {}) => {
    const t = texLoader.load(TEX + file);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  // --- Frame.mat → brushed metal body + legs --------------------------------
  // White albedo (Unity _BaseColor 1,1,1) reading as a metal via metalness 1;
  // Unity smoothness 0.5 → roughness 0.5. Normal + AO add the cast/brushed
  // detail. (Base_Metallic is a tiny near-uniform map; a scalar metalness
  // reproduces it without the R/A-vs-three channel-packing mismatch.)
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x96A3AD,
    metalness: 1,
    roughness: 0.2,
    normalMap: loadTex('Base_Normal.png'),
    aoMap: loadTex('Base_AO.png'),
    envMapIntensity: 1,
  });

  // --- Glass.mat → simplified glass top for mobile VR -----------------------
  // Replaced heavy physical transmission with simple opacity for a "fake 
  // refraction" look that performs significantly better on Quest 3.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xE1EEF9,
    metalness: 0,
    roughness: 0.05,
    opacity: 0.2,
    transparent: true,
    depthWrite: false,           // mirrors Unity's _ZWrite 0
    normalMap: loadTex('Glass_Normal.png'),
    normalScale: new THREE.Vector2(0.1, 0.1),
    aoMap: loadTex('Glass_AO.png'),
    envMapIntensity: 1.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
  });

  // --- Load the actual asset mesh and dress it ------------------------------
  new FBXLoader().load(
    MODEL,
    (fbx) => {
      fbx.traverse((child) => {
        if (!child.isMesh) return;
        // aoMap samples uv2 in three.js; the FBX only ships uv, so alias it.
        const geo = child.geometry;
        if (geo.attributes.uv && !geo.attributes.uv2) {
          geo.setAttribute('uv2', geo.attributes.uv);
        }
        // Assign by the prefab's mesh names: Plane001 = glass, Cube = metal.
        const isGlass = /plane|glass/i.test(child.name);
        child.material = isGlass ? glassMat : metalMat;
        child.castShadow = !isGlass; // clear glass shouldn't drop a solid shadow
        child.receiveShadow = true;
      });

      // Normalise: orient is already Y-up from the loader. Scale so the longest
      // footprint axis becomes `targetWidth`, then seat the base at local y=0
      // and centre it over x/z.
      const box = new THREE.Box3().setFromObject(fbx);
      const size = box.getSize(new THREE.Vector3());
      const s = targetWidth / Math.max(size.x, size.z);
      fbx.scale.setScalar(s);

      const scaled = new THREE.Box3().setFromObject(fbx);
      const c = scaled.getCenter(new THREE.Vector3());
      fbx.position.x -= c.x;
      fbx.position.z -= c.z;
      fbx.position.y -= scaled.min.y; // bottom rests on the group origin

      group.add(fbx);
      if (onReady) onReady(group);
    },
    undefined,
    (err) => console.error('[CoffeeTable] failed to load FBX:', err)
  );

  /**
   * Swap the glass between its full look and a cheaper VR look. Toggling the
   * shared `glassMat` affects the mesh whenever the async FBX finishes loading,
   * so this is safe to call before or after load.
   *   'full' — clearcoat + double-sided (desktop)
   *   'vr'   — no clearcoat, single-sided (drops a specular lobe + back-face
   *            overdraw to free GPU budget for the depthproj cloud)
   */
  group.setGlassQuality = (profile) => {
    const vr = profile === 'vr';
    glassMat.clearcoat = vr ? 0 : 1.0;
    glassMat.side = vr ? THREE.FrontSide : THREE.DoubleSide;
    glassMat.needsUpdate = true;
  };

  return group;
}
