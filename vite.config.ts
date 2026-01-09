
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // v9.1.13: Endret base til './' (relativ).
  // Dette gjør at appen fungerer både på rotnivå (Vercel/Cloud Run) 
  // OG i undermapper (GitHub Pages) uten konfigurasjonsendring.
  base: './', 
  define: {
    // Dette hindrer appen i å krasje fordi 'process' ikke finnes i nettleseren.
    // Vi setter den til en tom streng som standard.
    'process.env': {
      API_KEY: JSON.stringify(process.env.API_KEY || "")
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000
  }
});
