import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR on the Quest 3 only runs over HTTPS when served across the LAN
// (plain http://localhost is exempt, but the headset is a different origin).
// basic-ssl generates a self-signed cert; `host: true` binds to 0.0.0.0 so
// the headset can reach https://<your-LAN-ip>:5173 over Wi-Fi.
//
// Render terminates TLS at its own edge and proxies plain HTTP to the port
// it assigns via $PORT, so the self-signed cert is skipped there and the
// port follows Render's assignment instead of the LAN default.
const isRender = !!process.env.RENDER;
const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  base: './',
  plugins: isRender ? [] : [basicSsl()],
  server: {
    host: true,
    port,
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
    port,
    // Render also runs `vite preview` to serve the deployed build; Vite 7
    // rejects unrecognized Host headers by default, so the assigned domain
    // must be allowlisted.
    allowedHosts: ['cdxexp-p8dp.onrender.com'],
  },
  // Depthkit's .drc/.mp4 assets in public/ are served as-is.
});
