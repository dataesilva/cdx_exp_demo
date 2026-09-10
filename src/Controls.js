import * as THREE from 'three';

/**
 * Flat-screen (non-VR) first-person controls for desktop + mobile.
 *
 *   Keyboard : WASD / arrow keys to move, Shift to sprint.
 *   Mouse    : click-drag to look.
 *   Touch    : drag on the LEFT half = movement joystick; drag elsewhere = look.
 *
 * Operates on a "player rig" (a THREE.Group) that holds the camera:
 *   - yaw   is applied to the rig (Y axis)
 *   - pitch is applied to the camera (X axis)
 *   - movement translates the rig on the XZ plane, relative to yaw
 *
 * These controls should be DISABLED while an immersive XR session is active —
 * the headset owns the camera pose there. Use setEnabled(false) on sessionstart.
 *
 * @param {object}   opts
 * @param {THREE.Group}   opts.rig         group containing the camera
 * @param {THREE.Camera}  opts.camera      the camera (child of rig)
 * @param {HTMLElement}   opts.domElement  element that receives pointer input (the canvas)
 * @param {() => void}   [opts.onFirstMove] called once the first time the player moves
 */
export function createFlatControls({ rig, camera, domElement, onFirstMove }) {
  const SPEED = 2.2; // metres / second (walking pace)
  const SPRINT = 2.0; // multiplier while Shift held
  const LOOK_SENS = 0.0025; // radians per pixel dragged
  const PITCH_LIMIT = THREE.MathUtils.degToRad(85);
  const JOY_RADIUS = 50; // px the touch joystick knob can travel

  const keys = { f: false, b: false, l: false, r: false, sprint: false };
  const joyInput = new THREE.Vector2(0, 0); // x = strafe, y = forward (touch)
  let yaw = rig.rotation.y;
  let pitch = camera.rotation.x;
  let enabled = true;
  let moved = false;

  // ---------------------------------------------------------------- keyboard
  function onKey(down) {
    return (e) => {
      if (!enabled) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': keys.f = down; break;
        case 'KeyS': case 'ArrowDown': keys.b = down; break;
        case 'KeyA': case 'ArrowLeft': keys.l = down; break;
        case 'KeyD': case 'ArrowRight': keys.r = down; break;
        case 'ShiftLeft': case 'ShiftRight': keys.sprint = down; break;
        default: return;
      }
      e.preventDefault(); // stop arrows/space scrolling the page
    };
  }
  const onKeyDown = onKey(true);
  const onKeyUp = onKey(false);

  // ----------------------------------------------- pointer: look + joystick
  // Virtual joystick (touch only). pointer-events:none so it never eats input.
  const joy = document.createElement('div');
  joy.className = 'joystick';
  joy.style.display = 'none';
  const knob = document.createElement('div');
  knob.className = 'joystick-knob';
  joy.appendChild(knob);
  document.body.appendChild(joy);

  let lookId = null, lookX = 0, lookY = 0; // pointer driving the look
  let moveId = null, moveOX = 0, moveOY = 0; // pointer driving the joystick

  function onPointerDown(e) {
    if (!enabled) return;
    const isTouch = e.pointerType === 'touch';
    if (isTouch && moveId === null && e.clientX < window.innerWidth / 2) {
      // left half of a touchscreen -> movement joystick anchored here
      moveId = e.pointerId;
      moveOX = e.clientX;
      moveOY = e.clientY;
      joy.style.left = `${e.clientX}px`;
      joy.style.top = `${e.clientY}px`;
      joy.style.display = 'block';
      knob.style.transform = 'translate(-50%, -50%)';
    } else if (lookId === null) {
      // anything else (mouse drag, or right-half touch) -> look
      lookId = e.pointerId;
      lookX = e.clientX;
      lookY = e.clientY;
      domElement.style.cursor = 'grabbing';
    }
  }

  function onPointerMove(e) {
    if (!enabled) return;
    if (e.pointerId === moveId) {
      const dx = e.clientX - moveOX;
      const dy = e.clientY - moveOY;
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(len, JOY_RADIUS);
      const nx = dx / len;
      const ny = dy / len;
      knob.style.transform =
        `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`;
      joyInput.x = nx * (clamped / JOY_RADIUS); // strafe
      joyInput.y = -ny * (clamped / JOY_RADIUS); // drag up = forward
    } else if (e.pointerId === lookId) {
      yaw -= (e.clientX - lookX) * LOOK_SENS;
      pitch -= (e.clientY - lookY) * LOOK_SENS;
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
      lookX = e.clientX;
      lookY = e.clientY;
    }
  }

  function onPointerUp(e) {
    if (e.pointerId === moveId) {
      moveId = null;
      joyInput.set(0, 0);
      joy.style.display = 'none';
    }
    if (e.pointerId === lookId) {
      lookId = null;
      domElement.style.cursor = 'grab';
    }
  }

  // pointerdown on the canvas only (so taps on UI panels don't start a look);
  // move/up on window so a drag keeps tracking outside the canvas bounds.
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  domElement.style.cursor = 'grab';
  domElement.style.touchAction = 'none'; // disable browser pan/zoom gestures

  // -------------------------------------------------------------- per frame
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function update(dt) {
    if (!enabled) return;

    rig.rotation.y = yaw;
    camera.rotation.x = pitch;

    let ix = joyInput.x + (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    let iz = joyInput.y + (keys.f ? 1 : 0) - (keys.b ? 1 : 0);
    if (ix === 0 && iz === 0) return;

    if (!moved) {
      moved = true;
      onFirstMove?.();
    }

    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; } // no faster on the diagonal

    const step = SPEED * (keys.sprint ? SPRINT : 1) * dt;
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)); // yaw-relative, on XZ plane
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    rig.position.addScaledVector(forward, iz * step);
    rig.position.addScaledVector(right, ix * step);
  }

  function setEnabled(value) {
    enabled = value;
    if (!value) {
      keys.f = keys.b = keys.l = keys.r = keys.sprint = false;
      joyInput.set(0, 0);
      joy.style.display = 'none';
      lookId = moveId = null;
    }
  }

  function dispose() {
    domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    joy.remove();
  }

  return { update, setEnabled, dispose };
}
