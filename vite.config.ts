import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base を相対にして、GitHub Pages のサブフォルダでもそのまま動くようにする
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
