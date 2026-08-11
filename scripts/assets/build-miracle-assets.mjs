import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import sharp from 'sharp'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const rawRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/generated/miracle')
const publicRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public')
const assetRoot = resolve(publicRoot, 'assets/miracle')
const characterRoot = resolve(assetRoot, 'characters')
const outfitRoot = resolve(assetRoot, 'outfits')
const accessoryRoot = resolve(assetRoot, 'accessories')
const friendRoot = resolve(publicRoot, 'assets/friends')
const catalogPath = resolve(publicRoot, 'data/miracle-wardrobe.json')

const sources = {
  bingo: 'exec-8b48c6b7-ef64-4d0f-8bc9-7b203ae98702.png',
  outfits: 'exec-48447d79-4359-4ac8-a211-ce93b1f9cff4.png',
  blackTieUniform: 'exec-91d985b4-1158-4a4b-8e81-94d9e8b541e0.png',
  accessories: 'exec-a348e66e-5aca-4fa3-872e-8e16f29e68cf.png',
}

const friendDefinitions = [
  { id: 'class-representative-bing', name: '课代饼' },
  { id: 'san-hao-rabbit', name: '三好兔' },
  { id: 'xin-hao-rabbit', name: '心好兔' },
  { id: 'signal-dog', name: '信号狗' },
  { id: 'bili-bing', name: '饼哩饼哩' },
]

export const OUTFIT_DEFINITIONS = [
  { id: 'green-sailor-top', name: '绿领结水手装', priceApples: 5 },
  { id: 'red-ruffle-dress', name: '红色荷叶边礼裙', priceApples: 6 },
  { id: 'monochrome-maid-dress', name: '黑白女仆裙', priceApples: 7 },
  { id: 'black-stage-suit', name: '黑色舞台礼服', priceApples: 7 },
  { id: 'black-tie-uniform', name: '黑色领带制服', priceApples: 5 },
  { id: 'blue-street-jacket', name: '蓝黑街头夹克', priceApples: 6 },
  { id: 'tan-bear-suit', name: '焦糖小熊装', priceApples: 7 },
  { id: 'cream-apple-cape', name: '奶油苹果斗篷', priceApples: 5 },
].map((item) => ({
  ...item,
  category: 'outfit',
  categoryName: '套装',
  starter: item.id === 'cream-apple-cape',
  defaultTransform: { x: 0.5, y: 0.76, scale: 0.48, rotation: 0, z: 20 },
}))

