import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Listen on all interfaces (LAN access)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'flow-vendor': ['@xyflow/react'],
          'lucide': ['lucide-react'],
          'state': ['zustand'],
          'socket': ['socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});
