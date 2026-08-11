import { publicAsset } from '@/app/assets'
import type { CollectibleItem, ContentCatalog } from '@/content'
import type { WardrobePhoto } from '@/domain/game/types'

import {
  participantRect,
  photoAspectRatio,
  photoCanvasSize,
  rotationRadians,
} from './photoGeometry'
import { getWardrobeAssetVisual, getWardrobeTargetVisual } from './wardrobeAssets'

export const PHOTO_BACKGROUND_COLOR = '#fffaf2'

type DrawableImage = CanvasImageSource & { width: number; height: number }

export interface RenderPhotoDependencies {
  createCanvas?: (width: number, height: number) => HTMLCanvasElement
  loadImage?: (url: string) => Promise<DrawableImage>
}

export interface DownloadPhotoDependencies extends RenderPhotoDependencies {
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
  createDownloadLink?: () => HTMLAnchorElement
  scheduleRevoke?: (callback: () => void) => void
}

function defaultCreateCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function defaultLoadImage(url: string): Promise<DrawableImage> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`无法载入合拍素材：${url}`))
    image.src = url
  })
}

function postcardCandidates(item: CollectibleItem | undefined): string[] {
  if (!item || item.category !== 'postcard') return []
  const byPreferredWidth = [...item.images].sort((left, right) => {
    const leftRank = left.width === 960 ? 0 : left.width === 480 ? 1 : 2
    const rightRank = right.width === 960 ? 0 : right.width === 480 ? 1 : 2
    return leftRank - rightRank || right.width - left.width
  })
  return [...new Set(byPreferredWidth.map((image) => image.path))]
}

async function loadFirstAvailable(
  urls: readonly string[],
  loadImage: (url: string) => Promise<DrawableImage>,
) {
  for (const url of urls) {
    try {
      return await loadImage(url)
    } catch {
      // 明信片大图失败时自然回退到 480 版本；全部失败则保留暖白背景。
    }
  }
  return null
}

function photoFileName(photo: WardrobePhoto) {
  const date = new Date(photo.createdAt)
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value, index) => (index === 0 ? String(value) : String(value).padStart(2, '0')))
    .join('-')
  return `奇迹饼狗-${day}-${photo.photoId}.png`
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('浏览器没有生成合拍 PNG'))
    }, 'image/png')
  })
}

export function resolvePhotoPostcard(
  catalog: ContentCatalog,
  postcardId: string | null,
  preferredWidth = 960,
) {
  if (!postcardId) return null
  const item = catalog.byId[postcardId]
  if (!item || item.category !== 'postcard') return null
  const image =
    item.images.find((candidate) => candidate.width === preferredWidth) ??
    item.images.find((candidate) => candidate.width === 480) ??
    [...item.images].sort((left, right) => right.width - left.width)[0]
  if (!image) return null
  return { item, image }
}

export async function renderWardrobePhoto(
  photo: WardrobePhoto,
  catalog: ContentCatalog,
  options: RenderPhotoDependencies & { width?: number; height?: number } = {},
): Promise<HTMLCanvasElement> {
  const postcardSource = resolvePhotoPostcard(catalog, photo.postcardId)?.image ?? null
  const aspectRatio = photoAspectRatio(postcardSource)
  const defaultSize = photoCanvasSize(postcardSource)
  const width =
    options.width ??
    (options.height === undefined
      ? defaultSize.width
      : Math.max(1, Math.round(options.height * aspectRatio)))
  const height =
    options.height ??
    (options.width === undefined
      ? defaultSize.height
      : Math.max(1, Math.round(options.width / aspectRatio)))
  const createCanvas = options.createCanvas ?? defaultCreateCanvas
  const loadImage = options.loadImage ?? defaultLoadImage
  const canvas = createCanvas(width, height)
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持合拍画布')

  context.fillStyle = PHOTO_BACKGROUND_COLOR
  context.fillRect(0, 0, width, height)
  context.save()
  context.beginPath()
  context.rect(0, 0, width, height)
  context.clip()

  const postcardItem = photo.postcardId ? catalog.byId[photo.postcardId] : undefined
  const postcard = await loadFirstAvailable(
    postcardCandidates(postcardItem).map(publicAsset),
    loadImage,
  )
  if (postcard) {
    context.drawImage(postcard, 0, 0, width, height)
  }

  const participants = [...photo.participants].sort(
    (left, right) => left.z - right.z || left.targetId.localeCompare(right.targetId),
  )
  for (const participant of participants) {
    const frame = participantRect(participant, { width, height })
    const centerX = frame.x + frame.width / 2
    const centerY = frame.y + frame.height / 2
    const targetVisual = getWardrobeTargetVisual(participant.targetId)
    const targetImage = await loadImage(targetVisual.url)
    const elements = await Promise.all(
      participant.elements.map(async (element, index) => ({
        element,
        index,
        image: await loadImage(getWardrobeAssetVisual(element.assetId).url),
      })),
    )
    const sortedElements = elements.sort(
      (left, right) => left.element.z - right.element.z || left.index - right.index,
    )

    context.save()
    context.translate(centerX, centerY)
    context.rotate(rotationRadians(participant.rotation))

    const drawElement = ({ element, image }: (typeof sortedElements)[number]) => {
      const elementWidth = frame.width * element.scale
      const elementHeight = elementWidth * (image.height / image.width)
      const x = frame.width * (element.x - 0.5) - elementWidth / 2
      const y = frame.height * (element.y - 0.5) - elementHeight / 2
      context.save()
      context.translate(x + elementWidth / 2, y + elementHeight / 2)
      context.rotate(rotationRadians(element.rotation))
      context.drawImage(image, -elementWidth / 2, -elementHeight / 2, elementWidth, elementHeight)
      context.restore()
    }

    sortedElements.filter(({ element }) => element.z < 0).forEach(drawElement)
    context.drawImage(targetImage, -frame.width / 2, -frame.height / 2, frame.width, frame.height)
    sortedElements.filter(({ element }) => element.z >= 0).forEach(drawElement)
    context.restore()
  }

  context.restore()

  return canvas
}

export async function downloadWardrobePhoto(
  photo: WardrobePhoto,
  catalog: ContentCatalog,
  options: DownloadPhotoDependencies & { width?: number; height?: number } = {},
) {
  const canvas = await renderWardrobePhoto(photo, catalog, options)
  const blob = await canvasBlob(canvas)
  const createObjectURL = options.createObjectURL ?? URL.createObjectURL.bind(URL)
  const revokeObjectURL = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL)
  const link = options.createDownloadLink?.() ?? document.createElement('a')
  const url = createObjectURL(blob)
  try {
    link.href = url
    link.download = photoFileName(photo)
    link.click()
  } finally {
    const scheduleRevoke =
      options.scheduleRevoke ?? ((callback: () => void) => globalThis.setTimeout(callback, 0))
    scheduleRevoke(() => revokeObjectURL(url))
  }
}
