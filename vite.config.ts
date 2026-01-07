
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // VIKTIG: Hvis du legger dette på https://brukernavn.github.io/repo-navn/
  // må du endre base til '/repo-navn/'. Hvis du bruker eget domene, la den være '/'.
  base: '/repo-navn/', 
  define: {
    // Dette er nødvendig fordi koden bruker 'process.env.API_KEY'.
    // Dette hindrer appen i å krasje i nettleseren.
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
