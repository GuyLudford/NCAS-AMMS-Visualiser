import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /<repo>/ so set the base accordingly.
// Override with VITE_BASE=/ for local testing or other hosts.
const base = process.env.VITE_BASE ?? '/NCAS-AMMS-Visualiser/';

export default defineConfig({
  plugins: [react()],
  base,
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
