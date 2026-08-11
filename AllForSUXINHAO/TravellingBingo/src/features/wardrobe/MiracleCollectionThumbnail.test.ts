// @vitest-environment node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import type { WardrobeAssetCategory } from '@/domain/game/types'

import wardrobeStyles from './MiracleWardrobePage.css?raw'

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

interface ManifestAsset {
  id: string
  category: WardrobeAssetCategory
  url: string
}

interface WardrobeManifest {
  outfits: ManifestAsset[]
  accessories: ManifestAsset[]
}

function ruleScale(selector: string) {
  const start = wardrobeStyles.indexOf(`${selector} {`)
  const end = wardrobeStyles.indexOf('}', start)
  const rule = wardrobeStyles.slice(start, end)
  const match = /transform:\s*scale\(([\d.]+)\)/u.exec(rule)
  if (!match) throw new Error(`没有找到缩略图倍率：${selector}`)
  return Number(match[1])
}

describe('奇迹饼狗收藏缩略图', () => {
  it('所有素材的可见 alpha 边缘在分类缩放后仍完整留在框内', async () => {
    const manifest = JSON.parse(
      await readFile(path.resolve(APP_ROOT, 'public/data/miracle-wardrobe.json'), 'utf8'),
    ) as WardrobeManifest
    const scaleByCategory: Record<WardrobeAssetCategory, number> = {
      outfit: ruleScale('.miracle-collection-group--outfit .miracle-collection-thumb img'),
      face: ruleScale('.miracle-collection-group--face .miracle-collection-thumb img'),
      headwear: ruleScale('.miracle-collection-thumb img'),
      accessory: ruleScale('.miracle-collection-thumb img'),
      prop: ruleScale('.miracle-collection-thumb img'),
    }

    for (const asset of [...manifest.outfits, ...manifest.accessories]) {
      const { data, info } = await sharp(path.resolve(APP_ROOT, 'public', asset.url))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      let minimumX = info.width
      let minimumY = info.height
      let maximumX = -1
      let maximumY = -1
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          if (data[(y * info.width + x) * 4 + 3] === 0) continue
          minimumX = Math.min(minimumX, x)
          minimumY = Math.min(minimumY, y)
          maximumX = Math.max(maximumX, x)
          maximumY = Math.max(maximumY, y)
        }
      }
      expect(maximumX, `${asset.id} 应包含可见像素`).toBeGreaterThanOrEqual(0)
      const minimumMargin = Math.min(
        minimumX / info.width,
        minimumY / info.height,
        (info.width - 1 - maximumX) / info.width,
        (info.height - 1 - maximumY) / info.height,
      )
      const maximumSafeScale = 0.5 / (0.5 - minimumMargin)
      expect(
        scaleByCategory[asset.category],
        `${asset.id} 的可见边缘不应被缩略框裁掉`,
      ).toBeLessThanOrEqual(maximumSafeScale)
    }
  })
})
