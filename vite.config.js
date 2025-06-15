import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This allows access from your local network IP (e.g., from your phone)
    port: 5173 // Default Vite port
  }
});
