import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// artifact モードは three まで含めて1枚のHTMLに焼き込む（claude.ai の Artifact で公開するため）
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'artifact' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
  },
}));
