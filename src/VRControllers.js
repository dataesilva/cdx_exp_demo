import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

/**
 * Meta Quest 3 controller tracking, models, and "grab" locomotion.
 *
 * Adds two WebXR controllers to the player rig:
 *   - the **grip space** carries the photo-real controller model (loaded on demand
 *     from the WebXR Input Profiles asset CDN — the Quest 3 matches the
 *     `meta-quest-touch-plus` profile).
 *   - the **target-ray space** carries a thin aiming ray so the tracked pose is
 *     visible immediately, even before (or if) the CDN model loads.
 *
 * Both spaces are children of the rig, so their tracked poses are expressed in the
 * same play-space frame as the headset camera (which is also a child of the rig).
 *
 * ## Locomotion — freeform grab ("pull the world")
 * Hold a **grip button** (the squeeze action, middle-finger trigger) to grab the
 * world at your hand and drag yourself through it:
 *   - **One grip held** — full 6-DOF translation: move your hand and the rig
 *     follows the opposite way, so the grabbed point stays under your hand. Pull
 *     hand-over-hand to travel any distance; you can also climb up/down.
 *   - **Two grips held** — translate *and* yaw-turn: the world rotates about the
 *     point between your hands as you swing them, so you can spin to face anywhere
 *     without physically turning. (Scale is intentionally left out — scaling the
 *     rig would distort the stereo eye separation in VR.)
 *
 * The rig's vertical position is clamped to the floor (y >= 0) so you can't sink
 * below the room.
 *
 * @param {object} opts
 * @param {THREE.WebGLRenderer} opts.renderer  XR-enabled renderer
 * @param {THREE.Group}         opts.rig       player rig (holds the XR camera)
 */
export function createVRControllers({ renderer, rig }) {
  const FLOOR_Y = 0;      // rig floor; freeform climbing can't go below this
  const GRAB_SPEED = 1.5; // multiplier on grab-locomotion translation

  const modelFactory = new XRControllerModelFactory();

  // A short aiming ray, pointing down -Z out of the controller's target-ray space.
  function makeRayLine() {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x88bbff,
      transparent: true,
      opacity: 0.6,
    });
    const line = new THREE.Line(geom, mat);
    line.name = 'controller-ray';
    line.scale.z = 1.2; // metres
    return line;
  }

  // Per-controller state. `grip`/`ray` are the two XR spaces; `gripping` reflects
  // the squeeze (grip) button; `prevWorld` is last frame's world position, used to
  // integrate the grab motion.
  const hands = [];
  for (let i = 0; i < 2; i++) {
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(modelFactory.createControllerModel(grip));
    rig.add(grip);

    const ray = renderer.xr.getController(i);
    ray.add(makeRayLine());
    rig.add(ray);

    const hand = {
      grip,
      ray,
      connected: false,
      handedness: 'none',
      gripping: false,
      prevWorld: new THREE.Vector3(),
    };

    // squeeze* = the grip button. three forwards these events to every space of
    // the controller, so listening on the grip is sufficient.
    grip.addEventListener('squeezestart', () => { hand.gripping = true; });
    grip.addEventListener('squeezeend', () => { hand.gripping = false; });
    grip.addEventListener('connected', (e) => {
      hand.connected = true;
      hand.handedness = e.data?.handedness ?? 'none';
    });
    grip.addEventListener('disconnected', () => {
      hand.connected = false;
      hand.gripping = false;
    });

    hands.push(hand);
  }

  // Scratch objects (avoid per-frame allocation in the render loop).
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _midPrev = new THREE.Vector3();
  const _midCur = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);

  // How many grips were active last frame — when the active set changes (grab or
  // release), we re-baseline and skip a frame so the rig doesn't jump.
  let prevActiveCount = 0;

  // Horizontal (XZ) bearing of the vector a->b, for two-handed yaw.
  function bearing(a, b) {
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  function update() {
    if (!renderer.xr.isPresenting) return;

    const active = hands.filter((h) => h.gripping && h.connected);

    // Grab/release transition: just record fresh baselines this frame.
    if (active.length !== prevActiveCount) {
      for (const h of active) h.grip.getWorldPosition(h.prevWorld);
      prevActiveCount = active.length;
      return;
    }

    if (active.length === 1) {
      // ---- single-hand: 6-DOF drag ------------------------------------------
      // Move the rig so the grabbed world point stays under the hand: rig shifts
      // by (previous hand position - current hand position).
      const h = active[0];
      h.grip.getWorldPosition(_a); // current world position
      _t.copy(h.prevWorld).sub(_a).multiplyScalar(GRAB_SPEED);
      rig.position.add(_t);
    } else if (active.length === 2) {
      // ---- two-hand: drag + yaw turn ----------------------------------------
      const [h0, h1] = active;
      h0.grip.getWorldPosition(_a);
      h1.grip.getWorldPosition(_b);
      _midCur.copy(_a).add(_b).multiplyScalar(0.5);
      _midPrev.copy(h0.prevWorld).add(h1.prevWorld).multiplyScalar(0.5);

      // Yaw: rotate the rig (about vertical) by the change in the hands' bearing,
      // pivoting about the current midpoint so the grab feels anchored.
      const dYaw = bearing(h0.prevWorld, h1.prevWorld) - bearing(_a, _b);
      _q.setFromAxisAngle(_up, dYaw);
      rig.quaternion.premultiply(_q);
      rig.position.sub(_midCur).applyQuaternion(_q).add(_midCur);

      // Translate so the (rotation-invariant) midpoint returns to where it was.
      rig.position.add(_t.copy(_midPrev).sub(_midCur).multiplyScalar(GRAB_SPEED));
    }

    // Keep the player on or above the floor.
    if (rig.position.y < FLOOR_Y) rig.position.y = FLOOR_Y;

    // Re-baseline every active hand against the rig's new transform so the next
    // frame measures only fresh physical motion. getWorldPosition() recomputes
    // from the updated rig, so the grabbed points stay "held".
    for (const h of active) h.grip.getWorldPosition(h.prevWorld);
    prevActiveCount = active.length;
  }

  return { update, hands };
}
