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
import { createFloatingText } from './createFloatingText.js';
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

// Add floating text
(async () => { // Wrap in async IIFE
  const textMesh = await createFloatingText("Welcome to the\nAccuPath Experience", scene, new THREE.Vector3(-3, 2.5, -3), 0.3, 0.02);
  // textMesh is already added to scene inside createFloatingText, so no need for scene.add(textMesh) here.
})();

// Wall posters (images from the Unity project's "Text Mat" folder), mounted on
// the back wall behind the stage. The room is entered from the +Z side facing
// -Z, so the -Z wall sits behind the centre stage; the panels face +Z into the
// room. Held just off the wall surface to avoid z-fighting.
const posters = createPosters();
posters.position.set(0, 2.3, -(showroom.ROOM_SIZE / 2) + 0.06);
scene.add(posters);

// Video display to the LEFT of the stage (player enters at ~[0,1.6,3] facing
// -Z, so -X is their left). It plays the clip on loop for now; the returned
// handle exposes the <video> + play()/pause() so it can later be driven by the
// Timeline instead. Positioned inside the room and turned to face the player.
const videoScreen = createVideoScreen(scene, './other-media/S08-CL8R24100YG-color.mp4', {
  width: 2.2,
  position: new THREE.Vector3(-5, 0, 0.5),
  faceTarget: new THREE.Vector3(0, FLAT_EYE_HEIGHT, 3),
});

// --- Timeline (syncs Depthkit video clips + audio tracks) -----------------
// Content is described in public/media/timeline.json; see public/media/README.md
// for the schema and the file naming convention. With no clips listed yet this
// runs an empty, scrubbable timeline so the transport works during development.
const timeline = new Timeline({ scene });
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
  timelineUI.setVisible(false); // DOM overlay isn't visible in the headset
});
renderer.xr.addEventListener('sessionend', () => {
  camera.position.y = FLAT_EYE_HEIGHT;
  controls.setEnabled(true);
  helpButton.classList.remove('hidden');
  timelineUI.setVisible(true);
});

// --- Welcome Screen Logic --------------------------------------------------
// Toggled off during development; see WELCOME_SCREEN_TOGGLE.md to re-enable.
const SHOW_WELCOME_SCREEN = false;

const startBtn = document.getElementById('start-btn');
const welcomeScreen = document.getElementById('welcome-screen');

function enterExperience() {
  welcomeScreen.classList.add('hidden');
  document.body.classList.add('started');
  // Show active overlays
  helpButton.classList.remove('hidden');
  timelineUI.setVisible(true);
  instructions.classList.remove('hidden');

  // Trigger media playback
  videoScreen.play();
  timeline.play();
}

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
// Sample the framerate over 2s windows (after a warm-up). If it stays under
// target for two windows running, drop the showroom's texture detail a level.
const FPS_TARGET = 50;
let warmup = 4; // seconds to ignore while things settle
let winTime = 0;
let winFrames = 0;
let lowWindows = 0;

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
  if (lowWindows >= 2 && showroom.reduceDetail()) {
    lowWindows = 0;
    console.info(`[perf] ~${fps.toFixed(0)} fps < ${FPS_TARGET}; reduced detail to "${showroom.quality}".`);
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

  trackPerformance(dt);
  renderer.render(scene, camera);
});
