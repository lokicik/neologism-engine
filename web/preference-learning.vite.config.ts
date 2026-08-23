import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const sourceRoot = resolve(repositoryRoot, 'research', 'preference-learning', 'source')

export default defineConfig({
  root: sourceRoot,
  plugins: [wasm()],
  server: { fs: { allow: [repositoryRoot] } },
  build: {
    outDir: resolve(repositoryRoot, 'research', 'preference-learning', '.source-dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(sourceRoot, 'index.html') },
  },
})