export const ACCESSORY_DEFINITIONS = [
  {
    id: 'round-glasses',
    name: '红色圆框眼镜',
    category: 'face',
    categoryName: '面饰',
    priceApples: 3,
    defaultTransform: { x: 0.5, y: 0.48, scale: 0.3, rotation: 0, z: 45 },
    lensTreatment: 'transparent-blue-with-white-highlight',
  },
  {
    id: 'square-glasses',
    name: '棕色方框眼镜',
    category: 'face',
    categoryName: '面饰',
    priceApples: 3,
    defaultTransform: { x: 0.5, y: 0.48, scale: 0.3, rotation: 0, z: 45 },
    lensTreatment: 'transparent-blue-with-white-highlight',
  },
  {
    id: 'maid-headband',
    name: '女仆头饰',
    category: 'headwear',
    categoryName: '头饰',
    priceApples: 4,
    defaultTransform: { x: 0.5, y: 0.18, scale: 0.3, rotation: 0, z: 40 },
  },
  {
    id: 'black-beret',
    name: '黑色贝雷帽',
    category: 'headwear',
    categoryName: '头饰',
    priceApples: 4,
    defaultTransform: { x: 0.5, y: 0.14, scale: 0.31, rotation: -3, z: 40 },
  },
  {
    id: 'cat-ears',
    name: '猫耳发箍',
    category: 'headwear',
    categoryName: '头饰',
    priceApples: 4,
    defaultTransform: { x: 0.5, y: 0.15, scale: 0.34, rotation: 0, z: 40 },
  },
  {
    id: 'microphone',
    name: '手持麦克风',
    category: 'prop',
    categoryName: '道具',
    priceApples: 6,
    defaultTransform: { x: 0.72, y: 0.7, scale: 0.22, rotation: -12, z: 30 },
  },
  {
    id: 'signal-sign',
    name: '信号手牌',
    category: 'prop',
    categoryName: '道具',
    priceApples: 6,
    defaultTransform: { x: 0.72, y: 0.64, scale: 0.21, rotation: 8, z: 30 },
  },
  {
    id: 'apple-cake',
    name: '苹果蛋糕',
    category: 'prop',
    categoryName: '道具',
    priceApples: 6,
    defaultTransform: { x: 0.5, y: 0.84, scale: 0.3, rotation: 0, z: 35 },
  },
  {
    id: 'paw-glove',
    name: '猫爪手套',
    category: 'prop',
    categoryName: '道具',
    priceApples: 4,
    defaultTransform: { x: 0.25, y: 0.7, scale: 0.18, rotation: -12, z: 30 },
  },
  {
    id: 'check-sign',
    name: '通过手牌',
    category: 'prop',
    categoryName: '道具',
    priceApples: 4,
    defaultTransform: { x: 0.72, y: 0.64, scale: 0.21, rotation: 8, z: 30 },
  },
  {
    id: 'cross-sign',
    name: '拒绝手牌',
    category: 'prop',
    categoryName: '道具',
    priceApples: 4,
    defaultTransform: { x: 0.72, y: 0.64, scale: 0.21, rotation: 8, z: 30 },
  },
  {
    id: 'dim-sum-basket',
    name: '点心蒸笼',
    category: 'prop',
    categoryName: '道具',
    priceApples: 6,
    defaultTransform: { x: 0.5, y: 0.84, scale: 0.3, rotation: 0, z: 35 },
  },
  {
    id: 'apple-cuffs',
    name: '苹果袖饰',
    category: 'accessory',
    categoryName: '配饰',
    priceApples: 4,
    defaultTransform: { x: 0.5, y: 0.74, scale: 0.34, rotation: 0, z: 28 },
  },
  {
    id: 'apple-badge',
    name: '苹果徽章',
    category: 'accessory',
    categoryName: '配饰',
    priceApples: 3,
    defaultTransform: { x: 0.67, y: 0.7, scale: 0.11, rotation: 0, z: 28 },
  },
  {
    id: 'black-fedora',
    name: '黑色礼帽',
    category: 'headwear',
    categoryName: '头饰',
    priceApples: 6,
    defaultTransform: { x: 0.5, y: 0.14, scale: 0.32, rotation: 0, z: 40 },
  },
  {
    id: 'red-bead-trim',
    name: '红珠蕾丝项饰',
    category: 'accessory',
    categoryName: '配饰',
    priceApples: 5,
    defaultTransform: { x: 0.5, y: 0.62, scale: 0.32, rotation: 0, z: 28 },
  },
].map((item) => ({ ...item, starter: false }))

const outfitSheetIndexById = new Map([
  ['green-sailor-top', 0],
  ['red-ruffle-dress', 1],
  ['monochrome-maid-dress', 2],
  ['black-stage-suit', 3],
  ['blue-street-jacket', 5],
  ['tan-bear-suit', 6],
  ['cream-apple-cape', 7],
])

const accessorySheetIndexById = new Map([
  ['paw-glove', 0],
  ['microphone', 1],
  ['check-sign', 2],
  ['cross-sign', 3],
  ['signal-sign', 4],
  ['dim-sum-basket', 5],
  ['apple-cake', 6],
  ['cat-ears', 7],
  ['apple-cuffs', 8],
  ['round-glasses', 9],
  ['square-glasses', 10],
  ['maid-headband', 11],
  ['apple-badge', 12],
  ['black-beret', 13],
  ['black-fedora', 14],
  ['red-bead-trim', 15],
])

const keyModes = {
  blue: {
    core: (r, g, b) => b >= 205 && r <= 70 && b - r >= 135 && b - g >= 85,
    soft: (r, g, b) => b >= 115 && b - r >= 55 && b - g >= 35,
    globalCore: true,
    strength: (r, g, b) =>
      Math.max(0, Math.min(1, (b - Math.max(r, g) - 20) / 100)) *
      Math.max(0, Math.min(1, (b - 80) / 150)),
    despill: (r, g, b) => [r, g, Math.min(b, Math.max(r, g) + 20)],
  },
  green: {
    core: (r, g, b) => g >= 205 && g - r >= 115 && g - b >= 115,
    soft: (r, g, b) => g >= 115 && g - r >= 50 && g - b >= 50,
    globalCore: true,
    strength: (r, g, b) =>
      Math.max(0, Math.min(1, (g - Math.max(r, b) - 20) / 100)) *
      Math.max(0, Math.min(1, (g - 80) / 150)),
    despill: (r, g, b) => [r, Math.min(g, Math.max(r, b) + 20), b],
  },
  cream: {
    core: (r, g, b) => r >= 235 && g >= 225 && b >= 205 && r - g <= 28 && g - b <= 38,
    soft: (r, g, b) => r >= 195 && g >= 182 && b >= 160 && r - g <= 48 && g - b <= 55,
    globalCore: false,
    strength: (r, g, b) => {
      const lightness = Math.max(0, Math.min(1, (Math.min(r, g, b) - 150) / 90))
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      return lightness * Math.max(0, Math.min(1, (80 - spread) / 60))
    },
    despill: (r, g, b) => [r, g, b],
  },
}

