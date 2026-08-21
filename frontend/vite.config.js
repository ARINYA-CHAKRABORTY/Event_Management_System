/*
 * Configures Vite and Tailwind for the Event Check-In System frontend.
 * It keeps the development and production builds focused on the single React application.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
      '/socket.io': {
        target: 'http://localhost:3002',
        ws: true
      }
    }
  }
})
