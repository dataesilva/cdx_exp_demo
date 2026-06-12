# Depthkit video clips

Drop **Depthkit WebXR exports** here. In Depthkit, export with the
**Texture Mesh Sequence** export type using the **WebXR preset**. Each clip is
one `.mp4` (color + texture) plus a folder of Draco `.drc` meshes.

## Naming convention

Use a two-digit order prefix and a short, lowercase, hyphen/underscore name.
The `.mp4` and its mesh folder **must share the exact same base name**:

```
public/media/video/
  01_intro.mp4
  01_intro/
    mesh-f00001.drc
    mesh-f00002.drc
    ...
  02_performance.mp4
  02_performance/
    mesh-f00001.drc
    ...
```

Rules:
- `NN_` prefix (`01_`, `02_`, …) — sets human-readable ordering.
- Base name: lowercase letters, digits, `-` or `_` only (no spaces).
- The mesh folder name **equals** the `.mp4` base name (no extension).

## Putting it on the timeline

Reference the clip in `../timeline.json` by its base path **without extension**,
on a `"type": "video"` track:

```jsonc
{ "src": "./media/video/01_intro", "start": 0, "name": "Intro" }
```

`duration` is optional — if omitted it is read from the video automatically.

## depthproj clips (volfuse single-sensor point cloud)

Besides Depthkit mesh sequences, the video track also plays **volfuse
`depthproj`** clips — a single-sensor combined-per-pixel video unprojected into a
GPU point cloud (one video decode, no `.drc` churn; frame-rate stable). Each clip
is a **folder** containing the combined video + its metadata:

```
public/media/video/
  03_capture-antibody_s1/
    take.mp4          <- colour (top) + luma depth (bottom)
    depthproj.json    <- depth intrinsics, near/far, depthToWorld, bounds
  ...
  _placement.json     <- shared upright/stage transform (one for the fixed rig)
```

Reference it with `"format": "depthproj"` and the **folder** path (no extension):

```jsonc
{ "src": "./media/video/03_capture-antibody_s1", "format": "depthproj", "start": 0 }
```

- Produced by `scripts/render_cd3.py` in the volfuse repo (single sensor
  `CL8R241002M`, edge cull 0.10, bounds cull on). It also writes a
  `timeline.suggested.json` here — a ready chronological sequence to copy/rename
  into `timeline.json`.
- `_placement.json` (`rotationEuler` °, `position`, `scale`) stands the cloud
  upright and on the stage; the depthproj world frame is the reference *camera*
  frame (y-down), so it needs a one-time orientation. Tune it once by eye in
  `npm run dev` — the rig is fixed, so it applies to every clip.
- Omitting `format` (or using anything other than `"depthproj"`) keeps the
  classic Depthkit mesh player.