export function removeBoundaryBackground(input, width, height, mode) {
  if (!Buffer.isBuffer(input) || input.length !== width * height * 4) {
    throw new Error('背景抠除输入必须是完整 RGBA 像素缓冲区')
  }
  const keyMode = keyModes[mode]
  if (!keyMode) throw new Error(`不支持的色键模式：${mode}`)

  const output = Buffer.from(input)
  const pixelCount = width * height
  const background = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  let queueStart = 0
  let queueEnd = 0

  const enqueue = (pixelIndex) => {
    if (background[pixelIndex] === 1) return
    const offset = pixelIndex * 4
    if (
      output[offset + 3] !== 0 &&
      !keyMode.core(output[offset], output[offset + 1], output[offset + 2])
    ) {
      return
    }
    background[pixelIndex] = 1
    queue[queueEnd] = pixelIndex
    queueEnd += 1
  }

  if (keyMode.globalCore) {
    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) enqueue(pixelIndex)
  } else {
    for (let x = 0; x < width; x += 1) {
      enqueue(x)
      enqueue((height - 1) * width + x)
    }
    for (let y = 1; y < height - 1; y += 1) {
      enqueue(y * width)
      enqueue(y * width + width - 1)
    }

    while (queueStart < queueEnd) {
      const pixelIndex = queue[queueStart]
      queueStart += 1
      const x = pixelIndex % width
      const y = Math.floor(pixelIndex / width)
      if (x > 0) enqueue(pixelIndex - 1)
      if (x + 1 < width) enqueue(pixelIndex + 1)
      if (y > 0) enqueue(pixelIndex - width)
      if (y + 1 < height) enqueue(pixelIndex + width)
    }
  }

  const distance = new Uint8Array(pixelCount)
  queueStart = 0
  queueEnd = 0
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (background[pixelIndex] !== 1) continue
    distance[pixelIndex] = 1
    queue[queueEnd] = pixelIndex
    queueEnd += 1
  }
  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart]
    queueStart += 1
    const layer = distance[pixelIndex]
    if (layer >= 3) continue
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    for (const neighbour of [
      x > 0 ? pixelIndex - 1 : -1,
      x + 1 < width ? pixelIndex + 1 : -1,
      y > 0 ? pixelIndex - width : -1,
      y + 1 < height ? pixelIndex + width : -1,
    ]) {
      if (neighbour < 0 || distance[neighbour] !== 0) continue
      distance[neighbour] = layer + 1
      queue[queueEnd] = neighbour
      queueEnd += 1
    }
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const offset = pixelIndex * 4
    if (background[pixelIndex] === 1) {
      output[offset] = 0
      output[offset + 1] = 0
      output[offset + 2] = 0
      output[offset + 3] = 0
      continue
    }
    const layer = distance[pixelIndex]
    if (
      layer < 2 ||
      layer > 3 ||
      !keyMode.soft(output[offset], output[offset + 1], output[offset + 2])
    ) {
      continue
    }
    const distanceFactor = layer === 2 ? 1 : 0.45
    const removalStrength =
      keyMode.strength(output[offset], output[offset + 1], output[offset + 2]) * distanceFactor
    if (removalStrength <= 0) continue
    output[offset + 3] = Math.round(output[offset + 3] * (1 - removalStrength))
    const [r, g, b] = keyMode.despill(output[offset], output[offset + 1], output[offset + 2])
    output[offset] = r
    output[offset + 1] = g
    output[offset + 2] = b
    if (output[offset + 3] === 0) {
      output[offset] = 0
      output[offset + 1] = 0
      output[offset + 2] = 0
    }
  }
  return output
}

