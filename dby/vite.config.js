import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    manifest: true,
  },
  plugins: [
    {
      name: 'public-homepage',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.split('?')[0] === '/') req.url = '/home.html';
          next();
        });
      },
    },
    react(),
     tailwindcss()
  ],
})
