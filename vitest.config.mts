import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  resolve: {
    // Mismo alias que tsconfig.json, para importar desde "@/lib/..."
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''), // lee .env.test (y .env.local)
    testTimeout: 20000,
    fileParallelism: false,
  },
}))
