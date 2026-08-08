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
      includeAssets: ['icons/app-icon.svg'],
      manifest: {
        id: '/AllForSUXINHAO/TravellingBingo/',
        name: '旅行饼狗',
        short_name: '旅行饼狗',
        description: '离线单机粉丝向网页收集游戏',
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
          '**/*.{js,css,html,svg,woff2,json}',
          'assets/game/*.webp',
          'assets/collectibles/**/*-480.webp',
        ],
        // 只有 Vite/Rollup 产出的内容哈希 JS/CSS 才能省略 revision。
        // 游戏图与收藏图使用固定文件名，必须保留内容 revision 才能在更新时换缓存。
        dontCacheBustURLsMatching: /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u,
        navigateFallback: '/AllForSUXINHAO/TravellingBingo/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/AllForSUXINHAO/TravellingBingo/assets/collectibles/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'travelling-bingo-collectibles-v1',
              expiration: {
                maxEntries: 160,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/AllForSUXINHAO/TravellingBingo/assets/game/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'travelling-bingo-game-art-v1',
              expiration: {
                maxEntries: 24,
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
