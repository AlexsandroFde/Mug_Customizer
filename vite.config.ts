/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // O núcleo do three.js sozinho já passa de 600 kB minificado; o aviso padrão não ajuda aqui.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Bibliotecas mudam pouco entre deploys: separá-las do código da aplicação melhora o cache.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|@react-three|camera-controls|maath)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
