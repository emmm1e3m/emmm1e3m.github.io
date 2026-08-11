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

/** participant.scale 直接表示角色局部正方形占整张照片宽度的比例。 */
export function participantRect(
  transform: Pick<WardrobeTransform, 'x' | 'y' | 'scale'>,
  photo: GeometrySize,
): GeometryRect {
  const size = photo.width * transform.scale
  return {
    x: photo.width * transform.x - size / 2,
    y: photo.height * transform.y - size / 2,
    width: size,
    height: size,
  }
}

/** 元素坐标属于角色局部正方形；scale 表示素材宽度与局部画布宽度之比。 */
export function wardrobeElementRect(
  transform: Pick<WardrobeTransform, 'x' | 'y' | 'scale'>,
  participant: GeometryRect,
  aspectRatio = 1,
): GeometryRect {
  const width = participant.width * transform.scale
  const height = aspectRatio > 0 ? width / aspectRatio : width
  return {
    x: participant.x + participant.width * transform.x - width / 2,
    y: participant.y + participant.height * transform.y - height / 2,
    width,
    height,
  }
}

export function rotationRadians(rotation: number) {
  return (rotation * Math.PI) / 180
}
