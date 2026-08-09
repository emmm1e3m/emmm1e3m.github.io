import type {
  ActivityKind,
  PetInterest,
  RoomArea as PetRoomLocation,
  WorldDimension,
} from '@/domain'

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
  | 'workComputer'
  | 'door'

export const ROOM_CANVAS = {
  width: 1098,
  height: 1433,
} as const

export interface RoomPixelPoint {
  x: number
  y: number
}

export function roomPointToPercent(point: RoomPixelPoint) {
  return {
    x: (point.x / ROOM_CANVAS.width) * 100,
    y: (point.y / ROOM_CANVAS.height) * 100,
  }
}

export interface RoomArea {
  id: RoomAreaId
  panel: PanelId
  label: string
  buttonLabel: string
  realityButtonLabel?: string
  hotspot: { x: number; y: number }
  /** 以 1098 × 1433 房屋母版为准的饼狗中心点像素坐标。 */
  petCenter: RoomPixelPoint
  activityKinds?: readonly ActivityKind[]
  interest?: PetInterest
  worlds?: readonly WorldDimension[]
  realityPanel?: PanelId
  petLocation: 'center' | PetRoomLocation
}

/**
 * 设施热点沿用原有百分比；饼狗位置只保存房屋母版像素，渲染时统一换算。
 */
export const ROOM_AREAS: readonly RoomArea[] = [
  {
    id: 'bed',
    panel: 'rest',
    label: '床铺',
    buttonLabel: '去床上',
    hotspot: { x: 22, y: 29 },
    petCenter: { x: 225, y: 300 },
    activityKinds: ['rest'],
    worlds: ['game'],
    petLocation: 'bed',
  },
  {
    id: 'computer',
    panel: 'computer',
    label: '电脑',
    buttonLabel: '去电脑前',
    hotspot: { x: 52, y: 29 },
    petCenter: { x: 504, y: 409 },
    activityKinds: ['stream', 'trend'],
    interest: 'computer',
    realityButtonLabel: '数据',
    realityPanel: 'reality-data',
    worlds: ['game', 'reality'],
    petLocation: 'computer',
  },
  {
    id: 'wardrobe',
    panel: 'wardrobe',
    label: '衣架',
    buttonLabel: '看看衣架',
    hotspot: { x: 54, y: 44 },
    petCenter: { x: 387, y: 675 },
    worlds: ['game'],
    petLocation: 'wardrobe',
  },
  {
    id: 'keyboard',
    panel: 'piano',
    label: '电子琴',
    buttonLabel: '弹弹琴',
    hotspot: { x: 17, y: 79 },
    petCenter: { x: 257, y: 1103 },
    activityKinds: ['music'],
    interest: 'music',
    worlds: ['game'],
    petLocation: 'piano',
  },
  {
    id: 'fridge',
    panel: 'fridge',
    label: '冰箱',
    buttonLabel: '打开冰箱',
    hotspot: { x: 50, y: 59 },
    petCenter: { x: 633, y: 951 },
    worlds: ['game'],
    petLocation: 'fridge',
  },
  {
    id: 'recordPlayer',
    panel: 'record-player',
    label: '唱片机',
    buttonLabel: '放张唱片',
    hotspot: { x: 75, y: 74 },
    petCenter: { x: 783, y: 1030 },
    interest: 'music',
    worlds: ['game', 'reality'],
    petLocation: 'record-player',
  },
  {
    id: 'album',
    panel: 'album',
    label: '收藏墙',
    buttonLabel: '看看收藏墙',
    hotspot: { x: 81, y: 60 },
    petCenter: { x: 673, y: 1053 },
    worlds: ['game'],
    petLocation: 'collection-wall',
  },
  {
    id: 'workComputer',
    panel: 'reality-work',
    label: '一楼电脑',
    buttonLabel: '工作',
    hotspot: { x: 38, y: 82 },
    petCenter: { x: 420, y: 1172 },
    worlds: ['reality'],
    petLocation: 'work-computer',
  },
  {
    id: 'door',
    panel: 'travel',
    label: '房门',
    buttonLabel: '去门口',
    hotspot: { x: 92, y: 74 },
    petCenter: { x: 980, y: 1176 },
    activityKinds: ['travel'],
    interest: 'travel',
    worlds: ['game'],
    petLocation: 'door',
  },
] as const

export const DEFAULT_ROOM_AREA = {
  id: 'center',
  panel: 'status',
  label: '房间中央',
  buttonLabel: '回房间中央',
  hotspot: { x: 45, y: 82 },
  petCenter: { x: 620, y: 1180 },
  petLocation: 'center',
} satisfies RoomArea

export function areaForPanel(panel: PanelId) {
  return (
    ROOM_AREAS.find((area) => area.panel === panel || area.realityPanel === panel) ??
    DEFAULT_ROOM_AREA
  )
}

export function roomAreaVisibleInWorld(area: RoomArea, world: WorldDimension) {
  return !area.worlds || area.worlds.includes(world)
}

export function roomAreaForWorld(area: RoomArea, world: WorldDimension): RoomArea {
  if (world !== 'reality') return area

  const panel = area.realityPanel ?? area.panel
  const buttonLabel = area.realityButtonLabel ?? area.buttonLabel
  if (panel === area.panel && buttonLabel === area.buttonLabel) return area
  return { ...area, panel, buttonLabel }
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
  'work-computer': 'workComputer',
  door: 'door',
}

export function roomAreaFromLocation(location: string): RoomArea {
  const areaId = LOCATION_TO_AREA[location] ?? 'center'
  return ROOM_AREAS.find((area) => area.id === areaId) ?? DEFAULT_ROOM_AREA
}
