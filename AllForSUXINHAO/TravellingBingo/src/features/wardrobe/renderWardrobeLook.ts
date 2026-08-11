import type { WardrobeElement, WardrobeTargetId } from '@/domain/game/types'

import { rotationRadians, wardrobeElementRect } from './photoGeometry'
import { getWardrobeAssetVisual, getWardrobeTargetVisual } from './wardrobeAssets'

export const WARDROBE_LOOK_DOWNLOAD_SIZE = 2048

type DrawableImage = CanvasImageSource & { width: number; height: number }

export interface RenderWardrobeLookDependencies {
  createCanvas?: (width: number, height: number) => HTMLCanvasElement
  loadImage?: (url: string) => Promise<DrawableImage>
  size?: number
}

export interface DownloadWardrobeLookDependencies extends RenderWardrobeLookDependencies {
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
  createDownloadLink?: () => HTMLAnchorElement
  scheduleRevoke?: (callback: () => void) => void
  fileName?: string
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
    image.onerror = () => reject(new Error(`无法载入造型素材：${url}`))
    image.src = url
  })
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('浏览器没有生成透明造型 PNG'))
    }, 'image/png')
  })
}

function containedImageFrame(image: DrawableImage, size: number) {
  const ratio = Math.min(size / image.width, size / image.height)
  const width = image.width * ratio
  const height = image.height * ratio
  return {
    x: (size - width) / 2,
    y: (size - height) / 2,
    width,
    height,
  }
}

function defaultFileName(targetId: WardrobeTargetId) {
  return `奇迹饼狗-${getWardrobeTargetVisual(targetId).name}-透明造型.png`
}

export async function renderWardrobeLook(
  targetId: WardrobeTargetId,
  elements: readonly WardrobeElement[],
  options: RenderWardrobeLookDependencies = {},
): Promise<HTMLCanvasElement> {
  const size = options.size ?? WARDROBE_LOOK_DOWNLOAD_SIZE
  const createCanvas = options.createCanvas ?? defaultCreateCanvas
  const loadImage = options.loadImage ?? defaultLoadImage
  const canvas = createCanvas(size, size)
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器不支持透明造型画布')

  // 自定义画布可能被复用，先清空以保证导出背景仍为透明。
  context.clearRect(0, 0, size, size)

  const targetVisual = getWardrobeTargetVisual(targetId)
  const targetImage = await loadImage(targetVisual.url)
  const loadedElements = await Promise.all(
    elements.map(async (element, index) => ({
      element,
      index,
      image: await loadImage(getWardrobeAssetVisual(element.assetId).url),
    })),
  )
  loadedElements.sort((left, right) => left.element.z - right.element.z || left.index - right.index)

  const canvasFrame = { x: 0, y: 0, width: size, height: size }
  const drawElement = ({ element, image }: (typeof loadedElements)[number]) => {
    const frame = wardrobeElementRect(element, canvasFrame, image.width / image.height)
    context.save()
    context.translate(frame.x + frame.width / 2, frame.y + frame.height / 2)
    context.rotate(rotationRadians(element.rotation))
    context.drawImage(image, -frame.width / 2, -frame.height / 2, frame.width, frame.height)
    context.restore()
  }

  loadedElements.filter(({ element }) => element.z < 0).forEach(drawElement)
  const targetFrame = containedImageFrame(targetImage, size)
  context.drawImage(
    targetImage,
    targetFrame.x,
    targetFrame.y,
    targetFrame.width,
    targetFrame.height,
  )
  loadedElements.filter(({ element }) => element.z >= 0).forEach(drawElement)

  return canvas
}

export async function downloadWardrobeLook(
  targetId: WardrobeTargetId,
  elements: readonly WardrobeElement[],
  options: DownloadWardrobeLookDependencies = {},
): Promise<void> {
  const canvas = await renderWardrobeLook(targetId, elements, options)
  const blob = await canvasBlob(canvas)
  const createObjectURL = options.createObjectURL ?? URL.createObjectURL.bind(URL)
  const revokeObjectURL = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL)
  const link = options.createDownloadLink?.() ?? document.createElement('a')
  const url = createObjectURL(blob)
  try {
    link.href = url
    link.download = options.fileName ?? defaultFileName(targetId)
    link.click()
  } finally {
    const scheduleRevoke =
      options.scheduleRevoke ?? ((callback: () => void) => globalThis.setTimeout(callback, 0))
    scheduleRevoke(() => revokeObjectURL(url))
  }
}
