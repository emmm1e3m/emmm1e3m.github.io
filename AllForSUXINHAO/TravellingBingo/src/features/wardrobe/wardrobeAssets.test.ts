import wardrobeManifest from '../../../public/data/miracle-wardrobe.json'

import { WARDROBE_ASSET_IDS, WARDROBE_CATALOG } from '@/domain/game/wardrobe'
import type { WardrobeTargetId } from '@/domain/game/types'

import { getWardrobeAssetVisual, getWardrobeTargetVisual } from './wardrobeAssets'

describe('奇迹饼狗素材跨层契约', () => {
  it('manifest、领域目录与 UI 视觉映射使用同一组素材信息', () => {
    const manifestItems = [...wardrobeManifest.outfits, ...wardrobeManifest.accessories]

    expect(manifestItems.map((item) => item.id).sort()).toEqual([...WARDROBE_ASSET_IDS].sort())
    for (const item of WARDROBE_CATALOG) {
      const manifestItem = manifestItems.find((candidate) => candidate.id === item.id)
      expect(manifestItem, item.id).toBeDefined()
      expect(manifestItem).toMatchObject({
        name: item.name,
        category: item.category,
        priceApples: item.priceApples,
        starter: item.starter,
        defaultTransform: item.defaultTransform,
      })

      const visual = getWardrobeAssetVisual(item.id)
      expect(visual.name).toBe(item.name)
      expect(visual.defaultTransform).toEqual(item.defaultTransform)
      expect(visual.url.endsWith(manifestItem?.url ?? '')).toBe(true)
      expect(visual.width).toBe(manifestItem?.width)
      expect(visual.height).toBe(manifestItem?.height)
    }
  })

  it('角色视觉映射与 manifest 的 ID、名称和尺寸一致', () => {
    for (const character of wardrobeManifest.characters) {
      const visual = getWardrobeTargetVisual(character.id as WardrobeTargetId)
      expect(visual).toMatchObject({
        id: character.id,
        name: character.name,
        width: character.width,
        height: character.height,
      })
      expect(visual.url.endsWith(character.url)).toBe(true)
    }
  })
})
