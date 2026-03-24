/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react',  test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/, priority: 20 },
            { name: 'vendor-charts', test: /[\\/]node_modules[\\/]recharts[\\/]/,                          priority: 15 },
            { name: 'vendor-ui',     test: /[\\/]node_modules[\\/](lucide-react|date-fns)[\\/]/,            priority: 10 },
            { name: 'vendor-ledger', test: /[\\/]node_modules[\\/]@ledgerhq[\\/]/,                          priority: 5  },
            { name: 'vendor',        test: /[\\/]node_modules[\\/]/,                                       priority: 1  },
          ],
        },
      },
    },
    // Increase chunk size warning limit to 600KB
    chunkSizeWarningLimit: 600,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
