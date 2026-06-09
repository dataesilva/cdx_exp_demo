import * as THREE from 'three';

/**
 * Posters — framed image panels mounted flat on a wall, like gallery prints.
 *
 * Images live in public/textures/posters/ (copied from the Unity project's
 * "Text Mat" folder). Each panel is sized to its image's aspect ratio so it
 * isn't stretched, and gets a thin dark frame. The print uses an emissive map
 * at low intensity so it stays readable in the dark showroom while still
 * catching the room lighting.
 *
 * Built facing +Z and centred on the group origin, so the caller can drop the
 * group onto a wall and rotate it to face into the room.
 *
 * @param {{ height?: number, gap?: number }} [opts] panel height (m) + gap (m)
 * @returns {THREE.Group}
 */
const DIR = './textures/posters/';

// file + aspect (width / height) from the source images.
const POSTERS = [
  { file: 'AccuPath.png', aspect: 1920 / 1080 },
  { file: 'poster2.jpg', aspect: 1 },
];

export function createPosters({ height = 1.8, gap = 0.6 } = {}) {
  const group = new THREE.Group();
  group.name = 'WallPosters';

  const texLoader = new THREE.TextureLoader();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.6, metalness: 0.1 });

  // Lay panels left→right, centred as a row.
  const widths = POSTERS.map((p) => height * p.aspect);
  const rowWidth = widths.reduce((a, w) => a + w, 0) + gap * (POSTERS.length - 1);
  let cursor = -rowWidth / 2;

  POSTERS.forEach((p, i) => {
    const w = widths[i];
    const cx = cursor + w / 2;
    cursor += w + gap;

    const map = texLoader.load(DIR + p.file);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;

    const panel = new THREE.Group();
    panel.position.set(cx, 0, 0);

    // Print: lit by the room, plus a gentle self-emission for legibility.
    const printMat = new THREE.MeshStandardMaterial({
      map,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: 0.3,
      roughness: 0.85,
      metalness: 0,
    });
    const print = new THREE.Mesh(new THREE.PlaneGeometry(w, height), printMat);
    print.position.z = 0.05; // sit proud of the frame
    panel.add(print);

    // Frame: a slightly larger slab behind the print.
    const border = 0.06;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + border * 2, height + border * 2, 0.04),
      frameMat
    );
    frame.castShadow = true;
    frame.receiveShadow = false; // true
    panel.add(frame);

    group.add(panel);
  });

  return group;
}
