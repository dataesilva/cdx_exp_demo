import * as THREE from 'three';

/**
 * VideoScreen — a flat-panel "display" that plays an mp4 on a video texture,
 * mounted on a simple floor stand (bezel + neck + base), like a showroom
 * monitor. Built so its screen faces +Z in local space; the caller positions
 * the group and aims it with `faceTarget` (e.g. the player's default spot).
 *
 * The screen uses an unlit, non-tone-mapped material so it reads as a glowing
 * display rather than a lit surface in the dark studio.
 *
 * For now it just autoplays on loop (muted, so browsers allow autoplay). The
 * returned handle exposes the underlying <video> plus play()/pause(), so the
 * clip can later be driven by the Timeline instead of looping on its own.
 *
 * @param {import('three').Scene} scene
 * @param {string} src  video URL (served from public/)
 * @param {{
 *   width?: number,                 // screen width in metres (height = 16:9)
 *   aspect?: number,                // width / height (defaults to 16:9)
 *   position?: THREE.Vector3,       // where the stand sits (floor at y=0)
 *   faceTarget?: THREE.Vector3,     // point the screen turns to face
 * }} [opts]
 * @returns {{ group: THREE.Group, video: HTMLVideoElement,
 *            texture: THREE.VideoTexture, play: () => void, pause: () => void,
 *            dispose: () => void }}
 */
export function createVideoScreen(scene, src, {
  width = 2.2,
  aspect = 16 / 9,
  position = new THREE.Vector3(-5, 0, 0.5),
  faceTarget = new THREE.Vector3(0, 1.6, 3),
} = {}) {
  const height = width / aspect;
  const standHeight = 0.95;            // gap from floor to bottom of the screen
  const screenCenterY = standHeight + height / 2;

  const group = new THREE.Group();
  group.name = 'VideoScreen';

  // --- Video element + texture ----------------------------------------------
  const video = document.createElement('video');
  video.src = src;
  video.loop = false;            // Timeline controls looping
  video.muted = false;           // audio plays; caller must trigger after user gesture
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  // --- Screen, bezel, stand (screen faces +Z) -------------------------------
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.5, metalness: 0.4 });

  // Display surface: unlit + non-tone-mapped so it looks like it's emitting.
  const screenMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMat);
  screen.position.set(0, screenCenterY, 0.05); // proud of the bezel front
  group.add(screen);

  // Bezel: a slim slab just behind the screen.
  const border = 0.02; // 0.06
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(width + border * 2, height + border * 2, 0.06),
    bezelMat
  );
  bezel.position.set(0, screenCenterY, 0);
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  group.add(bezel);

  // Neck: from the base up to the bezel.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.12, screenCenterY, 0.08), bezelMat);
  neck.position.set(0, screenCenterY / 2, -0.06);
  neck.castShadow = true;
  neck.receiveShadow = true;
  group.add(neck);

  // Base: a low disc on the floor.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 48), bezelMat);
  base.position.set(0, 0.025, -0.06);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // --- Place + aim ----------------------------------------------------------
  group.position.copy(position);
  // Turn about Y so the screen's +Z normal points at the target (horizontally).
  group.rotation.y = Math.atan2(faceTarget.x - position.x, faceTarget.z - position.z);

  scene.add(group);

  // --- Playback -------------------------------------------------------------
  const play = () => video.play().catch(() => {});
  const pause = () => video.pause();

  // Playback is driven by the Timeline; do not autoplay here.

  const dispose = () => {
    pause();
    video.removeAttribute('src');
    video.load();
    texture.dispose();
    screenMat.dispose();
    bezelMat.dispose();
  };

  return { group, video, texture, play, pause, dispose };
}
