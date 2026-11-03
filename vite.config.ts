import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned, not left to Vite's first free port. The API answers a browser
    // only from an origin on its CORS allowlist, so a port that moves means
    // sign-in fails with a bare network error. This one is listed in the
    // backend's CORS_ADMIN_ORIGIN.
    port: 5190,
    strictPort: true,
  },
})
