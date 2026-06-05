# Media + timeline

This folder holds the volumetric video and audio that the app plays, plus the
`timeline.json` manifest that places them on a synchronised timeline.

```
public/media/
  timeline.json     <- the manifest (what plays, and when)
  video/            <- Depthkit WebXR exports   (see video/README.md)
  audio/            <- audio files              (see audio/README.md)
```

## How playback works

The app loads `timeline.json` on startup and runs a single master playhead.
Each clip has a `start` time (in seconds); while the playhead is inside a clip's
window, that clip's media is kept seeked to `playhead − start`, so video and
audio stay in sync. Play/pause and drag-to-scrub on the transport bar drive the
playhead. With no clips listed, the timeline still runs empty and scrubbable.

## `timeline.json` schema

```jsonc
{
  "duration": 60,        // total length in seconds. Optional — if omitted it is
                         // derived from the clips (max start + duration).
  "loop": true,          // restart from 0 when the playhead reaches the end
  "tracks": [
    {
      "type": "video",   // "video" = Depthkit clip, "audio" = audio file
      "name": "Depthkit",
      "clips": [
        {
          "src": "./media/video/01_intro",  // video: path WITHOUT extension
          "start": 0,                        // when it begins, in seconds
          "duration": 12.5,                  // optional; auto-read from media
          "name": "Intro"                    // optional label
        }
      ]
    },
    {
      "type": "audio",
      "name": "Audio",
      "clips": [
        {
          "src": "./media/audio/01_score.mp3", // audio: full path WITH extension
          "start": 0,
          "name": "Score"
        }
      ]
    }
  ]
}
```

Notes:
- Paths are served from `public/`, so `public/media/video/01_intro.*` is
  referenced as `./media/video/01_intro`.
- A **video** `src` is the clip's base path with **no extension** (Depthkit
  needs both the `.mp4` and the matching `.drc` folder of the same name).
- An **audio** `src` includes the file extension.
- You can place multiple clips on a track at different `start` times; they will
  be added/removed as the playhead passes through them.

## Adding content

1. Drop files into `video/` and `audio/` following the naming convention in
   each folder's README.
2. Add a clip entry to the matching track in `timeline.json` with its `start`.
3. Reload — it appears on the timeline and plays in sync.
