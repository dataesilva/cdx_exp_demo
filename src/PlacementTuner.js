/**
 * PlacementTuner — a small dev panel to fine-tune the depthproj point cloud's
 * `rotationEuler` (degrees) live, then copy the values into
 * `public/media/video/_placement.json`.
 *
 * The browser can't write the JSON file, so the workflow is: drag the X/Y/Z
 * sliders until the model sits right, hit "Copy JSON", and paste into
 * `_placement.json`. Changes apply to every depthproj clip on the timeline at
 * once (the rig is fixed, so one rotation serves them all).
 *
 * @param {import('./Timeline.js').Timeline} timeline
 * @param {string} [placementUrl]
 */
export function createPlacementTuner(timeline, placementUrl = './media/video/_placement.json') {
  let placement = { rotationEuler: [0, 0, 0], position: [0, 0, 0], scale: 1 };

  // --- panel DOM ------------------------------------------------------------
  const panel = document.createElement('div');
  panel.id = 'placement-tuner';
  Object.assign(panel.style, {
    position: 'fixed', top: '16px', left: '16px', zIndex: 10,
    width: '230px', padding: '10px 12px',
    background: 'rgba(20,23,28,0.82)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px', backdropFilter: 'blur(6px)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.45)', color: '#e6e6e6',
    font: '12px system-ui, sans-serif',
  });
  panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Model rotation (°)</div>';

  const axes = ['x', 'y', 'z'];
  const sliders = {};
  const valLabels = {};
  for (const ax of axes) {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' });
    const name = document.createElement('span');
    name.textContent = ax.toUpperCase();
    name.style.width = '12px';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '-180'; slider.max = '180'; slider.step = '1';
    slider.style.flex = '1 1 auto';
    const val = document.createElement('span');
    Object.assign(val.style, { width: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' });
    slider.addEventListener('input', () => { setAxis(ax, +slider.value); });
    row.append(name, slider, val);
    panel.appendChild(row);
    sliders[ax] = slider; valLabels[ax] = val;
  }

  const readout = document.createElement('textarea');
  Object.assign(readout.style, {
    width: '100%', height: '78px', marginTop: '6px', boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.35)', color: '#c8ced6', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', font: '11px ui-monospace, Menlo, monospace', resize: 'none',
  });
  readout.readOnly = true;
  panel.appendChild(readout);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy JSON';
  Object.assign(copyBtn.style, {
    width: '100%', marginTop: '6px', padding: '6px', cursor: 'pointer',
    background: 'rgba(255,255,255,0.08)', color: '#e6e6e6',
    border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', font: '12px system-ui',
  });
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(readout.value).then(() => {
      const t = copyBtn.textContent; copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = t; }, 1200);
    });
  });
  panel.appendChild(copyBtn);
  document.body.appendChild(panel);

  // --- behaviour ------------------------------------------------------------
  function depthProjPlayers() {
    return (timeline.clips || [])
      .map((c) => c.player)
      .filter((p) => p && p.isDepthProj && typeof p.setRotationEuler === 'function');
  }

  function applyAll() {
    const [x, y, z] = placement.rotationEuler;
    for (const p of depthProjPlayers()) p.setRotationEuler(x, y, z);
  }

  function refreshUI() {
    for (let i = 0; i < axes.length; i++) {
      const ax = axes[i];
      sliders[ax].value = String(placement.rotationEuler[i]);
      valLabels[ax].textContent = `${placement.rotationEuler[i]}`;
    }
    // Show the full placement object so it can be pasted back verbatim.
    readout.value = JSON.stringify(
      {
        rotationEuler: placement.rotationEuler,
        position: placement.position,
        scale: placement.scale,
      },
      null,
      2,
    );
  }

  function setAxis(ax, deg) {
    placement.rotationEuler[axes.indexOf(ax)] = deg;
    valLabels[ax].textContent = `${deg}`;
    readout.value = JSON.stringify(
      { rotationEuler: placement.rotationEuler, position: placement.position, scale: placement.scale },
      null, 2,
    );
    applyAll();
  }

  // Seed from the on-disk placement so the sliders start where the model is.
  fetch(placementUrl, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((p) => {
      if (p) {
        placement = {
          rotationEuler: (p.rotationEuler || [0, 0, 0]).slice(0, 3),
          position: p.position || [0, 0, 0],
          scale: p.scale ?? 1,
        };
      }
      refreshUI();
      applyAll();
    })
    .catch(() => refreshUI());

  return {
    /** Re-apply current rotation (call after the timeline finishes loading clips). */
    applyAll,
    setVisible(v) { panel.style.display = v ? '' : 'none'; },
  };
}
