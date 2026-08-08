import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ActivityKind } from '@/domain'

import {
  DEFAULT_ROOM_AREA,
  ROOM_AREAS,
  areaForActivity,
  areaForPanel,
  roomAreaFromLocation,
} from './roomConfig'

const appRoot = existsSync(resolve(process.cwd(), 'public/assets/game'))
  ? process.cwd()
  : resolve(process.cwd(), 'AllForSUXINHAO/TravellingBingo')
const ROOM_ASSETS = [
  resolve(appRoot, 'public/assets/game/chan-chan-house-v2-768.webp'),
  resolve(appRoot, 'public/assets/game/chan-chan-house-v2-1098.webp'),
] as const

describe('纵向房间配置', () => {
  it('两档房间图保持同一纵向构图比例', async () => {
    const metadata = await Promise.all(ROOM_ASSETS.map((asset) => sharp(asset).metadata()))
    const [compact, large] = metadata

    expect(compact).toMatchObject({ format: 'webp', width: 768, height: 1002 })
    expect(large).toMatchObject({ format: 'webp', width: 1098, height: 1433 })
    expect(compact.width! / compact.height!).toBeCloseTo(large.width! / large.height!, 3)
    expect(large.height!).toBeGreaterThan(large.width!)
  })

  it('热点与饼狗落点 ID 唯一、坐标唯一且都在百分比画布内', () => {
    const allAreas = [DEFAULT_ROOM_AREA, ...ROOM_AREAS]
    const ids = allAreas.map((area) => area.id)
    const hotspotCoordinates = ROOM_AREAS.map((area) => `${area.x},${area.y}`)
    const petCoordinates = allAreas.map((area) => `${area.petX},${area.petY}`)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(hotspotCoordinates).size).toBe(hotspotCoordinates.length)
    expect(new Set(petCoordinates).size).toBe(petCoordinates.length)

    for (const area of allAreas) {
      expect(area.x).toBeGreaterThanOrEqual(0)
      expect(area.x).toBeLessThanOrEqual(100)
      expect(area.y).toBeGreaterThanOrEqual(0)
      expect(area.y).toBeLessThanOrEqual(100)
      expect(area.petX).toBeGreaterThanOrEqual(0)
      expect(area.petX).toBeLessThanOrEqual(100)
      expect(area.petY).toBeGreaterThanOrEqual(0)
      expect(area.petY).toBeLessThanOrEqual(100)
    }
  })

  it('面板、活动和持久化位置都映射回唯一坐标表', () => {
    expect(areaForPanel('fridge').id).toBe('fridge')
    expect(areaForPanel('travel').id).toBe('door')
    expect(areaForPanel('status')).toBe(DEFAULT_ROOM_AREA)

    const expectedActivityAreas: Record<ActivityKind, string> = {
      travel: 'door',
      stream: 'computer',
      trend: 'computer',
    }
    for (const [kind, areaId] of Object.entries(expectedActivityAreas)) {
      expect(areaForActivity(kind as ActivityKind).id).toBe(areaId)
    }

    for (const area of ROOM_AREAS) {
      expect(roomAreaFromLocation(area.petLocation)).toBe(area)
    }
    expect(roomAreaFromLocation('future-location')).toBe(DEFAULT_ROOM_AREA)
  })
})
