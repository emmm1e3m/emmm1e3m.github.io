import type { WardrobeTransform } from '@/domain/game/types'

export const FALLBACK_PHOTO_ASPECT_RATIO = 4 / 3
export const PHOTO_DOWNLOAD_LONG_EDGE = 2400

export interface GeometrySize {
  width: number
  height: number
}

export interface GeometryRect extends GeometrySize {
  x: number
  y: number
}

export function photoAspectRatio(source?: GeometrySize | null) {
  return source && source.width > 0 && source.height > 0
    ? source.width / source.height
    : FALLBACK_PHOTO_ASPECT_RATIO
}

/** 导出时保持明信片比例，横图和竖图都以长边为指定像素。 */
export function photoCanvasSize(
  source?: GeometrySize | null,
  longEdge = PHOTO_DOWNLOAD_LONG_EDGE,
): GeometrySize {
  const aspectRatio = photoAspectRatio(source)
  if (aspectRatio >= 1) {
    return { width: longEdge, height: Math.max(1, Math.round(longEdge / aspectRatio)) }
  }
  return { width: Math.max(1, Math.round(longEdge * aspectRatio)), height: longEdge }
}

/** 人物两轴尺寸都以照片宽度为基准；两轴相等时保持角色素材的天然宽高比。 */
export function participantRect(
  transform: Pick<WardrobeTransform, 'x' | 'y' | 'scaleX' | 'scaleY'>,
  photo: GeometrySize,
  aspectRatio = 1,
): GeometryRect {
  const width = photo.width * transform.scaleX
  const height = aspectRatio > 0 ? (photo.width * transform.scaleY) / aspectRatio : width
  return {
    x: photo.width * transform.x - width / 2,
    y: photo.height * transform.y - height / 2,
    width,
    height,
  }
}

/** 元素两轴尺寸都以所属画布宽度为基准，aspectRatio 为素材天然宽高比。 */
export function wardrobeElementRect(
  transform: Pick<WardrobeTransform, 'x' | 'y' | 'scaleX' | 'scaleY'>,
  parent: GeometryRect,
  aspectRatio = 1,
): GeometryRect {
  const width = parent.width * transform.scaleX
  const height = aspectRatio > 0 ? (parent.width * transform.scaleY) / aspectRatio : width
  return {
    x: parent.x + parent.width * transform.x - width / 2,
    y: parent.y + parent.height * transform.y - height / 2,
    width,
    height,
  }
}

export function rotationRadians(rotation: number) {
  return (rotation * Math.PI) / 180
}
