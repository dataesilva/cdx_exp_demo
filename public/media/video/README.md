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
