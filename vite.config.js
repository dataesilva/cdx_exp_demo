import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR on the Quest 3 only runs over HTTPS when served across the LAN
// (plain http://localhost is exempt, but the headset is a different origin).
// basic-ssl generates a self-signed cert; `host: true` binds to 0.0.0.0 so
// the headset can reach https://<your-LAN-ip>:5173 over Wi-Fi.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    watch: {
      // This project lives inside a Syncthing folder. Syncthing holds brief
      // locks on files while syncing, which makes Node's native fs.watch throw
      // EBUSY and crash the dev server when it tries to watch them. Don't watch
      // the synced binary assets (no HMR needed for media); src/ is still
      // watched, so code hot-reload is unaffected.
      ignored: ['**/public/**', '**/.stfolder/**'],
    },
  },
  preview: {
    // `npm run preview` serves the production build (dist/). host:true binds to
    // 0.0.0.0 so the Quest 3 can reach https://<your-LAN-ip>:5173 over Wi-Fi,
    // and pinning the port keeps that URL predictable (preview defaults to 4173).
    host: true,
    port: 5173,
  },
  // Depthkit's .drc/.mp4 assets in public/ are served as-is.
});
