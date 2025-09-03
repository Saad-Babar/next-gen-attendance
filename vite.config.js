import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'


// https://vite.dev/config/
export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync('./localhost+2-key.pem'),
      cert: fs.readFileSync('./localhost+2.pem'),
    },
    host: true, // allows access from your mobile device
  },
  plugins: [react()],
})
