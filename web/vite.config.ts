import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [react(), wasm()],
  // The seam-blend Lab data tables live in ../core/data and are imported as
  // lazy ?raw chunks; allow the dev server to read the repo root.
  server: { fs: { allow: ['..'] } },
})
