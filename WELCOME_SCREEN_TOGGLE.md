# Toggling the welcome screen

The welcome screen ("Welcome to AccuPath" card with the Start button) is
controlled by a single flag in `src/main.js`:

```js
const SHOW_WELCOME_SCREEN = false;
```

- `false` (current/dev default) — the welcome screen is skipped entirely.
  The app behaves like it did before the welcome screen existed: the
  experience starts immediately (UI overlays shown, video + timeline
  playing) with no click required.
- `true` — restores the welcome screen. The app waits on the welcome card;
  clicking **Start Experience** hides it and starts the experience exactly
  as `true` did before.

To switch states, change that one line and reload. No other files need to
change — `enterExperience()` in `src/main.js` is shared by both paths.
