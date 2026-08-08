import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const rawRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/generated')
const outputRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public/assets/game')
const dataPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/demo-visuals.json',
)

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const roomInput = resolve(rawRoot, 'chan-chan-house-v1.png')
const roomImages = []
for (const width of [960, 1536]) {
  const filename = `chan-chan-house-${width}.webp`
  const result = await sharp(roomInput)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 88, effort: 6, smartSubsample: true })
    .toFile(resolve(outputRoot, filename))
  roomImages.push({
    width: result.width,
    height: result.height,
    path: `assets/game/${filename}`,
    byteLength: result.size,
    mime: 'image/webp',
  })
}

const spriteInput = resolve(rawRoot, 'bingo-sprites-transparent-v2.png')
const spriteResult = await sharp(spriteInput)
  .resize({ width: 1024, height: 1024, fit: 'fill' })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(resolve(outputRoot, 'bingo-sprites-v2.webp'))

await writeFile(
  dataPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      rights: 'user-confirmed-authorized',
      generatedAt: '2026-08-08',
      room: {
        alt: '阳光下的两层铲铲饼屋，包含床、电脑、衣架、电子琴、唱片机、冰箱、展示墙和出口',
        images: roomImages,
      },
      mascotSprites: {
        alt: '戴红色苹果头套的白色小狗饼狗四种状态',
        layout: { columns: 2, rows: 2 },
        poses: ['idle', 'travel', 'stream', 'celebrate'],
        image: {
          width: spriteResult.width,
          height: spriteResult.height,
          path: 'assets/game/bingo-sprites-v2.webp',
          byteLength: spriteResult.size,
          mime: 'image/webp',
        },
      },
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log('Demo 视觉素材已生成：铲铲饼屋双尺寸与饼狗四态透明精灵')
