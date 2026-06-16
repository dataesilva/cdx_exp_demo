/**
 * BoundsTuner — a small dev panel to trim the depthproj point cloud's
 * world-AABB bounds cull live, so floor/ground artifacts below the subject
 * can be cropped before baking the value back into each clip's
 * `depthproj.json` `bounds.max`/`bounds.min`.
 *
 * The trim is applied uniformly to every depthproj clip on the timeline
 * (camera-frame metres, before the upright placement flip): `maxY` shrinks
 * `bounds.max.y`, which crops points near the feet/floor; `minY` grows
 * `bounds.min.y`, which crops points near the head/ceiling.
 *
 * @param {import('./Timeline.js').Timeline} timeline
 */
export function createBoundsTuner(timeline) {
  let trim = { maxY: 0, minY: 0 };

  const panel = document.createElement('div');
  panel.id = 'bounds-tuner';
  Object.assign(panel.style, {
    position: 'fixed', top: '16px', left: '16px', zIndex: 10,
    width: '230px', padding: '10px 12px',
    background: 'rgba(20,23,28,0.82)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px', backdropFilter: 'blur(6px)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.45)', color: '#e6e6e6',
    font: '12px system-ui, sans-serif',
  });
  panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Bounds trim (m)</div>';

  const rows = {};
  for (const key of ['maxY', 'minY']) {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0' });
    const name = document.createElement('span');
    name.textContent = key === 'maxY' ? 'Below' : 'Above';
    name.style.width = '44px';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01'; slider.value = '0';
    slider.style.flex = '1 1 auto';
    const val = document.createElement('span');
    Object.assign(val.style, { width: '38px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' });
    val.textContent = '0.00';
    slider.addEventListener('input', () => { setTrim(key, +slider.value); });
    row.append(name, slider, val);
    panel.appendChild(row);
    rows[key] = { slider, val };
  }

  const readout = document.createElement('textarea');
  Object.assign(readout.style, {
    width: '100%', height: '54px', marginTop: '6px', boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.35)', color: '#c8ced6', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '6px', font: '11px ui-monospace, Menlo, monospace', resize: 'none',
  });
  readout.readOnly = true;
  panel.appendChild(readout);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy trim';
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

  function depthProjPlayers() {
    return (timeline.clips || [])
      .map((c) => c.player)
      .filter((p) => p && p.isDepthProj && typeof p.setBoundsTrim === 'function');
  }

  function applyAll() {
    for (const p of depthProjPlayers()) p.setBoundsTrim(trim);
  }

  function refreshReadout() {
    readout.value = JSON.stringify(trim, null, 2);
  }

  function setTrim(key, v) {
    trim[key] = v;
    rows[key].val.textContent = v.toFixed(2);
    refreshReadout();
    applyAll();
  }

  refreshReadout();

  return {
    /** Re-apply current trim (call after the timeline finishes loading clips). */
    applyAll,
    setVisible(v) { panel.style.display = v ? '' : 'none'; },
  };
}
