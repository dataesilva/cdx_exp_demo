import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createFlatControls } from './Controls.js';
import { createVRControllers } from './VRControllers.js';
import { createVRTimeline } from './VRTimeline.js';
import { createShowroom } from './Showroom.js';
import { createCoffeeTable } from './CoffeeTable.js';
import { createPosters } from './Posters.js';
import { createVideoScreen } from './VideoScreen.js';
import { Timeline } from './Timeline.js';
import { createTimelineUI } from './TimelineUI.js';
import { createBoundsTuner } from './BoundsTuner.js';
import { createTextCues } from './TextCues.js';
// --- New import for Draco model ---
import { createDracoModel } from './DracoModel.js';

const container = document.getElementById('app');

// --- Renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Filmic tone mapping for a more "rendered" (HDRP-like) response.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
// Soft real-time shadows (one shadow-casting key light lives in the showroom).
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true; // enable WebXR
// Trim per-eye pixel count to give the Quest GPU fill headroom (stereo is ~2x
// the work of the flat-screen view). Must be set before the XR session starts.
renderer.xr.setFramebufferScaleFactor(0.9);
// Fixed Foveated Rendering: Three.js defaults to 1.0 (max), which renders the
// outer band of each eye at low resolution and leaves a faint, flickering
// rectangle at the edge of the lens. Drop it so the periphery stays sharp.
// (0 = full-resolution periphery; raise toward 0.2–0.3 if VR fill rate suffers.)
renderer.xr.setFoveation(0);
container.appendChild(renderer.domElement);

// "ENTER VR" button — appears once a Quest/WebXR device is detected.
const vrButton = VRButton.createButton(renderer);
vrButton.id = 'xr-button';
document.body.appendChild(vrButton);

// --- Scene ----------------------------------------------------------------
// Background + fog are configured by the Showroom to match its palette.
const scene = new THREE.Scene();

// Image-based lighting: a soft neutral environment gives the gray PBR surfaces
// subtle reflections and even ambient fill, much like HDRP's baked studio look.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

// --- Camera + player rig --------------------------------------------------
// The camera lives inside a "rig" group. Flat-screen controls move/rotate the
// rig; in VR the rig is the play-space origin and the headset drives the camera.
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.05,
  100
);
const FLAT_EYE_HEIGHT = 1.6; // standing eye height for non-VR viewing
camera.position.set(0, FLAT_EYE_HEIGHT, 0); // (XR resets this to floor-relative)

const rig = new THREE.Group();
rig.position.set(0, 0, 3); // stepped back from the origin
rig.add(camera);
scene.add(rig);

// --- Showroom -------------------------------------------------------------
// Enclosed studio room: dark, softly-textured walls, a dark-wood centre stage,
// soft even lighting. Procedural textures (no downloads) keep loading instant;
// detail is dialed back automatically if the framerate drops (see render loop).
const showroom = createShowroom(scene, { quality: 'high' });

// Centre-stage prop: a glass-and-metal modern coffee table, re-created from
// Forge Creative's free "Modern Furniture Pieces Pack" (see CoffeeTable.js for
// the source URL + attribution). Sits on top of the centre stage platform,
// whose top surface is at y = 0.12.
const coffeeTable = createCoffeeTable();
coffeeTable.position.y = 0.12;
scene.add(coffeeTable);

// Load and add the Draco bunny model above the coffee table.
// The coffee table's base is at y = 0.12. We'll place the bunny model
// with its own base at y = 0.7 to ensure it sits above the table.
// (async () => {
//   try {
//     const dracoBunny = await createDracoModel();
//     dracoBunny.position.set(0, 0.7, 0); // Position above the coffee table
//     scene.add(dracoBunny);
//     console.log('Draco bunny loaded and added to scene.');
//   } catch (error) {
//     console.error('Failed to load Draco bunny model:', error);
//   }
// })();

// Timeline-synced floating text. Cues (text + start + duration) are authored in
// public/media/text-cues.json; createTextCues builds each cue's mesh once and
// the render loop shows whichever cue's window contains the playhead, billboarding
// it toward the player (Y-only so the text stays upright). Loads async; the
// render loop no-ops until it resolves.
let textCues = null;
createTextCues(scene, './media/text-cues.json').then((tc) => {
  textCues = tc;
});

// Wall posters (images from the Unity project's "Text Mat" folder), mounted on
// the RIGHT wall (the +X wall — the player enters at the +Z side facing -Z, so
// +X is their right). The panels are built facing +Z, so we rotate the group
// -90° about Y to face -X into the room. Held just off the wall surface to
// avoid z-fighting.
const posters = createPosters();
posters.position.set((showroom.ROOM_SIZE / 2) - 0.06, 2.3, 0);
posters.rotation.y = -Math.PI / 2;
scene.add(posters);