export function splitGridComponents(input, width, height, columns, rows) {
  if (!Buffer.isBuffer(input) || input.length !== width * height * 4) {
    throw new Error('连通组件输入必须是完整 RGBA 像素缓冲区')
  }
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new Error('素材网格行列必须是正整数')
  }
  const pixelCount = width * height
  const visited = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  const groups = Array.from({ length: columns * rows }, () => [])

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] === 1 || input[start * 4 + 3] === 0) continue
    let queueStart = 0
    let queueEnd = 0
    const component = {
      pixels: [],
      sumX: 0,
      sumY: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
    }
    visited[start] = 1
    queue[queueEnd] = start
    queueEnd += 1

    while (queueStart < queueEnd) {
      const pixelIndex = queue[queueStart]
      queueStart += 1
      const x = pixelIndex % width
      const y = Math.floor(pixelIndex / width)
      component.pixels.push(pixelIndex)
      component.sumX += x
      component.sumY += y
      component.minX = Math.min(component.minX, x)
      component.minY = Math.min(component.minY, y)
      component.maxX = Math.max(component.maxX, x)
      component.maxY = Math.max(component.maxY, y)
      for (const neighbour of [
        x > 0 ? pixelIndex - 1 : -1,
        x + 1 < width ? pixelIndex + 1 : -1,
        y > 0 ? pixelIndex - width : -1,
        y + 1 < height ? pixelIndex + width : -1,
        x > 0 && y > 0 ? pixelIndex - width - 1 : -1,
        x + 1 < width && y > 0 ? pixelIndex - width + 1 : -1,
        x > 0 && y + 1 < height ? pixelIndex + width - 1 : -1,
        x + 1 < width && y + 1 < height ? pixelIndex + width + 1 : -1,
      ]) {
        if (neighbour < 0 || visited[neighbour] === 1 || input[neighbour * 4 + 3] === 0) {
          continue
        }
        visited[neighbour] = 1
        queue[queueEnd] = neighbour
        queueEnd += 1
      }
    }
    if (component.pixels.length < 4) continue
    const centerX = component.sumX / component.pixels.length
    const centerY = component.sumY / component.pixels.length
    const column = Math.min(columns - 1, Math.floor((centerX * columns) / width))
    const row = Math.min(rows - 1, Math.floor((centerY * rows) / height))
    groups[row * columns + column].push(component)
  }

  return groups.map((components, index) => {
    if (components.length === 0) throw new Error(`素材网格第 ${index + 1} 格没有可见主体`)
    const largestSize = Math.max(...components.map((component) => component.pixels.length))
    const minimumSize = Math.max(4, Math.ceil(largestSize * 0.0002))
    const kept = components.filter((component) => component.pixels.length >= minimumSize)
    const minX = Math.min(...kept.map((component) => component.minX))
    const minY = Math.min(...kept.map((component) => component.minY))
    const maxX = Math.max(...kept.map((component) => component.maxX))
    const maxY = Math.max(...kept.map((component) => component.maxY))
    const itemWidth = maxX - minX + 1
    const itemHeight = maxY - minY + 1
    const output = Buffer.alloc(itemWidth * itemHeight * 4)
    for (const component of kept) {
      for (const pixelIndex of component.pixels) {
        const sourceX = pixelIndex % width
        const sourceY = Math.floor(pixelIndex / width)
        const sourceOffset = pixelIndex * 4
        const targetOffset = ((sourceY - minY) * itemWidth + sourceX - minX) * 4
        input.copy(output, targetOffset, sourceOffset, sourceOffset + 4)
      }
    }
    return { data: output, width: itemWidth, height: itemHeight }
  })
}

export function makeBlueLensesTransparent(input, width, height) {
  if (!Buffer.isBuffer(input) || input.length !== width * height * 4) {
    throw new Error('镜片处理输入必须是完整 RGBA 像素缓冲区')
  }
  const output = Buffer.from(input)
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] === 0) continue
    const r = output[offset]
    const g = output[offset + 1]
    const b = output[offset + 2]
    if (r >= 100 && g >= 130 && b >= 170 && b - g < 90 && g - r < 100) {
      const highlight = Math.round((r + g + b) / 3)
      output[offset] = highlight
      output[offset + 1] = highlight
      output[offset + 2] = highlight
      continue
    }
    if (b >= 70 && b - r >= 28 && b - g >= 14) {
      output[offset] = 0
      output[offset + 1] = 0
      output[offset + 2] = 0
      output[offset + 3] = 0
    }
  }
  return output
}

