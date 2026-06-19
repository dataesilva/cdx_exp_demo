import * as THREE from 'three';

/**
 * VRTimeline — an in-VR transport anchored just above the LEFT controller,
 * operated by pointing the RIGHT controller's ray and pulling the trigger.
 *
 * It's a single canvas-textured plane with three hit regions, picked by mapping
 * the right-controller ray's intersection UV to horizontal bands:
 *   - play / pause button   (left)
 *   - scrub bar             (middle)   — press or drag to seek
 *   - exit-VR button        (right)
 *
 * The flat-screen DOM transport stays for non-VR; this is its VR counterpart.
 *
 * @param {object} o
 * @param {THREE.WebGLRenderer} o.renderer  XR-enabled renderer
 * @param {import('./Timeline.js').Timeline} o.timeline
 * @param {Array} o.hands  the `hands` array from createVRControllers (grip/ray/handedness)
 */
export function createVRTimeline({ renderer, timeline, hands }) {
  // Horizontal UV bands for the three controls (u = 0 left .. 1 right).
  const PLAY = [0.0, 0.19];
  const SCRUB = [0.215, 0.78];
  const EXIT = [0.81, 1.0];

  // --- canvas texture -------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  mat.toneMapped = false;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.05), mat);
  panel.name = 'vr-timeline';

  // --- label above the panel -----------------------------------------------
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512; labelCanvas.height = 64;
  const labelCtx = labelCanvas.getContext('2d');
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, side: THREE.DoubleSide });
  labelMat.toneMapped = false;
  // Same width as the panel; height is half (0.025 m for a 512×64 canvas at the same dpi).
  const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.025), labelMat);
  // Position just above the panel: panel top edge (0.025) + gap (0.004) + half label height (0.0125).
  labelMesh.position.set(0, 0.0415, 0);
  panel.add(labelMesh); // moves with the panel automatically

  labelCtx.clearRect(0, 0, 512, 64);
  labelCtx.fillStyle = 'rgba(230, 230, 230, 0.80)';
  labelCtx.font = 'bold 26px system-ui, sans-serif';
  labelCtx.textAlign = 'center';
  labelCtx.textBaseline = 'middle';
  labelCtx.fillText('Play the AccuPath Experience', 256, 32);
  labelTex.needsUpdate = true;
  panel.visible = false;
  // Anchor pose in the left grip's local space: out the FRONT of the controller
  // (-Z is where it points), tilted up so it reads when you glance at it. Tune
  // ANCHOR_POS (z = how far in front) / ANCHOR_ROT_X (facing) here if needed.
  const ANCHOR_POS = new THREE.Vector3(0, 0.01, -0.12);
  const ANCHOR_ROT_X = -Math.PI / 4;

  // --- right-controller trigger state --------------------------------------
  for (const h of hands) {
    h.selecting = false;
    h.ray.addEventListener('selectstart', () => { h.selecting = true; });
    h.ray.addEventListener('selectend', () => { h.selecting = false; });
  }

  const raycaster = new THREE.Raycaster();
  const _o = new THREE.Vector3();
  const _d = new THREE.Vector3();
  let parentedTo = null;
  let prevSelecting = false;
  let scrubbing = false;
  let resumeAfter = false;

  const pick = (hand) => hands.find((h) => h.connected && h.handedness === hand);

  function regionOf(u) {
    if (u >= PLAY[0] && u <= PLAY[1]) return 'play';
    if (u >= SCRUB[0] && u <= SCRUB[1]) return 'scrub';
    if (u >= EXIT[0] && u <= EXIT[1]) return 'exit';
    return 'none';
  }
  const fracOf = (u) => Math.max(0, Math.min(1, (u - SCRUB[0]) / (SCRUB[1] - SCRUB[0])));

  function update() {
    if (!renderer.xr.isPresenting) { panel.visible = false; return; }
    const left = pick('left') || hands[0];
    const right = pick('right') || hands[1];
    if (!left || !right) { panel.visible = false; return; }

    // Anchor the panel to the left grip.
    if (parentedTo !== left.grip) {
      left.grip.add(panel);
      panel.position.copy(ANCHOR_POS);
      panel.rotation.set(ANCHOR_ROT_X, 0, 0);
      parentedTo = left.grip;
    }
    panel.visible = true;

    // Raycast from the right controller's aim ray.
    const m = right.ray.matrixWorld;
    _o.setFromMatrixPosition(m);
    _d.set(0, 0, -1).transformDirection(m);
    raycaster.set(_o, _d);
    const hit = raycaster.intersectObject(panel, false)[0];
    const u = hit && hit.uv ? hit.uv.x : null;
    const region = u != null ? regionOf(u) : 'none';

    const selecting = !!right.selecting;
    const pressed = selecting && !prevSelecting;   // trigger rising edge

    if (pressed) {
      if (region === 'play') timeline.toggle();
      else if (region === 'exit') renderer.xr.getSession()?.end();
      else if (region === 'scrub') {
        scrubbing = true;
        resumeAfter = timeline.playing;
        timeline.pause();
        timeline.seekFraction(fracOf(u));
      }
    } else if (scrubbing && selecting && u != null) {
      timeline.seekFraction(fracOf(u));         // drag to scrub (clamped)
    }
    if (!selecting && prevSelecting && scrubbing) {
      scrubbing = false;
      if (resumeAfter) timeline.play();
    }
    prevSelecting = selecting;

    draw(scrubbing ? 'scrub' : region);
  }

  // --- drawing --------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(hover) {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Panel background.
    ctx.fillStyle = 'rgba(20,23,28,0.86)';
    roundRect(2, 2, W - 4, H - 4, 18); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();

    const hl = (band) => { // hover highlight behind a band
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(band[0] * W + 2, 8, (band[1] - band[0]) * W - 4, H - 16, 12); ctx.fill();
    };
    if (hover === 'play') hl(PLAY);
    if (hover === 'exit') hl(EXIT);

    const cy = H / 2;

    // Play / pause icon.
    const px = (PLAY[0] + PLAY[1]) / 2 * W;
    ctx.fillStyle = '#e6e6e6';
    if (timeline.playing) {
      ctx.fillRect(px - 14, cy - 18, 9, 36);
      ctx.fillRect(px + 5, cy - 18, 9, 36);
    } else {
      ctx.beginPath();
      ctx.moveTo(px - 13, cy - 18); ctx.lineTo(px - 13, cy + 18); ctx.lineTo(px + 17, cy);
      ctx.closePath(); ctx.fill();
    }

    // Scrub track + fill + handle.
    const x0 = SCRUB[0] * W, x1 = SCRUB[1] * W;
    const frac = timeline.duration ? timeline.time / timeline.duration : 0;
    const fx = x0 + frac * (x1 - x0);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(x0, cy - 5, x1 - x0, 10, 5); ctx.fill();
    ctx.fillStyle = (hover === 'scrub') ? '#7db4ff' : '#4a90d9';
    roundRect(x0, cy - 5, Math.max(0, fx - x0), 10, 5); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = '#fff'; ctx.arc(fx, cy, 11, 0, Math.PI * 2); ctx.fill();

    // Time label under the bar.
    ctx.fillStyle = '#c8ced6';
    ctx.font = '20px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${fmt(timeline.time)} / ${fmt(timeline.duration)}`, (x0 + x1) / 2, H - 12);

    // Exit button: circle with an ✕.
    const ex = (EXIT[0] + EXIT[1]) / 2 * W;
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,120,120,0.9)'; ctx.lineWidth = 4;
    ctx.arc(ex, cy, 20, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - 9, cy - 9); ctx.lineTo(ex + 9, cy + 9);
    ctx.moveTo(ex + 9, cy - 9); ctx.lineTo(ex - 9, cy + 9);
    ctx.stroke();

    tex.needsUpdate = true;
  }

  function fmt(t) {
    const s = Math.max(0, Math.floor(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return { update, panel };
}
