import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

const repositoryRoot = resolve(__dirname, '..')
const collectorRoot = resolve(repositoryRoot, 'research', 'selection-study', 'collector')

export default defineConfig({
  root: collectorRoot,
  plugins: [wasm()],
  server: {
    fs: { allow: [repositoryRoot] },
  },
  build: {
    outDir: resolve(repositoryRoot, 'research', 'selection-study', '.collector-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        collector: resolve(collectorRoot, 'index.html'),
        evaluator: resolve(collectorRoot, 'evaluator.html'),
        seedAudit: resolve(collectorRoot, 'seed-audit.html'),
      },
    },
  },
})
