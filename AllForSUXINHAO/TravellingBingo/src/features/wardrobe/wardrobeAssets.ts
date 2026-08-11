import { publicAsset } from '@/app/assets'
import { getWardrobeCatalogItem } from '@/domain/game/wardrobe'
import type { WardrobeAssetId, WardrobeTargetId, WardrobeTransform } from '@/domain/game/types'

const ASSET_VISUAL_SIZE = 512 as const
const TARGET_VISUAL_SIZE = 768 as const

export interface WardrobeAssetVisual {
  id: WardrobeAssetId
  name: string
  url: string
  width: typeof ASSET_VISUAL_SIZE
  height: typeof ASSET_VISUAL_SIZE
  defaultTransform: WardrobeTransform
}

export interface WardrobeTargetVisual {
  id: WardrobeTargetId
  name: string
  url: string
  width: typeof TARGET_VISUAL_SIZE
  height: typeof TARGET_VISUAL_SIZE
}

const TARGET_NAMES: Record<WardrobeTargetId, string> = {
  bingo: '饼狗',
  'class-representative-bing': '课代饼',
  'san-hao-rabbit': '三好兔',
  'xin-hao-rabbit': '心好兔',
  'signal-dog': '信号狗',
  'bili-bing': '饼哩饼哩',
}

export function getWardrobeAssetVisual(id: WardrobeAssetId): WardrobeAssetVisual {
  const item = getWardrobeCatalogItem(id)
  if (!item) throw new Error(`未知的奇迹饼狗素材：${id}`)
  const folder = item.category === 'outfit' ? 'outfits' : 'accessories'
  return {
    id,
    name: item.name,
    url: publicAsset(`assets/miracle/${folder}/${id}.webp`),
    width: ASSET_VISUAL_SIZE,
    height: ASSET_VISUAL_SIZE,
    defaultTransform: { ...item.defaultTransform },
  }
}

export function getWardrobeTargetVisual(id: WardrobeTargetId): WardrobeTargetVisual {
  return {
    id,
    name: TARGET_NAMES[id],
    url: publicAsset(`assets/miracle/characters/${id}.webp`),
    width: TARGET_VISUAL_SIZE,
    height: TARGET_VISUAL_SIZE,
  }
}
