import type { ActivityKind } from '@/domain'

import type { PanelId } from './GameHome'

export type RoomAreaId =
  | 'center'
  | 'bed'
  | 'computer'
  | 'wardrobe'
  | 'keyboard'
  | 'fridge'
  | 'recordPlayer'
  | 'album'
  | 'door'

export interface RoomArea {
  id: RoomAreaId
  panel: PanelId
  label: string
  buttonLabel: string
  x: number
  y: number
  petX: number
  petY: number
  activityKind?: ActivityKind
  petLocation:
    | 'center'
    | 'bed'
    | 'computer'
    | 'wardrobe'
    | 'piano'
    | 'record-player'
    | 'fridge'
    | 'collection-wall'
    | 'door'
}

/**
 * 房间热点与饼狗落点的唯一坐标来源；百分比坐标跟随 portrait 原图缩放。
 */
export const ROOM_AREAS: readonly RoomArea[] = [
  {
    id: 'bed',
    panel: 'rest',
    label: '床铺',
    buttonLabel: '去床边',
    x: 22,
    y: 19,
    petX: 32,
    petY: 50,
    petLocation: 'bed',
  },
  {
    id: 'computer',
    panel: 'computer',
    label: '电脑',
    buttonLabel: '去电脑前',
    x: 50,
    y: 20,
    petX: 42,
    petY: 47,
    activityKind: 'stream',
    petLocation: 'computer',
  },
  {
    id: 'wardrobe',
    panel: 'wardrobe',
    label: '衣架',
    buttonLabel: '看看衣架',
    x: 51,
    y: 33,
    petX: 42,
    petY: 49,
    petLocation: 'wardrobe',
  },
  {
    id: 'keyboard',
    panel: 'music',
    label: '电子琴',
    buttonLabel: '弹弹琴',
    x: 15,
    y: 75,
    petX: 27,
    petY: 84,
    petLocation: 'piano',
  },
  {
    id: 'fridge',
    panel: 'fridge',
    label: '冰箱',
    buttonLabel: '打开冰箱',
    x: 55,
    y: 56,
    petX: 54,
    petY: 77,
    petLocation: 'fridge',
  },
  {
    id: 'recordPlayer',
    panel: 'music',
    label: '唱片机',
    buttonLabel: '放张唱片',
    x: 72,
    y: 65,
    petX: 74,
    petY: 84,
    petLocation: 'record-player',
  },
  {
    id: 'album',
    panel: 'album',
    label: '收藏墙',
    buttonLabel: '看看收藏墙',
    x: 81,
    y: 56,
    petX: 83,
    petY: 84,
    petLocation: 'collection-wall',
  },
  {
    id: 'door',
    panel: 'travel',
    label: '房门',
    buttonLabel: '去门口',
    x: 90,
    y: 71,
    petX: 87,
    petY: 87,
    activityKind: 'travel',
    petLocation: 'door',
  },
] as const

export const DEFAULT_ROOM_AREA = {
  id: 'center',
  panel: 'status',
  label: '房间中央',
  buttonLabel: '回房间中央',
  x: 45,
  y: 82,
  petX: 45,
  petY: 82,
  petLocation: 'center',
} satisfies RoomArea

export function areaForPanel(panel: PanelId) {
  return ROOM_AREAS.find((area) => area.panel === panel) ?? DEFAULT_ROOM_AREA
}

export function areaForActivity(kind: ActivityKind) {
  if (kind === 'travel') return ROOM_AREAS.find((area) => area.id === 'door')!
  return ROOM_AREAS.find((area) => area.id === 'computer')!
}

const LOCATION_TO_AREA: Record<string, RoomAreaId> = {
  center: 'center',
  bed: 'bed',
  computer: 'computer',
  wardrobe: 'wardrobe',
  piano: 'keyboard',
  'record-player': 'recordPlayer',
  fridge: 'fridge',
  'collection-wall': 'album',
  door: 'door',
}

export function roomAreaFromLocation(location: string): RoomArea {
  const areaId = LOCATION_TO_AREA[location] ?? 'center'
  return ROOM_AREAS.find((area) => area.id === areaId) ?? DEFAULT_ROOM_AREA
}