// Video display to the LEFT of the stage (player enters at ~[0,1.6,3] facing
// -Z, so -X is their left). Driven by the Timeline — play/pause/seek and audio
// are in sync with all other tracks via timeline.registerMedia() below.
// Served from external object storage in production (VITE_SHOWREEL_URL, set at
// build time); falls back to the local copy under public/ for offline dev.
const SHOWREEL_URL =
  import.meta.env.VITE_SHOWREEL_URL || './other-media/full-cut_6-18-26.mp4';

const videoScreen = createVideoScreen(scene, SHOWREEL_URL, {
  width: 5.5,
  position: new THREE.Vector3(-4, 0, -2),
  faceTarget: new THREE.Vector3(0, FLAT_EYE_HEIGHT, 3),
});

// --- Timeline (syncs Depthkit video clips + audio tracks) -----------------
// Content is described in public/media/timeline.json; see public/media/README.md
// for the schema and the file naming convention. With no clips listed yet this
// runs an empty, scrubbable timeline so the transport works during development.
const timeline = new Timeline({ scene });
// Register the video screen so TimelineUI controls its play/pause/seek and
// the audio stays in sync with the other tracks.
timeline.registerMedia(videoScreen.video, { start: 0 });
const timelineUI = createTimelineUI(timeline);
// Temporary dev panel to trim the depthproj bounds cull (crops floor/ground
// artifacts below the subject) -> bake the value into each clip's
// depthproj.json bounds.max/min once it looks right. Remove when done tuning.
const boundsTuner = createBoundsTuner(timeline);
timeline.load('./media/timeline.json').then(() => boundsTuner.applyAll());

// Hide standard UI elements initially
timelineUI.setVisible(false);
boundsTuner.setVisible(false);

// --- Flat-screen controls + instructions window ---------------------------
const instructions = document.getElementById('instructions');
const helpButton = document.getElementById('help-button');
const exitButton = document.getElementById('exit-button');
function hideInstructions() {
  instructions.classList.add('hidden');
}
function showInstructions() {
  instructions.classList.remove('hidden');
}
document
  .getElementById('instructions-close')
  .addEventListener('click', hideInstructions);
helpButton.addEventListener('click', showInstructions);

const controls = createFlatControls({
  rig,
  camera,
  domElement: renderer.domElement,
  onFirstMove: hideInstructions, // fade the panel away once you start moving
});

// VR controllers: tracked Quest 3 controller models + freeform "grab" locomotion
// (hold a grip button to pull yourself through the world). Children of the rig,
// so they share the headset's play-space frame. No-op until an XR session starts.
const vrControllers = createVRControllers({ renderer, rig });

// In-VR transport: a panel above the LEFT controller, operated by pointing the
// RIGHT controller and pulling the trigger (play/pause, scrub, exit VR).
const vrTimeline = createVRTimeline({ renderer, timeline, hands: vrControllers.hands });

// In VR the headset owns the camera pose, so disable flat controls and hide
// the screen overlay for the duration of the session.
renderer.xr.addEventListener('sessionstart', () => {
  controls.setEnabled(false);
  camera.position.y = 0; // floor-relative reference space provides height
  camera.rotation.set(0, 0, 0);
  instructions.classList.add('hidden');
  helpButton.classList.add('hidden');
  exitButton.classList.add('hidden');
  timelineUI.setVisible(false); // DOM overlay isn't visible in the headset
  // Stereo VR is far heavier, so free GPU budget from the *room* (not the
  // subject): lighter shadows + simpler glass. The cloud stays at full density
  // (and always visible — never hidden, which would strobe/flicker); the
  // adaptive loop only thins it as a last resort.
  shadowTier = 1; // 'low' baseline for VR
  applyShadowTier();
  coffeeTable.setGlassQuality('vr');
  depthProjStep = 1;
  applyDepthProjStep(depthProjStep);
  lowWindows = 0;
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.y = FLAT_EYE_HEIGHT;
  controls.setEnabled(true);
  // Restore the full-quality flat-screen look.
  shadowTier = 0; // 'high'
  applyShadowTier();
  coffeeTable.setGlassQuality('full');
  depthProjStep = 1;
  applyDepthProjStep(depthProjStep);
  lowWindows = 0;
  exitExperience();
});

// --- Welcome Screen Logic --------------------------------------------------
// Toggled off during development; see WELCOME_SCREEN_TOGGLE.md to re-enable.
const SHOW_WELCOME_SCREEN = true;

