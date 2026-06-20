import * as THREE from 'three';
import { createFloatingText } from './createFloatingText.js';

/**
 * TextCues — timeline-synced floating text. A small companion to the Timeline:
 * it reads the master playhead each frame and shows the cue whose
 * `[start, start + duration)` window contains the current time.
 *
 * Cues are authored in a JSON manifest (public/media/text-cues.json) so the
 * copy and its timing can be edited without touching code:
 *
 *   {
 *     "defaults": { "position": [3, 2.5, -3], "size": 0.3, "height": 0.02 },
 *     "cues": [
 *       { "text": "...", "start": 0, "duration": 29.28 },
 *       ...
 *     ]
 *   }
 *
 * Each cue's mesh is built once at load (extruding TextGeometry is the costly
 * part) and only its `visible` flag is toggled per frame — never rebuilt. Text
 * has no media element, so this lives outside Timeline's video/audio sync.
 *
 * @param {import('three').Scene} scene
 * @param {string} manifestUrl  URL of the cue manifest (served from public/)
 * @returns {Promise<{ update: (time: number, camera: THREE.Camera) => void,
 *                      dispose: () => void }>}
 */
const FALLBACK_DEFAULTS = { position: [3, 2.5, -3], size: 0.3, height: 0.02 };

export async function createTextCues(scene, manifestUrl) {
  let data;
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.warn(
      `[TextCues] No usable manifest at ${manifestUrl} — running with no text. ` +
        `Add cues in public/media/text-cues.json. (${err.message})`
    );
    data = { cues: [] };
  }

  const defaults = { ...FALLBACK_DEFAULTS, ...(data.defaults ?? {}) };

  // Build every cue's mesh up front (font load inside createFloatingText is
  // cached after the first call), starting hidden until its window is active.
  const cues = [];
  for (const cue of data.cues ?? []) {
    const pos = cue.position ?? defaults.position;
    const mesh = await createFloatingText(
      cue.text,
      scene,
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      cue.size ?? defaults.size,
      cue.height ?? defaults.height
    );
    mesh.visible = false;
    cues.push({
      start: cue.start ?? 0,
      end: (cue.start ?? 0) + (cue.duration ?? 0),
      mesh,
    });
  }

  const _camWorld = new THREE.Vector3(); // scratch; avoids per-frame allocation

  /**
   * Show the cue(s) whose window contains `time`, hide the rest, and billboard
   * the visible ones toward the camera (Y-only, so the text stays upright).
   */
  function update(time, camera) {
    camera.getWorldPosition(_camWorld);
    for (const c of cues) {
      const visible = time >= c.start && time < c.end;
      c.mesh.visible = visible;
      if (visible) {
        c.mesh.rotation.y = Math.atan2(
          _camWorld.x - c.mesh.position.x,
          _camWorld.z - c.mesh.position.z
        );
      }
    }
  }

  function dispose() {
    for (const c of cues) {
      scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
    }
    cues.length = 0;
  }

  return { update, dispose };
}
