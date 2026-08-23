import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const sourceRoot = resolve(repositoryRoot, 'research', 'preference-learning', 'collector')

export default defineConfig({
  root: sourceRoot,
  server: { fs: { allow: [repositoryRoot] } },
  build: {
    target: 'es2022',
    outDir: resolve(repositoryRoot, 'research', 'preference-learning', '.collector-dist'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(sourceRoot, 'index.html') },
  },
})
