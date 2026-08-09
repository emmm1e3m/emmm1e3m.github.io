import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'
import { format } from 'prettier'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const rawRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/generated')
const outputRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public/assets/game')
const iconOutputRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public/icons')
const dataPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/demo-visuals.json',
)

const atlasCellSize = 512
const atlasFramePadding = 34

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function imageEntry(filename, result) {
  const bytes = await readFile(resolve(outputRoot, filename))
  return {
    width: result.width,
    height: result.height,
    path: `assets/game/${filename}`,
    byteLength: bytes.byteLength,
    mime: 'image/webp',
    sha256: sha256(bytes),
  }
}

async function iconEntry(filename, result) {
  const bytes = await readFile(resolve(iconOutputRoot, filename))
  return {
    width: result.width,
    height: result.height,
    path: `icons/${filename}`,
    byteLength: bytes.byteLength,
    mime: 'image/png',
    sha256: sha256(bytes),
  }
}

async function sourceImageEntry(filename) {
  const inputPath = resolve(rawRoot, filename)
  const bytes = await readFile(inputPath)
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata()
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
    throw new Error(`${filename} 不是有效的 PNG 母版`)
  }
  const entry = {
    width: metadata.width,
    height: metadata.height,
    path: `resources/raw/travelling-bingo/generated/${filename}`,
    byteLength: bytes.byteLength,
    mime: 'image/png',
    sha256: sha256(bytes),
    hasAlpha: metadata.hasAlpha === true,
  }
  if (metadata.hasAlpha === true) {
    const { channels } = await sharp(bytes, { failOn: 'warning' }).stats()
    entry.alphaRange = {
      min: channels[3].min,
      max: channels[3].max,
    }
  }
  return entry
}

async function extractIdleAvatar(inputPath) {
  const metadata = await sharp(inputPath, { failOn: 'warning' }).metadata()
  if (!metadata.width || !metadata.height || metadata.hasAlpha !== true) {
    throw new Error('饼狗图标源必须是带透明通道的有效图片')
  }

  const cell = {
    left: 0,
    top: 0,
    width: Math.floor(metadata.width / 2),
    height: Math.floor(metadata.height / 2),
  }
  // 原始 2×2 参考图的 idle 姿态向下越过理论分格 12px；取到下一姿态前的透明分隔带，
  // 才能完整保留脚部，不在应用图标中留下水平截断。
  const sourceRegion = {
    left: cell.left,
    top: cell.top,
    width: cell.width,
    height: Math.min(metadata.height, 700),
  }
  const { data, info } = await sharp(inputPath)
    .extract(sourceRegion)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha <= 4) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('饼狗图标源的 idle 帧为空')

  // 只按透明边界机械裁切，不重绘或改动角色；可用时保留少量源图透明边距。
  const padding = 8
  const crop = {
    left: Math.max(0, minX - padding),
    top: Math.max(0, minY - padding),
    width: Math.min(info.width - 1, maxX + padding) - Math.max(0, minX - padding) + 1,
    height: Math.min(info.height - 1, maxY + padding) - Math.max(0, minY - padding) + 1,
  }
  const avatar = await sharp(inputPath)
    .extract({
      left: cell.left + crop.left,
      top: cell.top + crop.top,
      width: crop.width,
      height: crop.height,
    })
    .ensureAlpha()
    .png()
    .toBuffer()

  return {
    avatar,
    cell: { column: 0, row: 0, width: cell.width, height: cell.height },
    sourceRegion,
    visibleBounds: {
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    crop,
  }
}

async function buildAppIcon(avatar, filename, size, subjectScale) {
  const maximumSubjectSize = Math.round(size * subjectScale)
  const { data: subject, info } = await sharp(avatar)
    .resize({
      width: maximumSubjectSize,
      height: maximumSubjectSize,
      fit: 'inside',
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer({ resolveWithObject: true })

  const result = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 247, b: 237, alpha: 1 },
    },
  })
    .composite([
      {
        input: subject,
        left: Math.round((size - info.width) / 2),
        top: Math.round((size - info.height) / 2),
      },
    ])
    .png({ compressionLevel: 9, palette: false })
    .toFile(resolve(iconOutputRoot, filename))

  return iconEntry(filename, result)
}

