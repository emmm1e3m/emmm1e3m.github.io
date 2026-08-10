import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ActivityKind } from '@/domain'

import {
  DEFAULT_ROOM_AREA,
  ROOM_AREAS,
  ROOM_CANVAS,
  areaForActivity,
  areaForPanel,
  roomPointToPercent,
  roomAreaForWorld,
  roomAreaVisibleInWorld,
  roomAreaFromLocation,
  type RoomAreaId,
} from './roomConfig'

const appRoot = existsSync(resolve(process.cwd(), 'public/assets/game'))
  ? process.cwd()
  : resolve(process.cwd(), 'AllForSUXINHAO/TravellingBingo')
const ROOM_ASSETS = [
  resolve(appRoot, 'public/assets/game/chan-chan-house-v2-768.webp'),
  resolve(appRoot, 'public/assets/game/chan-chan-house-v2-1098.webp'),
] as const

const EXPECTED_HOTSPOTS: Record<RoomAreaId, { x: number; y: number }> = {
  center: { x: 45, y: 82 },
  bed: { x: 22, y: 29 },
  computer: { x: 52, y: 29 },
  wardrobe: { x: 54, y: 44 },
  keyboard: { x: 17, y: 67 },
  fridge: { x: 50, y: 59 },
  recordPlayer: { x: 75, y: 84 },
  album: { x: 81, y: 60 },
  trendComputer: { x: 72, y: 29 },
  workComputer: { x: 22, y: 86 },
  door: { x: 92, y: 74 },
}

const EXPECTED_PET_CENTERS: Record<RoomAreaId, { x: number; y: number }> = {
  center: { x: 620, y: 1180 },
  bed: { x: 225, y: 300 },
  computer: { x: 504, y: 409 },
  wardrobe: { x: 387, y: 675 },
  keyboard: { x: 257, y: 1103 },
  fridge: { x: 633, y: 951 },
  recordPlayer: { x: 783, y: 1030 },
  album: { x: 673, y: 1053 },
  trendComputer: { x: 504, y: 409 },
  workComputer: { x: 420, y: 1172 },
  door: { x: 980, y: 1176 },
}

describe('纵向房间配置', () => {
  it('两档房间图保持同一纵向构图比例', async () => {
    const metadata = await Promise.all(ROOM_ASSETS.map((asset) => sharp(asset).metadata()))
    const [compact, large] = metadata

    expect(compact).toMatchObject({ format: 'webp', width: 768, height: 1002 })
    expect(large).toMatchObject({ format: 'webp', width: 1098, height: 1433 })
    expect(compact.width! / compact.height!).toBeCloseTo(large.width! / large.height!, 3)
    expect(large.height!).toBeGreaterThan(large.width!)
  })

  it('热点坐标互不重复，饼狗中心严格使用 1098 × 1433 母版像素', () => {
    const allAreas = [DEFAULT_ROOM_AREA, ...ROOM_AREAS]
    const ids = allAreas.map((area) => area.id)
    const hotspotCoordinates = ROOM_AREAS.map((area) => `${area.hotspot.x},${area.hotspot.y}`)

    expect(ROOM_CANVAS).toEqual({ width: 1098, height: 1433 })
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(hotspotCoordinates).size).toBe(hotspotCoordinates.length)

    for (const area of allAreas) {
      expect(area.petCenter).toEqual(EXPECTED_PET_CENTERS[area.id])
      expect(area.hotspot.x).toBeGreaterThanOrEqual(0)
      expect(area.hotspot.x).toBeLessThanOrEqual(100)
      expect(area.hotspot.y).toBeGreaterThanOrEqual(0)
      expect(area.hotspot.y).toBeLessThanOrEqual(100)
      expect(area.petCenter.x).toBeGreaterThanOrEqual(0)
      expect(area.petCenter.x).toBeLessThanOrEqual(ROOM_CANVAS.width)
      expect(area.petCenter.y).toBeGreaterThanOrEqual(0)
      expect(area.petCenter.y).toBeLessThanOrEqual(ROOM_CANVAS.height)

      const percent = roomPointToPercent(area.petCenter)
      expect(percent.x).toBeCloseTo((EXPECTED_PET_CENTERS[area.id].x / 1098) * 100, 12)
      expect(percent.y).toBeCloseTo((EXPECTED_PET_CENTERS[area.id].y / 1433) * 100, 12)
    }

    for (const area of ROOM_AREAS) {
      expect(area.hotspot).toEqual(EXPECTED_HOTSPOTS[area.id])
    }

    const streamHotspot = roomAreaForWorld(
      ROOM_AREAS.find((area) => area.id === 'computer')!,
      'reality',
    ).hotspot
    const trendHotspot = ROOM_AREAS.find((area) => area.id === 'trendComputer')!.hotspot
    expect(trendHotspot.x - streamHotspot.x).toBeGreaterThanOrEqual(20)
    expect(trendHotspot.y - streamHotspot.y).toBeGreaterThanOrEqual(10)
  })

  it('面板、活动和持久化位置都映射回统一坐标表', () => {
    expect(areaForPanel('fridge').id).toBe('fridge')
    expect(areaForPanel('travel').id).toBe('door')
    expect(areaForPanel('reality-stream').id).toBe('computer')
    expect(areaForPanel('reality-trend').id).toBe('trendComputer')
    expect(areaForPanel('reality-work').id).toBe('workComputer')
    expect(areaForPanel('status')).toBe(DEFAULT_ROOM_AREA)

    const computer = areaForPanel('computer')
    expect(roomAreaForWorld(computer, 'game')).toBe(computer)
    expect(roomAreaForWorld(computer, 'reality')).toMatchObject({
      id: 'computer',
      panel: 'reality-stream',
      buttonLabel: '刷播',
      hotspot: { x: 52, y: 18 },
    })

    const expectedActivityAreas: Record<ActivityKind, string> = {
      travel: 'door',
      stream: 'computer',
      trend: 'computer',
      music: 'keyboard',
      rest: 'bed',
    }
    for (const [kind, areaId] of Object.entries(expectedActivityAreas)) {
      expect(areaForActivity(kind as ActivityKind).id).toBe(areaId)
    }

    for (const area of ROOM_AREAS.filter((candidate) => candidate.id !== 'trendComputer')) {
      expect(roomAreaFromLocation(area.petLocation)).toBe(area)
    }
    expect(roomAreaFromLocation('computer').id).toBe('computer')
    expect(roomAreaFromLocation('work-computer').id).toBe('workComputer')
    expect(roomAreaFromLocation('future-location')).toBe(DEFAULT_ROOM_AREA)
  })

  it('游戏维度保留原设施，现实维度开放刷播、冲热、工作与唱片机', () => {
    expect(ROOM_AREAS.every((area) => area.worlds && area.worlds.length > 0)).toBe(true)

    const visibleAreaIds = (world: 'game' | 'reality') =>
      ROOM_AREAS.filter((area) => roomAreaVisibleInWorld(area, world)).map((area) => area.id)

    expect(visibleAreaIds('game')).toEqual([
      'bed',
      'computer',
      'wardrobe',
      'keyboard',
      'fridge',
      'recordPlayer',
      'album',
      'door',
    ])
    expect(visibleAreaIds('reality')).toEqual([
      'computer',
      'trendComputer',
      'recordPlayer',
      'workComputer',
    ])
  })
})
