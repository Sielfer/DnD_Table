// L'interfaccia React diventa un solo file, dist/index.html, che il server manda a tutti (finestra dell'app e telefoni).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  plugins: [react(), viteSingleFile()],
  build: { outDir: '../dist', emptyOutDir: true },
  // "npm run dev": pagina con ricarica automatica, il server del tavolo (npm start) risponde alle /api
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