const startBtn = document.getElementById('start-btn');
const welcomeScreen = document.getElementById('welcome-screen');

function enterExperience() {
  welcomeScreen.classList.add('hidden');
  document.body.classList.add('started');
  helpButton.classList.remove('hidden');
  exitButton.classList.remove('hidden');
  timelineUI.setVisible(true);
  instructions.classList.remove('hidden');
  // Timeline starts paused; the user presses play in the transport bar.
}

function exitExperience() {
  timeline.pause();
  welcomeScreen.classList.remove('hidden');
  document.body.classList.remove('started');
  timelineUI.setVisible(false);
  helpButton.classList.add('hidden');
  exitButton.classList.add('hidden');
  instructions.classList.add('hidden');
}

exitButton.addEventListener('click', exitExperience);

if (SHOW_WELCOME_SCREEN) {
  startBtn.addEventListener('click', enterExperience);
} else {
  enterExperience();
}

// --- Resize ---------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Adaptive quality -----------------------------------------------------
// Tracks FPS over 2s windows. When the framerate stays below target, sheds GPU
// load in priority order — the depthproj cloud (the subject) is the LAST thing
// touched, so room dressing is sacrificed before model quality:
//   1. Showroom texture detail (3 levels)
//   2. Shadow profile (high → low → off)
//   3. DepthProj point density (coarser grid step = fewer points), capped at 2
// Density is reduced by drawing fewer points, NEVER by hiding the cloud:
// toggling visibility every frame strobes/flickers badly in a headset.
const FPS_TARGET = 50;
let warmup = 4; // seconds to ignore while things settle
let winTime = 0;
let winFrames = 0;
let lowWindows = 0;

// Shadow ladder, driven one-way by the adaptive loop (and reset on VR enter/exit
// below). VR starts one notch down ('low') since stereo soft-PCF is costly.
const SHADOW_PROFILES = ['high', 'low', 'off'];
let shadowTier = 0;
function applyShadowTier() {
  showroom.setShadowProfile(SHADOW_PROFILES[shadowTier]);
}

// DepthProj grid-step ladder. `depthProjStep` is the live subsample step: full
// density (1) by default; the adaptive loop may raise it as a last resort, but
// only to DEPTHPROJ_MAX_STEP — step 3+ thins the cloud too aggressively.
const DEPTHPROJ_MAX_STEP = 2;
let depthProjStep = 1;

// Apply the current grid step to every depthproj clip (active or not, so a clip
// activated later inherits the current density).
function applyDepthProjStep(step) {
  for (const c of timeline.clips) {
    if (c.player?.isDepthProj) c.player.setGridStep(step);
  }
}

function trackPerformance(dt) {
  if (warmup > 0) {
    warmup -= dt;
    return;
  }
  winTime += dt;
  winFrames += 1;
  if (winTime < 2) return;
  const fps = winFrames / winTime;
  winTime = 0;
  winFrames = 0;
  lowWindows = fps < FPS_TARGET ? lowWindows + 1 : 0;
  if (lowWindows >= 2) {
    let acted = false;
    if (showroom.reduceDetail()) {
      acted = true;
      console.info(`[perf] ~${fps.toFixed(0)} fps — showroom → "${showroom.quality}"`);
    }
    if (!acted && shadowTier < SHADOW_PROFILES.length - 1) {
      shadowTier += 1;
      applyShadowTier();
      acted = true;
      console.info(`[perf] ~${fps.toFixed(0)} fps — shadows → "${SHADOW_PROFILES[shadowTier]}"`);
    }
    if (!acted && depthProjStep < DEPTHPROJ_MAX_STEP) {
      depthProjStep += 1;
      applyDepthProjStep(depthProjStep);
      acted = true;
      console.info(`[perf] ~${fps.toFixed(0)} fps — DepthProj grid step=${depthProjStep}`);
    }
    if (acted) lowWindows = 0;
  }
}

// --- Render loop (XR-aware; do not use requestAnimationFrame directly) ----
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  controls.update(dt); // no-op while an XR session is active
  vrControllers.update(); // grab locomotion; no-op outside an XR session
  vrTimeline.update(); // in-VR transport panel; no-op outside an XR session

  timeline.update(dt); // advance playhead, keep video + audio in sync
  timelineUI.update(); // reflect playhead on the transport bar

  // Show the floating-text cue for the current playhead time and billboard it
  // toward the player. No-op until the cue manifest finishes loading.
  textCues?.update(timeline.time, camera);

  trackPerformance(dt);
  renderer.render(scene, camera);
});
