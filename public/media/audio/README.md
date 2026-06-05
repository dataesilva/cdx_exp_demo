# Audio tracks

Drop audio files here to play in sync with the volumetric video. Use a
browser-friendly format: **`.mp3`**, `.m4a`/`.aac`, `.ogg`, or `.wav`.

## Naming convention

Two-digit order prefix + short lowercase name, matching the video convention so
related assets sort together:

```
public/media/audio/
  01_score.mp3
  02_voiceover.mp3
```

Rules:
- `NN_` prefix (`01_`, `02_`, …) for ordering.
- Lowercase letters, digits, `-` or `_` only (no spaces).
- Keep the file extension — audio is referenced **with** it.

## Putting it on the timeline

Reference the file in `../timeline.json` (with extension) on a
`"type": "audio"` track:

```jsonc
{ "src": "./media/audio/01_score.mp3", "start": 0, "name": "Score" }
```

`start` is when the track begins, in seconds. Set it to the same `start` as a
video clip to lock them together. `duration` is optional (read automatically).

> Browsers only let audio start after a user interaction — playback begins on
> the first tap of the **play** button, which satisfies that requirement.
