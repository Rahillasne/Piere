import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@lib': path.resolve(__dirname, './lib'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,

    outDir: 'dist',
    emptyOutDir: true,

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'lucide-react'],
        },
      },
    },

    sourcemap: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  server: {
    port: 3000,
    open: false,
  },
  optimizeDeps: {
    exclude: ['@zip.js/zip.js', 'three', 'three-stdlib'],
  },
});