function findVisibleBounds(data, width, height) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('色键处理后没有留下可见主体')
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

async function transparentWebpFromRaw(
  data,
  width,
  height,
  outputPath,
  canvasSize,
  padding,
  finalDespill,
) {
  const bounds = findVisibleBounds(data, width, height)
  const cropped = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract(bounds)
    .png()
    .toBuffer()
  const maximumSize = canvasSize - padding * 2
  const { data: resized, info } = await sharp(cropped)
    .resize({
      width: maximumSize,
      height: maximumSize,
      fit: 'inside',
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const canvas = Buffer.alloc(canvasSize * canvasSize * 4)
  const offsetX = Math.round((canvasSize - info.width) / 2)
  const offsetY = Math.round((canvasSize - info.height) / 2)
  for (let y = 0; y < info.height; y += 1) {
    const sourceStart = y * info.width * 4
    const targetStart = ((y + offsetY) * canvasSize + offsetX) * 4
    resized.copy(canvas, targetStart, sourceStart, sourceStart + info.width * 4)
  }
  const matteReference = Buffer.from(canvas)
  for (let offset = 0; offset < canvas.length; offset += 4) {
    const pixelIndex = offset / 4
    const x = pixelIndex % canvasSize
    const y = Math.floor(pixelIndex / canvasSize)
    const nearTransparency =
      canvas[offset + 3] < 250 ||
      [
        x > 0 ? pixelIndex - 1 : -1,
        x + 1 < canvasSize ? pixelIndex + 1 : -1,
        y > 0 ? pixelIndex - canvasSize : -1,
        y + 1 < canvasSize ? pixelIndex + canvasSize : -1,
      ].some((neighbour) => neighbour >= 0 && matteReference[neighbour * 4 + 3] === 0)
    if (finalDespill === 'green' && canvas[offset + 3] !== 0) {
      const maximumOtherChannel = Math.max(canvas[offset], canvas[offset + 2])
      const excess = canvas[offset + 1] - maximumOtherChannel
      if (excess > 12) {
        if (canvas[offset + 3] < 48) canvas[offset + 3] = 0
        else canvas[offset + 1] = maximumOtherChannel + 4
      }
    } else if (finalDespill === 'blue' && canvas[offset + 3] !== 0 && nearTransparency) {
      const maximumOtherChannel = Math.max(canvas[offset], canvas[offset + 1])
      const excess = canvas[offset + 2] - maximumOtherChannel
      if (excess > 12) {
        if (canvas[offset + 3] < 48) canvas[offset + 3] = 0
        else canvas[offset + 2] = maximumOtherChannel + 4
      }
    }
    if (canvas[offset + 3] === 0) {
      canvas[offset] = 0
      canvas[offset + 1] = 0
      canvas[offset + 2] = 0
    }
  }
  const result = await sharp(canvas, {
    raw: { width: canvasSize, height: canvasSize, channels: 4 },
  })
    .webp({ lossless: true, exact: true, effort: 6 })
    .toFile(outputPath)
  return {
    width: result.width,
    height: result.height,
    byteLength: result.size,
    mime: 'image/webp',
    encoding: 'lossless',
  }
}

async function readKeyedImage(sourcePath, mode) {
  const { data, info } = await sharp(sourcePath, { failOn: 'warning' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    data: removeBoundaryBackground(data, info.width, info.height, mode),
    width: info.width,
    height: info.height,
  }
}

function publicItem(definition, folder, image) {
  return {
    ...definition,
    url: `assets/miracle/${folder}/${definition.id}.webp`,
    ...image,
  }
}

async function buildMiracleAssets() {
  await Promise.all([
    mkdir(characterRoot, { recursive: true }),
    mkdir(outfitRoot, { recursive: true }),
    mkdir(accessoryRoot, { recursive: true }),
  ])
  await Promise.all([
    rm(characterRoot, { recursive: true, force: true }),
    rm(outfitRoot, { recursive: true, force: true }),
    rm(accessoryRoot, { recursive: true, force: true }),
  ])
  await Promise.all([
    mkdir(characterRoot, { recursive: true }),
    mkdir(outfitRoot, { recursive: true }),
    mkdir(accessoryRoot, { recursive: true }),
  ])

  const bingoSource = await readKeyedImage(resolve(rawRoot, sources.bingo), 'blue')
  const bingoImage = await transparentWebpFromRaw(
    bingoSource.data,
    bingoSource.width,
    bingoSource.height,
    resolve(characterRoot, 'bingo.webp'),
    768,
    34,
    'blue',
  )
  const characters = [
    {
      id: 'bingo',
      name: '饼狗',
      url: 'assets/miracle/characters/bingo.webp',
      ...bingoImage,
    },
  ]

  for (const friend of friendDefinitions) {
    const source = await readKeyedImage(resolve(friendRoot, `${friend.id}.webp`), 'cream')
    const image = await transparentWebpFromRaw(
      source.data,
      source.width,
      source.height,
      resolve(characterRoot, `${friend.id}.webp`),
      768,
      34,
    )
    characters.push({
      ...friend,
      url: `assets/miracle/characters/${friend.id}.webp`,
      ...image,
    })
  }

  const outfitSheet = await readKeyedImage(resolve(rawRoot, sources.outfits), 'blue')
  const outfitCells = splitGridComponents(
    outfitSheet.data,
    outfitSheet.width,
    outfitSheet.height,
    4,
    2,
  )
  const blackTieUniform = await readKeyedImage(resolve(rawRoot, sources.blackTieUniform), 'green')
  const outfits = []
  for (const definition of OUTFIT_DEFINITIONS) {
    const sheetIndex = outfitSheetIndexById.get(definition.id)
    const cell =
      definition.id === 'black-tie-uniform'
        ? blackTieUniform
        : sheetIndex === undefined
          ? null
          : outfitCells[sheetIndex]
    if (!cell) throw new Error(`${definition.id} 没有对应的服装母版位置`)
    const image = await transparentWebpFromRaw(
      cell.data,
      cell.width,
      cell.height,
      resolve(outfitRoot, `${definition.id}.webp`),
      512,
      24,
      definition.id === 'black-tie-uniform' ? 'green' : 'blue',
    )
    outfits.push(publicItem(definition, 'outfits', image))
  }

  const accessorySheet = await readKeyedImage(resolve(rawRoot, sources.accessories), 'blue')
  const accessoryCells = splitGridComponents(
    accessorySheet.data,
    accessorySheet.width,
    accessorySheet.height,
    4,
    4,
  )
  const accessories = []
  for (const definition of ACCESSORY_DEFINITIONS) {
    const sheetIndex = accessorySheetIndexById.get(definition.id)
    if (sheetIndex === undefined) throw new Error(`${definition.id} 没有对应的配饰母版位置`)
    const sourceCell = accessoryCells[sheetIndex]
    const cell = definition.lensTreatment
      ? {
          ...sourceCell,
          data: makeBlueLensesTransparent(sourceCell.data, sourceCell.width, sourceCell.height),
        }
      : sourceCell
    const image = await transparentWebpFromRaw(
      cell.data,
      cell.width,
      cell.height,
      resolve(accessoryRoot, `${definition.id}.webp`),
      512,
      24,
      'blue',
    )
    accessories.push(publicItem(definition, 'accessories', image))
  }

  const sourceMetadata = {}
  for (const [id, filename] of Object.entries(sources)) {
    const bytes = await readFile(resolve(rawRoot, filename))
    const metadata = await sharp(bytes, { failOn: 'warning' }).metadata()
    sourceMetadata[id] = {
      path: `resources/raw/travelling-bingo/generated/miracle/${filename}`,
      width: metadata.width,
      height: metadata.height,
      byteLength: bytes.byteLength,
      mime: 'image/png',
    }
  }

  await writeFile(
    catalogPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: '2026-08-11',
        rights: 'user-confirmed-authorized',
        processing: {
          tool: 'sharp',
          mode: 'soft-chroma-key-component-grid-cutout',
          transparentPixelRgb: '000000',
          outputEncoding: 'lossless-webp',
        },
        sources: {
          ...sourceMetadata,
          provenance: {
            bingo: '用户从参考图引导的 ImageGen 结果中选定的海星体饼狗底稿',
            outfits: '按用户服装参考图生成的 4×2 海星体服装母版；保留其中 7 套已确认服装',
            blackTieUniform:
              '以用户服装参考图、已确认服装母版和饼狗比例为参考，单独生成黑色领带制服',
            accessories: '按用户配饰参考图生成的 4×4 十六件配饰母版',
          },
        },
        characters,
        outfits,
        accessories,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    `奇迹饼狗素材已生成：${characters.length} 个角色、${outfits.length} 套服装、${accessories.length} 件配饰`,
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) await buildMiracleAssets()
