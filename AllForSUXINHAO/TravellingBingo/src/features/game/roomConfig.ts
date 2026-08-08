import type { ActivityKind, PetInterest } from '@/domain'

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
  hotspot: { x: number; y: number }
  /** 百分比坐标以饼狗脚底为锚点。 */
  petFoot: { x: number; y: number }
  activityKinds?: readonly ActivityKind[]
  interest?: PetInterest
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
    hotspot: { x: 22, y: 29 },
    petFoot: { x: 27, y: 30 },
    activityKinds: ['rest'],
    petLocation: 'bed',
  },
  {
    id: 'computer',
    panel: 'computer',
    label: '电脑',
    buttonLabel: '去电脑前',
    hotspot: { x: 52, y: 29 },
    petFoot: { x: 53, y: 36 },
    activityKinds: ['stream', 'trend'],
    interest: 'computer',
    petLocation: 'computer',
  },
  {
    id: 'wardrobe',
    panel: 'wardrobe',
    label: '衣架',
    buttonLabel: '看看衣架',
    hotspot: { x: 54, y: 44 },
    petFoot: { x: 56, y: 52 },
    petLocation: 'wardrobe',
  },
  {
    id: 'keyboard',
    panel: 'piano',
    label: '电子琴',
    buttonLabel: '弹弹琴',
    hotspot: { x: 17, y: 79 },
    petFoot: { x: 27, y: 84 },
    activityKinds: ['music'],
    interest: 'music',
    petLocation: 'piano',
  },
  {
    id: 'fridge',
    panel: 'fridge',
    label: '冰箱',
    buttonLabel: '打开冰箱',
    hotspot: { x: 50, y: 59 },
    petFoot: { x: 54, y: 77 },
    petLocation: 'fridge',
  },
  {
    id: 'recordPlayer',
    panel: 'record-player',
    label: '唱片机',
    buttonLabel: '放张唱片',
    hotspot: { x: 75, y: 74 },
    petFoot: { x: 74, y: 84 },
    interest: 'music',
    petLocation: 'record-player',
  },
  {
    id: 'album',
    panel: 'album',
    label: '收藏墙',
    buttonLabel: '看看收藏墙',
    hotspot: { x: 81, y: 60 },
    petFoot: { x: 83, y: 84 },
    petLocation: 'collection-wall',
  },
  {
    id: 'door',
    panel: 'travel',
    label: '房门',
    buttonLabel: '去门口',
    hotspot: { x: 92, y: 74 },
    petFoot: { x: 87, y: 87 },
    activityKinds: ['travel'],
    interest: 'travel',
    petLocation: 'door',
  },
] as const

export const DEFAULT_ROOM_AREA = {
  id: 'center',
  panel: 'status',
  label: '房间中央',
  buttonLabel: '回房间中央',
  hotspot: { x: 45, y: 82 },
  petFoot: { x: 45, y: 82 },
  petLocation: 'center',
} satisfies RoomArea

export function areaForPanel(panel: PanelId) {
  return ROOM_AREAS.find((area) => area.panel === panel) ?? DEFAULT_ROOM_AREA
}

export function areaForActivity(kind: ActivityKind) {
  if (kind === 'travel') return ROOM_AREAS.find((area) => area.id === 'door')!
  if (kind === 'music') return ROOM_AREAS.find((area) => area.id === 'keyboard')!
  if (kind === 'rest') return ROOM_AREAS.find((area) => area.id === 'bed')!
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
