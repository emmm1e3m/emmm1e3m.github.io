import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

const appRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: appRoot,
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite/travelling-bingo', import.meta.url)),
  base: '/AllForSUXINHAO/TravellingBingo/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        id: '/AllForSUXINHAO/TravellingBingo/',
        name: '旅行饼狗',
        short_name: '旅行饼狗',
        description: '陪饼狗吃苹果、做任务、出门旅行，把每一份惊喜收进收藏墙。',
        lang: 'zh-CN',
        start_url: '/AllForSUXINHAO/TravellingBingo/',
        scope: '/AllForSUXINHAO/TravellingBingo/',
        display: 'standalone',
        background_color: '#fff7ed',
        theme_color: '#c9364f',
        icons: [
          {
            src: 'icons/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,json}',
          'assets/fonts/*.woff2',
          'assets/game/*.webp',
          'assets/collectibles/**/*-480.webp',
        ],
        // 只有 Vite/Rollup 产出的内容哈希 JS/CSS 才能省略 revision。
        // 游戏图与收藏图使用固定文件名，必须保留内容 revision 才能在更新时换缓存。
        dontCacheBustURLsMatching: /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u,
        navigateFallback: '/AllForSUXINHAO/TravellingBingo/index.html',
        runtimeCaching: [
          {
            // 480px 缩略图已预缓存；这里只缓存按需打开的高清收藏图。
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/AllForSUXINHAO/TravellingBingo/assets/collectibles/') &&
              !url.pathname.endsWith('-480.webp'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'travelling-bingo-collectibles-hires-v2',
              expiration: {
                maxEntries: 96,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist/travelling-bingo', import.meta.url)),
    emptyOutDir: true,
    // Pages 只发布生产产物，避免 sourcemap 将源码一并带到公网。
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
