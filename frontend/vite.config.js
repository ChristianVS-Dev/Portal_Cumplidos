import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig(({ mode }) => {
  const isMobileBuild = mode === 'mobile';

  return {
    plugins: [react()],
    /** Capacitor WebView requiere rutas relativas; web/Docker usa raíz absoluta */
    base: isMobileBuild ? './' : '/',
    build: {
      target: 'es2020',
      sourcemap: isMobileBuild,
      ...(isMobileBuild
        ? {
            rollupOptions: {
              output: {
                manualChunks: {
                  vendor: ['react', 'react-dom'],
                  capacitor: [
                    '@capacitor/core',
                    '@capacitor/app',
                    '@capacitor/network',
                    '@capacitor/splash-screen',
                    '@capacitor/status-bar',
                    '@capacitor/keyboard',
                  ],
                },
              },
            },
          }
        : {}),
    },
    server: {
      host: true,
      port: 5173,
      watch: {
        usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      },
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
