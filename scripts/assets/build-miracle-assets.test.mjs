import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import sharp from 'sharp'

import {
  ACCESSORY_DEFINITIONS,
  OUTFIT_DEFINITIONS,
  makeBlueLensesTransparent,
  removeBoundaryBackground,
  splitGridComponents,
} from './build-miracle-assets.mjs'

function rgba(width, height, color) {
  const buffer = Buffer.alloc(width * height * 4)
  for (let offset = 0; offset < buffer.length; offset += 4) buffer.set(color, offset)
  return buffer
}

function setPixel(buffer, width, x, y, color) {
  buffer.set(color, (y * width + x) * 4)
}

function pixel(buffer, width, x, y) {
  return [...buffer.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
}

function countColor(buffer, color) {
  let count = 0
  for (let offset = 0; offset < buffer.length; offset += 4) {
    if (color.every((value, channel) => buffer[offset + channel] === value)) count += 1
  }
  return count
}

function parseDomainCatalog(source) {
  const details = source.match(
    /const WARDROBE_CATALOG_DETAILS:[\s\S]+?= \[([\s\S]+?)\]\s+as const/u,
  )?.[1]
  const transforms = source.match(
    /const WARDROBE_DEFAULT_TRANSFORM_BY_ID:[\s\S]+?= \{([\s\S]+?)\n\}/u,
  )?.[1]
  assert.ok(details && transforms, '无法从领域层读取衣柜 canonical 目录')
  const transformById = new Map(
    [
      ...transforms.matchAll(
        /(?:'([^']+)'|([a-z][a-z0-9-]*)):\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*scale:\s*(-?[\d.]+),\s*rotation:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/gu,
      ),
    ].map((match) => [
      match[1] ?? match[2],
      {
        x: Number(match[3]),
        y: Number(match[4]),
        scale: Number(match[5]),
        rotation: Number(match[6]),
        z: Number(match[7]),
      },
    ]),
  )
  const matches = [...details.matchAll(/\bid:\s*'([^']+)'/gu)]
  return matches.map((match, index) => {
    const chunk = details.slice(match.index, matches[index + 1]?.index ?? details.length)
    const readString = (field) => chunk.match(new RegExp(`${field}:\\s*'([^']+)'`, 'u'))?.[1]
    const readNumber = (field) =>
      Number(chunk.match(new RegExp(`${field}:\\s*(-?[\\d.]+)`, 'u'))?.[1])
    const defaultTransform = transformById.get(match[1])
    assert.ok(defaultTransform, `${match[1]} 缺少领域层默认变换`)
    return {
      id: match[1],
      name: readString('name'),
      category: readString('category'),
      priceApples: readNumber('priceApples'),
      starter: chunk.match(/starter:\s*(true|false)/u)?.[1] === 'true',
      defaultTransform,
    }
  })
}

test('蓝色色键清理外部与纯色孔洞，但保留被轮廓包围的非色键蓝色细节', () => {
  const width = 11
  const height = 11
  const keyBlue = [2, 95, 248, 255]
  const detailBlue = [45, 95, 180, 255]
  const outline = [70, 38, 25, 255]
  const fill = [180, 60, 50, 255]
  const input = rgba(width, height, keyBlue)
  for (let x = 1; x <= 9; x += 1) {
    setPixel(input, width, x, 1, outline)
    setPixel(input, width, x, 9, outline)
  }
  for (let y = 1; y <= 9; y += 1) {
    setPixel(input, width, 1, y, outline)
    setPixel(input, width, 9, y, outline)
  }
  for (let y = 2; y <= 8; y += 1) {
    for (let x = 2; x <= 8; x += 1) setPixel(input, width, x, y, fill)
  }
  setPixel(input, width, 3, 3, keyBlue)
  setPixel(input, width, 7, 7, detailBlue)

  const output = removeBoundaryBackground(input, width, height, 'blue')
  assert.deepEqual(pixel(output, width, 0, 0), [0, 0, 0, 0])
  assert.deepEqual(pixel(output, width, 3, 3), [0, 0, 0, 0])
  assert.deepEqual(pixel(output, width, 7, 7), detailBlue)
  assert.deepEqual(pixel(output, width, 1, 5), outline)
})

