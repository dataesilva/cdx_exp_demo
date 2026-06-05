# CD3 — Depthkit Volumetric Video on Meta Quest 3

A [three.js](https://threejs.org) + WebXR app for rendering [Depthkit](https://www.depthkit.tv)
volumetric video, targeting the Meta Quest 3. Built with [Vite](https://vitejs.dev).

## Requirements

- Node.js LTS
- A Meta Quest 3 on the **same Wi-Fi network** as your dev machine (for headset testing)

## Getting started

```bash
npm install
npm run dev
```

Vite serves over **HTTPS** (required for WebXR) and prints two URLs:

- `https://localhost:5173` — open on your desktop to preview. WebXR won't enter VR here,
  but you'll see the scene and the **ENTER VR** button.
- `https://<your-LAN-ip>:5173` — open in the **Quest 3 browser**, accept the self-signed
  certificate warning, then tap **ENTER VR**.

> The self-signed cert (from `@vitejs/plugin-basic-ssl`) triggers a browser warning the first
> time on each device — click through "Advanced → proceed".

## Adding content (timeline)

Volumetric video and audio play on a synchronised timeline driven by a manifest.

1. In Depthkit, export with the **Texture Mesh Sequence** export type using the **WebXR preset**
   (gives an `.mp4` plus a folder of Draco `.drc` meshes).
2. Drop assets into the media folders, following the naming convention documented in each:
   - `public/media/video/` — Depthkit clips (`NN_name.mp4` + matching `NN_name/` mesh folder)
   - `public/media/audio/` — audio (`NN_name.mp3`, …)
3. Register them in `public/media/timeline.json` with their `start` times. See
   `public/media/README.md` for the full schema.

Use the transport bar (bottom of the screen) to **play/pause** and **drag to scrub**. With no
clips listed, the timeline still runs empty and scrubbable.

## Project layout

| Path                    | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `index.html`            | Entry HTML + overlay UI (instructions, help button, transport).    |
| `src/main.js`           | Renderer, scene, lighting, enclosure, controls, timeline, loop.    |
| `src/Controls.js`       | Flat-screen first-person controls (keyboard + touch).              |
| `src/Timeline.js`       | Master clock syncing Depthkit video + audio clips.                 |
| `src/TimelineUI.js`     | Transport bar: play/pause + drag-to-scrub.                         |
| `src/DepthkitScene.js`  | Wraps `depthkit`'s `DracoMeshSequencePlayer`.                      |
| `public/media/`         | `timeline.json` manifest + `video/` and `audio/` asset folders.    |
| `vite.config.js`        | HTTPS + LAN host config for Quest access.                          |

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build over HTTPS
```

## Notes

- `three` is pinned to the `0.159.x` line to match `depthkit`'s dependency range, so npm
  resolves a **single** copy of three.js. Bumping three independently can cause "multiple
  instances of three.js" errors once the player is active — bump both together.
- The render loop uses `renderer.setAnimationLoop(...)` (not `requestAnimationFrame`); this is
  required for WebXR.