// ImageGen 的横向母版留有宽松透明边距；这里按等分取帧、裁去空白并归一到方形单元。
async function buildFrameAtlas(inputName, outputName, frameCount) {
  const inputPath = resolve(rawRoot, inputName)
  const metadata = await sharp(inputPath).metadata()
  if (!metadata.width || !metadata.height || metadata.hasAlpha !== true) {
    throw new Error(`${inputName} 必须是带透明通道的有效图片`)
  }

  const composites = []
  for (let index = 0; index < frameCount; index += 1) {
    const left = Math.floor((metadata.width * index) / frameCount)
    const right = Math.floor((metadata.width * (index + 1)) / frameCount)
    const extracted = await sharp(inputPath)
      .extract({ left, top: 0, width: right - left, height: metadata.height })
      .png()
      .toBuffer()
    const { data: trimmed, info: trimInfo } = await sharp(extracted)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
      .png()
      .toBuffer({ resolveWithObject: true })

    const maximumFrameSize = atlasCellSize - atlasFramePadding * 2
    const scale = Math.min(maximumFrameSize / trimInfo.width, maximumFrameSize / trimInfo.height)
    const targetWidth = Math.max(1, Math.round(trimInfo.width * scale))
    const targetHeight = Math.max(1, Math.round(trimInfo.height * scale))
    const { data: normalized, info: normalizedInfo } = await sharp(trimmed)
      .resize({ width: targetWidth, height: targetHeight, fit: 'fill' })
      .png()
      .toBuffer({ resolveWithObject: true })

    composites.push({
      input: normalized,
      left: index * atlasCellSize + Math.round((atlasCellSize - normalizedInfo.width) / 2),
      top: Math.round((atlasCellSize - normalizedInfo.height) / 2),
    })
  }

  const { data: atlasPixels, info: atlasInfo } = await sharp({
    create: {
      width: atlasCellSize * frameCount,
      height: atlasCellSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // libwebp 默认可重写完全透明像素的隐藏 RGB；先清零并开启 exact，避免查看器露出彩条。
  for (let offset = 0; offset < atlasPixels.length; offset += atlasInfo.channels) {
    if (atlasPixels[offset + 3] !== 0) continue
    atlasPixels[offset] = 0
    atlasPixels[offset + 1] = 0
    atlasPixels[offset + 2] = 0
  }

  const result = await sharp(atlasPixels, {
    raw: {
      width: atlasInfo.width,
      height: atlasInfo.height,
      channels: 4,
    },
  })
    // 细腿、尾巴和轮廓线不能承受有损色度采样；动画图集体积可控，发布为无损 WebP。
    .webp({ lossless: true, exact: true, effort: 6 })
    .toFile(resolve(outputRoot, outputName))

  return {
    ...(await imageEntry(outputName, result)),
    encoding: 'lossless',
    transparentPixelRgb: '000000',
  }
}

await Promise.all([
  mkdir(outputRoot, { recursive: true }),
  mkdir(iconOutputRoot, { recursive: true }),
])

const roomInput = resolve(rawRoot, 'chan-chan-house-master.png')
const roomSource = await sourceImageEntry('chan-chan-house-master.png')
const roomImages = []
// 房间母版改为用户参考图的竖版构图；旧横版文件名会误导响应式图片选择，定点清理。
for (const obsoleteWidth of [960, 1536]) {
  await rm(resolve(outputRoot, `chan-chan-house-v2-${obsoleteWidth}.webp`), { force: true })
}
for (const width of [768, 1098]) {
  const filename = `chan-chan-house-v2-${width}.webp`
  const result = await sharp(roomInput)
    .resize({ width, withoutEnlargement: true, fit: 'inside', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .webp({ lossless: true, exact: true, effort: 6 })
    .toFile(resolve(outputRoot, filename))
  roomImages.push({
    ...(await imageEntry(filename, result)),
    encoding: 'lossless',
    preservation: 'full-canvas-alpha',
  })
}

// 旧版四态图仍供已有组件使用，新的动画图集是向后兼容的增量资源。
const legacySpriteInput = resolve(rawRoot, 'bingo-sprites-transparent-v2.png')
const legacySpriteSource = await sourceImageEntry('bingo-sprites-transparent-v2.png')
const legacySpriteResult = await sharp(legacySpriteInput)
  .resize({ width: 1024, height: 1024, fit: 'fill' })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(resolve(outputRoot, 'bingo-sprites-v2.webp'))
const legacySpriteImage = await imageEntry('bingo-sprites-v2.webp', legacySpriteResult)

const idleAvatar = await extractIdleAvatar(legacySpriteInput)
const appIconImages = []
for (const definition of [
  { filename: 'favicon-32.png', size: 32, subjectScale: 0.88, purpose: 'favicon' },
  { filename: 'apple-touch-icon-180.png', size: 180, subjectScale: 0.84, purpose: 'apple-touch' },
  { filename: 'app-icon-192.png', size: 192, subjectScale: 0.84, purpose: 'any' },
  { filename: 'app-icon-512.png', size: 512, subjectScale: 0.84, purpose: 'any' },
  {
    filename: 'app-icon-maskable-512.png',
    size: 512,
    subjectScale: 0.64,
    purpose: 'maskable',
  },
]) {
  appIconImages.push({
    ...(await buildAppIcon(
      idleAvatar.avatar,
      definition.filename,
      definition.size,
      definition.subjectScale,
    )),
    purpose: definition.purpose,
    subjectScale: definition.subjectScale,
  })
}

const walkAtlasImage = await buildFrameAtlas('bingo-walk-v2.png', 'bingo-walk-v2.webp', 4)
const actionsAtlasImage = await buildFrameAtlas('bingo-actions-v2.png', 'bingo-actions-v2.webp', 4)
const refuseAtlasImage = await buildFrameAtlas('bingo-refuse-v2.png', 'bingo-refuse-v2.webp', 2)
const walkAtlasSource = await sourceImageEntry('bingo-walk-v2.png')
const actionsAtlasSource = await sourceImageEntry('bingo-actions-v2.png')
const refuseAtlasSource = await sourceImageEntry('bingo-refuse-v2.png')

await writeFile(
  dataPath,
  await format(
    JSON.stringify({
      schemaVersion: 2,
      rights: 'user-confirmed-authorized',
      generatedAt: '2026-08-09',
      room: {
        alt: '暖色晨光里的两层铲铲饼屋，包含床、电脑、衣架、电子琴、唱片机、冰箱、展示墙和出口',
        provenance: {
          origin: 'user-supplied-master',
          processingTool: 'sharp',
          mode: 'proportional-resize-only',
          preservation: ['full-canvas', 'alpha-channel', 'original-style'],
        },
        source: roomSource,
        images: roomImages,
      },
      mascotSprites: {
        alt: '戴红色苹果头套的白色小狗饼狗四种经典状态',
        generation: {
          tool: 'OpenAI built-in ImageGen',
          mode: 'identity-preserve',
          promptSummary:
            '保留四种姿态与苹果头套身份特征，缩短身体、收细四肢并统一为头大身小的短圆比例。',
        },
        source: legacySpriteSource,
        layout: { columns: 2, rows: 2 },
        poses: ['idle', 'travel', 'stream', 'celebrate'],
        image: legacySpriteImage,
      },
      appIcons: {
        alt: '戴红色苹果头套、抱着苹果的白色小狗饼狗',
        provenance: {
          origin: 'existing-mascot-sprite',
          processingTool: 'sharp',
          mode: 'mechanical-crop-resize-composite',
          background: '#fff7ed',
          redraw: false,
        },
        source: legacySpriteSource,
        sourcePose: 'idle',
        sourceCell: idleAvatar.cell,
        sourceRegion: idleAvatar.sourceRegion,
        visibleBounds: idleAvatar.visibleBounds,
        crop: idleAvatar.crop,
        images: appIconImages,
      },
      mascotAnimations: {
        walk: {
          alt: '饼狗走路循环的四帧动画',
          generation: {
            tool: 'OpenAI built-in ImageGen',
            mode: 'identity-preserve',
            promptSummary:
              '锁定苹果头套和白色垂耳身份，采用更小更短的身体与纤细完整四肢，生成四肢交替且小芽轻微弹动的四帧走路循环。',
          },
          source: walkAtlasSource,
          layout: {
            columns: 4,
            rows: 1,
            frameWidth: atlasCellSize,
            frameHeight: atlasCellSize,
          },
          frames: ['step-a', 'step-b', 'step-c', 'step-d'],
          image: walkAtlasImage,
        },
        actions: {
          alt: '饼狗补充苹果、坐下、围围巾和睡觉的四种状态',
          generation: {
            tool: 'OpenAI built-in ImageGen',
            mode: 'identity-preserve',
            promptSummary:
              '锁定苹果头套和白色垂耳身份，采用更小更短的身体与纤细完整四肢，生成抱苹果篮、坐下、围围巾和蜷缩睡觉四种状态。',
          },
          source: actionsAtlasSource,
          layout: {
            columns: 4,
            rows: 1,
            frameWidth: atlasCellSize,
            frameHeight: atlasCellSize,
          },
          frames: ['replenish', 'sit', 'ready', 'sleep'],
          image: actionsAtlasImage,
        },
        refuse: {
          alt: '饼狗犹豫和摇头拒绝的两帧动画',
          generation: {
            tool: 'OpenAI built-in ImageGen',
            mode: 'identity-preserve',
            promptSummary:
              '锁定苹果头套和白色垂耳身份，采用更小更短的身体与纤细完整四肢，生成轻轻犹豫与困倦摇头两帧。',
          },
          source: refuseAtlasSource,
          layout: {
            columns: 2,
            rows: 1,
            frameWidth: atlasCellSize,
            frameHeight: atlasCellSize,
          },
          frames: ['hesitate', 'shake-head'],
          image: refuseAtlasImage,
        },
      },
    }),
    { parser: 'json', printWidth: 100, endOfLine: 'lf' },
  ),
  'utf8',
)

console.log(
  'Demo 视觉素材已生成：透明饼屋双尺寸、经典四态精灵、应用图标、两套四帧动画与两帧拒绝动画',
)