test('网格按完整组件归属切分，保留同格分离部件且不夹入相邻格', () => {
  const width = 16
  const height = 8
  const red = [200, 30, 30, 255]
  const black = [20, 20, 20, 255]
  const input = rgba(width, height, [0, 0, 0, 0])
  for (let y = 1; y <= 4; y += 1) {
    for (let x = 1; x <= 4; x += 1) setPixel(input, width, x, y, red)
    for (let x = 7; x <= 10; x += 1) setPixel(input, width, x, y, black)
  }
  for (let y = 6; y <= 7; y += 1) {
    for (let x = 1; x <= 2; x += 1) setPixel(input, width, x, y, red)
  }

  const [left, right] = splitGridComponents(input, width, height, 2, 1)
  assert.equal(countColor(left.data, red), 20)
  assert.equal(countColor(left.data, black), 0)
  assert.equal(countColor(right.data, black), 16)
  assert.equal(countColor(right.data, red), 0)
})

test('蓝色镜片变透明并保留白色高光与红色镜框', () => {
  const input = Buffer.from([0, 100, 250, 255, 245, 245, 245, 255, 200, 40, 30, 255])
  const output = makeBlueLensesTransparent(input, 3, 1)
  assert.deepEqual(pixel(output, 3, 0, 0), [0, 0, 0, 0])
  assert.deepEqual(pixel(output, 3, 1, 0), [245, 245, 245, 255])
  assert.deepEqual(pixel(output, 3, 2, 0), [200, 40, 30, 255])
})

test('衣柜目录与领域层 24 项 canonical 定义完全一致', async () => {
  const definitions = [...OUTFIT_DEFINITIONS, ...ACCESSORY_DEFINITIONS]
  assert.equal(definitions.length, 24)
  assert.equal(new Set(definitions.map((item) => item.id)).size, definitions.length)
  assert.ok(definitions.some((item) => item.id === 'black-tie-uniform'))
  assert.ok(definitions.every((item) => item.id !== 'black-bone-tee'))
  assert.equal(
    definitions.reduce((sum, item) => sum + item.priceApples, 0),
    120,
  )
  assert.equal(definitions.filter((item) => item.starter).length, 1)

  const domainSource = await readFile(
    'AllForSUXINHAO/TravellingBingo/src/domain/game/wardrobe.ts',
    'utf8',
  )
  const domainCatalog = parseDomainCatalog(domainSource)
  assert.deepEqual(
    definitions.map((item) => {
      const canonicalItem = { ...item }
      delete canonicalItem.categoryName
      delete canonicalItem.lensTreatment
      return canonicalItem
    }),
    domainCatalog,
  )

  const manifest = JSON.parse(
    await readFile('AllForSUXINHAO/TravellingBingo/public/data/miracle-wardrobe.json', 'utf8'),
  )
  const manifestItems = [...manifest.outfits, ...manifest.accessories]
  assert.deepEqual(
    manifestItems.map((item) => {
      const canonicalItem = { ...item }
      for (const field of [
        'url',
        'width',
        'height',
        'byteLength',
        'mime',
        'encoding',
        'categoryName',
        'lensTreatment',
      ]) {
        delete canonicalItem[field]
      }
      return canonicalItem
    }),
    domainCatalog,
  )
})

test('最终眼镜没有蓝色镜片，黑色领带制服没有可见绿幕边缘', async () => {
  const inspect = async (path) => {
    const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let bluePixels = 0
    let greenPixels = 0
    for (let offset = 0; offset < data.length; offset += 4) {
      const [r, g, b, a] = data.subarray(offset, offset + 4)
      if (a >= 8 && b >= 90 && b - r >= 30 && b - g >= 16) bluePixels += 1
      if (a >= 8 && g - r >= 20 && g - b >= 20) greenPixels += 1
    }
    return { bluePixels, greenPixels }
  }
  for (const id of ['round-glasses', 'square-glasses']) {
    const result = await inspect(
      `AllForSUXINHAO/TravellingBingo/public/assets/miracle/accessories/${id}.webp`,
    )
    assert.equal(result.bluePixels, 0, `${id} 仍有可见蓝色镜片`)
  }
  const uniform = await inspect(
    'AllForSUXINHAO/TravellingBingo/public/assets/miracle/outfits/black-tie-uniform.webp',
  )
  assert.equal(uniform.greenPixels, 0, '黑色领带制服仍有可见绿幕边缘')
})
