/**
 * TimelineUI — wires the transport DOM (play/pause button + scrubber) to a
 * Timeline instance. Scrubbing works with mouse, touch, or pen via pointer
 * events: drag anywhere along the bar to move the playhead.
 *
 * Expects this markup in index.html:
 *   #transport  #tl-play  #tl-scrub ( #tl-fill  #tl-handle )  #tl-time
 */
export function createTimelineUI(timeline) {
  const root = document.getElementById('transport-group');
  const playBtn = document.getElementById('tl-play');
  const scrub = document.getElementById('tl-scrub');
  const fill = document.getElementById('tl-fill');
  const handle = document.getElementById('tl-handle');
  const timeLabel = document.getElementById('tl-time');

  const PLAY = '▶';
  const PAUSE = '❚❚';

  // ---- play / pause --------------------------------------------------------
  playBtn.addEventListener('click', () => timeline.toggle());

  // ---- scrub (drag) gesture ------------------------------------------------
  let scrubbing = false;
  let resumeAfter = false;

  function fractionFromEvent(e) {
    const rect = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function onDown(e) {
    scrubbing = true;
    resumeAfter = timeline.playing;
    timeline.pause(); // hold the clock while dragging
    timeline.seekFraction(fractionFromEvent(e));
    scrub.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function onMove(e) {
    if (!scrubbing) return;
    timeline.seekFraction(fractionFromEvent(e));
  }
  function onUp() {
    if (!scrubbing) return;
    scrubbing = false;
    if (resumeAfter) timeline.play();
  }

  scrub.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  // ---- per-frame refresh ---------------------------------------------------
  function fmt(t) {
    const s = Math.max(0, Math.floor(t));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function update() {
    const f = timeline.duration ? timeline.time / timeline.duration : 0;
    const pct = `${(f * 100).toFixed(2)}%`;
    fill.style.width = pct;
    handle.style.left = pct;
    playBtn.textContent = timeline.playing ? PAUSE : PLAY;
    playBtn.setAttribute('aria-label', timeline.playing ? 'Pause' : 'Play');
    timeLabel.textContent = `${fmt(timeline.time)} / ${fmt(timeline.duration)}`;
  }

  function setVisible(visible) {
    root.classList.toggle('hidden', !visible);
  }

  return { update, setVisible };
}
