import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

const repositoryRoot = resolve(__dirname, '..')
const sourceRoot = resolve(repositoryRoot, 'research', 'preference-study', 'source')

export default defineConfig({
  root: sourceRoot,
  plugins: [wasm()],
  server: { fs: { allow: [repositoryRoot] } },
  build: {
    outDir: resolve(repositoryRoot, 'research', 'preference-study', '.source-dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(sourceRoot, 'index.html') },
  },
})
