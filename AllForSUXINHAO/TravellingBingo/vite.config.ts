import { fileURLToPath, URL } from 'node:url'
import { readFile } from 'node:fs/promises'

import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const favouriteIds = ['3682220021', '3986840044'] as const

function favouriteSnapshotsPlugin(): Plugin {
  return {
    name: 'travelling-bingo-favourite-snapshots',
    apply: 'build' as const,
    async generateBundle() {
      for (const favouriteId of favouriteIds) {
        const source = await readFile(
          fileURLToPath(new URL(`./favourites/${favouriteId}.txt`, import.meta.url)),
          'utf8',
        )
        this.emitFile({
          type: 'asset',
          fileName: `favourites/${favouriteId}.txt`,
          source,
        })
      }
    },
  }
}

export default defineConfig({
  root: appRoot,
  cacheDir: fileURLToPath(new URL('../../node_modules/.vite/travelling-bingo', import.meta.url)),
  base: '/AllForSUXINHAO/TravellingBingo/',
  plugins: [
    react(),
    // 刷播页只读取仓库中的两个收藏夹快照，并把它们作为同源静态资源发布。
    favouriteSnapshotsPlugin(),
    VitePWA({
      registerType: 'prompt',
      // Manifest 图标会由插件自动加入预缓存；这里只补充网页专用的 favicon 与触屏图标。
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon-180.png'],
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
            src: 'icons/app-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/app-icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,json,txt}',
          'assets/fonts/*.woff2',
          'assets/game/*.webp',
          'assets/friends/*.webp',
          'assets/miracle/**/*.webp',
          'assets/links/*.jpg',
          'assets/collectibles/**/*-480.webp',
        ],
        // 只有 Vite/Rollup 产出的内容哈希 JS/CSS 才能省略 revision。
        // 游戏图与收藏图使用固定文件名，必须保留内容 revision 才能在更新时换缓存。
        dontCacheBustURLsMatching: /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u,
        navigateFallback: '/AllForSUXINHAO/TravellingBingo/index.html',
        // 独立刷播页携带配置参数时仍应命中自己的预缓存入口，不能落入游戏首页。
        ignoreURLParametersMatching: [/^(?:favoriteId|selfTest|stopHours|sessionId|autostart)$/u],
        navigateFallbackDenylist: [
          /^\/AllForSUXINHAO\/TravellingBingo\/stream-player\.html(?:$|\?)/u,
        ],
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
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        streamPlayer: fileURLToPath(new URL('./stream-player.html', import.meta.url)),
      },
    },
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
