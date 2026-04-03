import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  platform: 'node',
  // Keep Prisma external — it uses native .dll.node binaries that can't be bundled
  external: ['@prisma/client', '.prisma/client'],
  noExternal: [
    '@mistsplitter/core',
    '@mistsplitter/audit',
    '@mistsplitter/policy',
  ],
})
