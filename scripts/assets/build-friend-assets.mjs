import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const sourcePath = resolve(
  workspaceRoot,
  'resources/raw/travelling-bingo/generated/friend-atlas-v3.png',
)
const outputRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public/assets/friends')
const dataPath = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public/data/friends.json')

const friends = [
  {
    id: 'class-representative-bing',
    name: '课代饼',
    kind: 'human-like',
    description: '戴着红色圆框眼镜、认真又可靠的课代饼。',
  },
  {
    id: 'san-hao-rabbit',
    name: '三好兔',
    kind: 'rabbit',
    description: '暖米色、安静温柔的三好兔。',
  },
  {
    id: 'xin-hao-rabbit',
    name: '心好兔',
    kind: 'rabbit',
    description: '额前有粉色小云、胸前带着爱心的心好兔。',
  },
  {
    id: 'signal-dog',
    name: '信号狗',
    kind: 'dog',
    description: '粉白相间、耳朵里藏着信号纹样的信号狗。',
  },
  {
    id: 'bili-bing',
    name: '饼哩饼哩',
    kind: 'human-like',
    description: '粉色头发、白色垂耳，总爱眨眨眼的饼哩饼哩。',
  },
]

const CARD_CROP_INSETS = [
  { left: 24, right: 24 },
  { left: 24, right: 24 },
  { left: 24, right: 24 },
  { left: 10, right: 20 },
  { left: 2, right: 24 },
]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const sourceBytes = await readFile(sourcePath)
const sourceMetadata = await sharp(sourceBytes, { failOn: 'warning' }).metadata()
if (
  sourceMetadata.format !== 'png' ||
  sourceMetadata.width !== 1881 ||
  sourceMetadata.height !== 836
) {
  throw new Error('friend-atlas-v3.png 的尺寸或格式与已验收母版不一致')
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(outputRoot, { recursive: true })

const items = []
for (const [index, friend] of friends.entries()) {
  const cellLeft = Math.floor((sourceMetadata.width * index) / friends.length)
  const cellRight = Math.floor((sourceMetadata.width * (index + 1)) / friends.length)
  const cellWidth = cellRight - cellLeft
  const cropInsets = CARD_CROP_INSETS[index]
  const filename = `${friend.id}.webp`
  const outputPath = resolve(outputRoot, filename)

  // 前三格统一内缩 24px；后两格按主体安全边界放宽，既去掉纸卡竖线，也完整保留耳朵和头发。
  const result = await sharp(sourceBytes)
    .extract({
      left: cellLeft + cropInsets.left,
      top: 148,
      width: cellWidth - cropInsets.left - cropInsets.right,
      height: 550,
    })
    .resize({ width: 360, height: 560, fit: 'cover', position: 'centre' })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toFile(outputPath)
  const outputBytes = await readFile(outputPath)

  items.push({
    ...friend,
    alt: `${friend.name}的暖色手绘朋友卡`,
    image: {
      path: `assets/friends/${filename}`,
      width: result.width,
      height: result.height,
      byteLength: outputBytes.byteLength,
      mime: 'image/webp',
      sha256: sha256(outputBytes),
    },
    sourceCell: index + 1,
  })
}

await writeFile(
  dataPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedFrom: 'imagegen-friend-atlas-v3',
      generatedAt: '2026-08-08',
      rights: 'user-confirmed-authorized',
      source: {
        path: 'resources/raw/travelling-bingo/generated/friend-atlas-v3.png',
        width: sourceMetadata.width,
        height: sourceMetadata.height,
        byteLength: sourceBytes.byteLength,
        mime: 'image/png',
        sha256: sha256(sourceBytes),
        generation: {
          tool: 'OpenAI built-in ImageGen',
          mode: 'multi-reference identity-preserve',
          promptSummary:
            '严格参考课代饼、三好兔、心好兔、信号狗和饼哩饼哩的已有设定，统一成五格暖色纸张角色图鉴；每位角色完整显示双手与双脚，不含文字或额外角色。',
        },
      },
      itemCount: items.length,
      items,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`好友图鉴素材已生成：${items.length} 张 360×560 WebP`)
