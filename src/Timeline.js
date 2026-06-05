/**
 * Timeline — a master clock that synchronises Depthkit volumetric video clips
 * and audio tracks for playback.
 *
 * It loads a manifest (public/media/timeline.json) describing tracks and the
 * clips placed on them (each with a `start` time in seconds). On every frame
 * the timeline advances its playhead and keeps each clip's media element seeked
 * to `playhead - clip.start`, so video and audio stay in sync. Clips are added
 * to / removed from the scene as the playhead enters / leaves their window.
 *
 * Nothing plays until media files exist and are listed in the manifest — an
 * empty manifest just runs an empty (scrubbable) timeline.
 */

const DRIFT_TOLERANCE = 0.18; // seconds of slip before we hard-correct media

export class Timeline {
  /** @param {{ scene: import('three').Scene, loop?: boolean }} opts */
  constructor({ scene, loop = true }) {
    this.scene = scene;
    this.loop = loop;
    /** @type {Array<Clip>} */
    this.clips = [];
    this.duration = 0; // seconds; from manifest or derived from clips
    this.time = 0; // playhead, seconds
    this.playing = false;
    this.ready = false;
  }

  /**
   * Load a timeline manifest. Falls back to an empty 60s timeline if the file
   * is missing or invalid, so the transport UI still works during development.
   */
  async load(manifestUrl) {
    let data;
    try {
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      console.warn(
        `[Timeline] No usable manifest at ${manifestUrl} — running an empty timeline. ` +
          `Add clips in public/media/timeline.json. (${err.message})`
      );
      data = { duration: 60, loop: true, tracks: [] };
    }

    this.loop = data.loop ?? this.loop;
    this.duration = data.duration ?? 0;

    for (const track of data.tracks ?? []) {
      for (const clip of track.clips ?? []) {
        await this._addClip(track.type, clip);
      }
    }

    if (!this.duration) {
      this.duration =
        this.clips.reduce((m, c) => Math.max(m, c.start + (c.duration || 0)), 0) || 60;
    }

    this.ready = true;
    this._syncClips();
    return this;
  }

  async _addClip(type, clip) {
    /** @typedef {{ type:string, src:string, start:number, duration:number,
     *   name:string, media:HTMLMediaElement|null, player:any, active:boolean }} Clip */
    const entry = {
      type,
      src: clip.src,
      start: clip.start ?? 0,
      duration: clip.duration ?? 0,
      name: clip.name ?? clip.src,
      media: null,
      player: null,
      active: false,
    };

    if (type === 'video') {
      // Lazy import so an empty timeline never pulls Depthkit into startup.
      const { createDepthkitPlayer } = await import('./DepthkitScene.js');
      entry.player = createDepthkitPlayer(this.scene, clip.src, {
        autoplay: false,
        loop: false,
        autoAdd: false,
      });
      entry.media = entry.player.video;
    } else if (type === 'audio') {
      const audio = document.createElement('audio');
      audio.src = clip.src;
      audio.preload = 'auto';
      entry.media = audio;
    } else {
      console.warn(`[Timeline] Unknown track type "${type}" — skipping ${entry.src}`);
      return;
    }

    // If the manifest didn't specify a duration, learn it from the media so the
    // clip's active window and the overall timeline length are correct.
    if (entry.media && !entry.duration) {
      entry.media.addEventListener('loadedmetadata', () => {
        entry.duration = entry.media.duration || 0;
        this.duration = Math.max(this.duration, entry.start + entry.duration);
      });
    }

    this.clips.push(entry);
  }

  // ---------------------------------------------------------------- transport
  play() {
    if (this.playing) return;
    this.playing = true;
    for (const c of this.clips) {
      if (c.active) c.media?.play?.().catch(() => {});
    }
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    for (const c of this.clips) c.media?.pause?.();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  /** Jump the playhead to an absolute time (seconds). */
  seek(t) {
    this.time = Math.max(0, Math.min(t, this.duration));
    this._syncClips(true);
  }

  /** Jump to a fraction (0..1) of the timeline — used by the scrubber. */
  seekFraction(f) {
    this.seek(f * this.duration);
  }

  // -------------------------------------------------------------- per frame
  update(dt) {
    if (this.playing) {
      this.time += dt;
      if (this.time >= this.duration) {
        if (this.loop) this.time %= this.duration || 1;
        else {
          this.time = this.duration;
          this.pause();
        }
      }
    }
    this._syncClips();
    for (const c of this.clips) {
      if (c.active && c.player) c.player.update(); // advance Depthkit playback
    }
  }

  /**
   * Add/remove clips as the playhead crosses their boundaries, and keep active
   * media seeked to the playhead. `force` re-seeks active media even without
   * drift (used after an explicit seek/scrub).
   */
  _syncClips(force = false) {
    for (const c of this.clips) {
      const local = this.time - c.start;
      const within = local >= 0 && (c.duration ? local < c.duration : true);

      if (within && !c.active) {
        c.active = true;
        c.player?.add();
        this._seekMedia(c, local);
        if (this.playing) c.media?.play?.().catch(() => {});
      } else if (!within && c.active) {
        c.active = false;
        c.media?.pause?.();
        c.player?.remove();
      } else if (within && c.active && c.media) {
        if (force || Math.abs(c.media.currentTime - local) > DRIFT_TOLERANCE) {
          this._seekMedia(c, local);
        }
      }
    }
  }

  _seekMedia(c, local) {
    if (!c.media) return;
    try {
      c.media.currentTime = Math.max(0, local);
    } catch {
      /* media not ready to seek yet; the next frame will retry */
    }
  }
}
