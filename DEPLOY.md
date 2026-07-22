# Deploying the AccuPath Experience on another machine

AccuPathExp runs as a small **web server on a computer**; the Meta Quest 3 opens it over
the **same Wi-Fi network**. There is no cloud/website to set up — you copy the
project to the computer that will run it, then launch it with one double-click.

These steps work on both **Windows** and **macOS**.

---

## Part A — Download the package to a new device

1. AccuPathExp is provided as a **zip of the project folder** that includes the essential materials for the project

   > Everything inside the zipped folder (the videos, audio, models, textures) **must
   > stay in the provided structure** — as all elements are necessary for the app to play.

2. Get the zip onto the new computer (USB drive, file share, cloud download —
   whatever is easiest). The initial zip has been provided by emailed link to a OneDrive file.

---

## Part B — Set up the new computer

1. **Install Node.js.** Go to <https://nodejs.org>, download the **LTS**
   installer for the operating system, run it, and accept all the defaults.
   (Same step on Windows and macOS. You only do this once per computer.)

2. **Unzip the project** somewhere easy to find, like the Desktop. Avoid putting
   it inside a synced folder (Dropbox/OneDrive/Syncthing) or a system folder.

3. **Launch it:**

   **Windows**
   - Double-click **`start.bat`**.
   - If a blue "Windows protected your PC" box appears: click **More info →
     Run anyway**.
   - The first time the server starts, **Windows Defender Firewall** will ask for
     permission — click **Allow access** (otherwise the Quest can't connect).

   **macOS**
   - **Right-click `start.command` → Open**, then confirm **Open** in the dialog.
     (Right-click → Open is only needed the very first time; after that you can
     double-click.)
   - If it refuses to run, open **Terminal**, drag the project folder in to get
     its path, and run once:
     ```bash
     chmod +x "/path/to/start.command"
     ```
     then try again.

4. A terminal/console window opens and shows:
   - `Installing dependencies...` (first run only, can take a few minutes)
   - `Building...`
   - `Starting server.`

   When it's running it prints a couple of URLs. Note the **Network** one — it
   looks like **`https://192.168.x.x:5173`**.

   > Leave this window **open** — closing it stops the server.

---

## Part C — Open the app on the Quest 3

1. Make sure the **Quest 3 is on the same Wi-Fi network** as the computer.
2. In the Quest's browser, type the **Network** URL from above
   (`https://192.168.x.x:5173`).
3. You'll get a security warning because the server uses a self-signed
   certificate — this is expected. Tap **Advanced → Proceed**.
4. Read the welcome and instructions, click "Start Experience" and then on the next page select **ENTER VR**.
   > The narration sequence will begin when the **Play*** arrow is tapped.
5. If the audience/user wishes to use a flat-screen device (laptop, table, or smartphone), simply read the instructions, click **Start the Experience** and click/tap the **Play** arrow to begin.
6. The playback can be paused and scrubbed similar to any other video player.
7. There is a large red X which will exit the experience and return the user to the welcome screen. 
---

## Troubleshooting

- **Quest can't load the page / "can't connect":**
  - Confirm both devices are on the **same Wi-Fi** (not a guest network).
  - Windows: re-check that you clicked **Allow access** on the firewall prompt.
    (You can re-trigger it by closing the window and running `start.bat` again.)
- **Security/certificate warning in the browser:** expected — tap **Advanced →
  Proceed** (Quest) or **Advanced → proceed** (desktop). It only nags the first
  time per device.
- **To stop the server:** close the terminal/console window.
- **Re-running is safe:** double-clicking the launcher again just rebuilds and
  restarts. Dependencies only reinstall if something changed.
- **Quick desktop check (optional):** on the computer itself, open
  `https://localhost:5173` in a browser — you should see the scene and an
  **ENTER VR** button. (VR won't actually start on a desktop, but this confirms
  the server works.)
