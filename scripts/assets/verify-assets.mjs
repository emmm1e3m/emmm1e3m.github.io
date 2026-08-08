import { createHash } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { collectInterfaceGlyphs } from './build-fonts.mjs'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const publicRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo/public')
const sourcePath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/million-shot-posters.source.json',
)
const lockPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/million-shot-posters.lock.json',
)
const publicDataPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/million-shot-posters.json',
)
const siteFirstSourcePath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/site-firsts.source.json',
)
const siteFirstLockPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/site-firsts.lock.json',
)
const siteFirstPublicDataPath = resolve(
  workspaceRoot,
  'AllForSUXINHAO/TravellingBingo/public/data/site-firsts.json',
)
const postcardSourcePath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/postcards.source.json',
)
const postcardDuplicatesPath = resolve(
  workspaceRoot,
  'research/travelling-bingo/data/postcards.duplicates.json',
)
const postcardPublicDataPath = resolve(publicRoot, 'data/postcards.json')
const postcardRawRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/postcards-demo')
const postcardLockPath = resolve(postcardRawRoot, 'postcards.lock.json')
const postcardPublicAssetRoot = resolve(publicRoot, 'assets/collectibles/postcards')
const demoVisualsPath = resolve(publicRoot, 'data/demo-visuals.json')
const demoGameAssetRoot = resolve(publicRoot, 'assets/game')
const fontManifestPath = resolve(publicRoot, 'data/font-manifest.json')
const publicFontAssetRoot = resolve(publicRoot, 'assets/fonts')

const postcardEntryUrl = 'https://www.bilibili.com/toy/preview/preview_5SdX8Yet/index.htm'
const postcardImagePathPattern =
  /^assets\/collectibles\/postcards\/postcard-(\d{4}-\d{2}-\d{4})-(480|960)\.webp$/
const forbiddenPostcardReferencePattern =
  /(?:^data:|\.css(?:$|[?#])|(?:^|[/._-])(?:demo|generated|placeholder)(?=$|[/._-]))/i

function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

// 目录字段必须使用仓库内的 POSIX 相对路径，不能借助盘符、反斜杠或 .. 逃逸。
function resolveSafeRelative(root, value, label, expectedPrefix) {
  ensure(typeof value === 'string' && value === value.trim() && value.length > 0, `${label} 为空`)
  ensure(
    !isAbsolute(value) && !value.includes('\\') && !value.includes(':'),
    `${label} 不是安全相对路径`,
  )
  ensure(
    value.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
    `${label} 含有非法路径片段`,
  )
  if (expectedPrefix) ensure(value.startsWith(expectedPrefix), `${label} 超出约定目录`)

  const target = resolve(root, ...value.split('/'))
  const relativeTarget = relative(root, target)
  ensure(
    relativeTarget && !relativeTarget.startsWith('..') && !isAbsolute(relativeTarget),
    `${label} 越过路径边界`,
  )
  return target
}

async function verifyWebpEntry(
  entry,
  { root = publicRoot, label, expectedPrefix, requireSha256 = false, requireAlpha = false },
) {
  ensure(entry?.mime === 'image/webp', `${label} 的 MIME 不是 image/webp`)
  ensure(Number.isInteger(entry.width) && entry.width > 0, `${label} 的宽度不合法`)
  ensure(Number.isInteger(entry.height) && entry.height > 0, `${label} 的高度不合法`)
  ensure(Number.isInteger(entry.byteLength) && entry.byteLength > 0, `${label} 的字节数不合法`)

  const target = resolveSafeRelative(root, entry.path, `${label} 路径`, expectedPrefix)
  ensure(entry.path.endsWith('.webp'), `${label} 的扩展名不是 WebP`)
  const bytes = await readFile(target)
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata()
  ensure(metadata.format === 'webp', `${label} 的实际格式不是 WebP`)
  ensure(
    metadata.width === entry.width && metadata.height === entry.height,
    `${label} 的实际宽高与目录不符`,
  )
  ensure(bytes.byteLength === entry.byteLength, `${label} 的实际字节数与目录不符`)
  if (requireAlpha) ensure(metadata.hasAlpha === true, `${label} 缺少透明通道`)
  if (entry.encoding !== undefined) {
    ensure(entry.encoding === 'lossless', `${label} 的编码声明不受支持`)
    ensure(bytes.includes(Buffer.from('VP8L')), `${label} 声明为无损但 WebP 不含 VP8L 数据块`)
  }

  const digest = createHash('sha256').update(bytes).digest('hex')
  if (requireSha256 || entry.sha256 !== undefined) {
    ensure(/^[a-f0-9]{64}$/.test(entry.sha256), `${label} 的 SHA-256 不合法`)
    ensure(digest === entry.sha256, `${label} 的 SHA-256 与目录不符`)
  }

  return { digest, metadata, target }
}

// 每格都必须留出透明安全区，避免裁掉细腿、尾巴或头顶小芽，也避免帧串到相邻单元。
async function verifyHorizontalAtlas(target, columns, label) {
  const { data, info } = await sharp(target)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  ensure(info.channels === 4, `${label} 解码后缺少 RGBA 通道`)
  ensure(info.width % columns === 0, `${label} 不能按 ${columns} 列等分`)
  const cellWidth = info.width / columns
  const cellArea = cellWidth * info.height
  let transparentRgbLeakPixels = 0

  for (let column = 0; column < columns; column += 1) {
    let minX = cellWidth
    let minY = info.height
    let maxX = -1
    let maxY = -1
    let visiblePixels = 0
    let partialPixels = 0

    for (let y = 0; y < info.height; y += 1) {
      for (let localX = 0; localX < cellWidth; localX += 1) {
        const pixelOffset = (y * info.width + column * cellWidth + localX) * info.channels
        const alpha = data[pixelOffset + 3]
        if (alpha === 0) {
          if (
            data[pixelOffset] !== 0 ||
            data[pixelOffset + 1] !== 0 ||
            data[pixelOffset + 2] !== 0
          ) {
            transparentRgbLeakPixels += 1
          }
          continue
        }
        visiblePixels += 1
        if (alpha < 255) partialPixels += 1
        minX = Math.min(minX, localX)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, localX)
        maxY = Math.max(maxY, y)
      }
    }

    ensure(visiblePixels > cellArea * 0.2, `${label} 第 ${column + 1} 帧主体覆盖过小`)
    ensure(visiblePixels < cellArea * 0.7, `${label} 第 ${column + 1} 帧透明背景不足`)
    ensure(partialPixels > 0, `${label} 第 ${column + 1} 帧缺少抗锯齿透明边缘`)
    ensure(
      minX >= 24 && minY >= 24 && cellWidth - 1 - maxX >= 24 && info.height - 1 - maxY >= 24,
      `${label} 第 ${column + 1} 帧触碰单元安全边界`,
    )
  }

  ensure(transparentRgbLeakPixels === 0, `${label} 的完全透明像素含有隐藏彩色数据`)
}

function verifyGenerationSummary(generation, label, expectedMode) {
  ensure(generation?.tool === 'OpenAI built-in ImageGen', `${label} 没有记录 ImageGen 来源`)
  ensure(generation.mode === expectedMode, `${label} 的 ImageGen 生成模式不一致`)
  ensure(
    typeof generation.promptSummary === 'string' && generation.promptSummary.length >= 30,
    `${label} 缺少可复核的提示词摘要`,
  )
}

async function verifyPngSourceEntry(
  entry,
  { label, expectedPath, expectedWidth, expectedHeight, requireAlpha },
) {
  ensure(entry?.mime === 'image/png', `${label} 的 MIME 不是 image/png`)
  ensure(entry.path === expectedPath, `${label} 的母版路径不一致`)
  ensure(
    entry.width === expectedWidth && entry.height === expectedHeight,
    `${label} 的目录尺寸不一致`,
  )
  ensure(entry.hasAlpha === requireAlpha, `${label} 的透明通道目录信息不一致`)
  ensure(Number.isInteger(entry.byteLength) && entry.byteLength > 0, `${label} 的字节数不合法`)
  ensure(/^[a-f0-9]{64}$/.test(entry.sha256), `${label} 的 SHA-256 不合法`)

  const target = resolveSafeRelative(
    workspaceRoot,
    entry.path,
    `${label} 路径`,
    'resources/raw/travelling-bingo/generated/',
  )
  const bytes = await readFile(target)
  const metadata = await sharp(bytes, { failOn: 'warning' }).metadata()
  ensure(metadata.format === 'png', `${label} 的实际格式不是 PNG`)
  ensure(
    metadata.width === entry.width && metadata.height === entry.height,
    `${label} 的实际尺寸与目录不符`,
  )
  ensure(metadata.hasAlpha === requireAlpha, `${label} 的实际透明通道状态不符`)
  ensure(bytes.byteLength === entry.byteLength, `${label} 的实际字节数与目录不符`)
  const digest = createHash('sha256').update(bytes).digest('hex')
  ensure(digest === entry.sha256, `${label} 的 SHA-256 与目录不符`)
  return digest
}

async function verifyWoff2Entry(entry, label) {
  ensure(entry?.mime === 'font/woff2', `${label} 的 MIME 不是 font/woff2`)
  ensure(Number.isInteger(entry.byteLength) && entry.byteLength > 0, `${label} 的字节数不合法`)
  ensure(entry.byteLength < 1024 * 1024, `${label} 超过 1 MiB 的发布上限`)
  ensure(/^[a-f0-9]{64}$/.test(entry.sha256), `${label} 的 SHA-256 不合法`)

  const target = resolveSafeRelative(publicRoot, entry.path, `${label} 路径`, 'assets/fonts/')
  ensure(entry.path.endsWith('.woff2'), `${label} 的扩展名不是 WOFF2`)
  const bytes = await readFile(target)
  ensure(bytes.subarray(0, 4).toString('ascii') === 'wOF2', `${label} 的实际格式不是 WOFF2`)
  ensure(bytes.byteLength === entry.byteLength, `${label} 的实际字节数与目录不符`)
  ensure(
    createHash('sha256').update(bytes).digest('hex') === entry.sha256,
    `${label} 的 SHA-256 与目录不符`,
  )
}

async function verifyExactDirectory(directory, expectedNames, label) {
  const entries = await readdir(directory, { withFileTypes: true })
  ensure(
    entries.every((entry) => entry.isFile()),
    `${label} 含有非普通文件`,
  )
  const actualNames = entries.map((entry) => entry.name).sort()
  const expected = [...expectedNames].sort()
  ensure(
    JSON.stringify(actualNames) === JSON.stringify(expected),
    `${label} 与目录清单不一致：实际 ${actualNames.length}，预期 ${expected.length}`,
  )
}

function ensureRealPostcardReference(value, label) {
  ensure(typeof value === 'string' && value.length > 0, `${label} 为空`)
  ensure(!forbiddenPostcardReferencePattern.test(value), `${label} 引用了 CSS、demo 或生成占位素材`)
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (!Array.isArray(source.items) || source.items.length < 1) {
  throw new Error('百万直拍来源清单至少需要 1 项')
}
if (source.selection.rights !== 'user-confirmed-authorized') {
  throw new Error('百万直拍来源清单缺少用户授权口径')
}

const ids = new Set(source.items.map((item) => item.id))
const sequences = new Set(source.items.map((item) => item.sequence))
if (ids.size !== source.items.length || sequences.size !== source.items.length) {
  throw new Error('百万直拍清单存在重复 ID 或编号')
}

for (const item of source.items) {
  if (!item.sourcePostUrl.startsWith('https://weibo.com/')) {
    throw new Error(`${item.id} 的微博来源地址不合法`)
  }
  if (!item.sourceImageUrl.startsWith('https://wx')) {
    throw new Error(`${item.id} 的原图地址不合法`)
  }
}

const lock = JSON.parse(await readFile(lockPath, 'utf8'))
if (lock.itemCount !== source.items.length || lock.items.length !== source.items.length) {
  throw new Error('海报下载锁定清单与来源数量不一致')
}

let verifiedMillionOriginals = 0
for (const item of lock.items) {
  try {
    const originalPath = resolveSafeRelative(
      workspaceRoot,
      item.originalPath,
      `${item.id} 原图路径`,
      'resources/raw/travelling-bingo/million-shots/',
    )
    const bytes = await readFile(originalPath)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== item.sha256) throw new Error(`${item.id} 的 SHA-256 与锁定清单不符`)
    verifiedMillionOriginals += 1
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
if (verifiedMillionOriginals !== 0 && verifiedMillionOriginals !== source.items.length) {
  throw new Error(
    `本地百万直拍原图不完整：仅找到 ${verifiedMillionOriginals}/${source.items.length}`,
  )
}

const publicCatalog = JSON.parse(await readFile(publicDataPath, 'utf8'))
if (
  publicCatalog.itemCount !== source.items.length ||
  publicCatalog.items.length !== source.items.length
) {
  throw new Error('网页百万直拍目录与来源数量不一致')
}
for (const item of publicCatalog.items) {
  if (!Array.isArray(item.images) || item.images.length < 1) {
    throw new Error(`${item.id} 没有网页衍生图`)
  }
  if (item.category !== 'million-shot' || item.source?.platform !== 'weibo') {
    throw new Error(`${item.id} 的百万直拍收藏契约不合法`)
  }
  for (const sourceItem of item.images) {
    await access(
      resolveSafeRelative(
        publicRoot,
        sourceItem.path,
        `${item.id} 网页衍生图路径`,
        'assets/collectibles/million-shots/',
      ),
    )
  }
}

const siteFirstSource = JSON.parse(await readFile(siteFirstSourcePath, 'utf8'))
const siteFirstLock = JSON.parse(await readFile(siteFirstLockPath, 'utf8'))
const siteFirstPublicCatalog = JSON.parse(await readFile(siteFirstPublicDataPath, 'utf8'))
if (
  siteFirstSource.items.length < 1 ||
  siteFirstLock.itemCount !== siteFirstSource.items.length ||
  siteFirstLock.items.length !== siteFirstSource.items.length ||
  siteFirstPublicCatalog.itemCount !== siteFirstSource.items.length ||
  siteFirstPublicCatalog.items.length !== siteFirstSource.items.length
) {
  throw new Error('全站第一的来源、锁定或网页清单数量不一致')
}
if (siteFirstSource.rights !== 'user-confirmed-authorized') {
  throw new Error('全站第一来源清单缺少用户授权口径')
}

const siteFirstBvids = new Set(siteFirstSource.items.map((item) => item.bvid))
if (siteFirstBvids.size !== siteFirstSource.items.length) {
  throw new Error('全站第一清单存在重复 BV 号')
}
const siteFirstSourceIds = new Set(siteFirstSource.items.map((item) => item.id))
if (siteFirstSourceIds.size !== siteFirstSource.items.length) {
  throw new Error('全站第一来源清单存在重复 ID')
}
const siteFirstPublicIds = new Set(siteFirstPublicCatalog.items.map((item) => item.id))
if (siteFirstPublicIds.size !== siteFirstPublicCatalog.items.length) {
  throw new Error('全站第一网页目录存在重复 ID')
}

const sourceChronology = [...siteFirstSource.items].sort(
  (left, right) => left.chronology - right.chronology,
)
if (
  sourceChronology.some((item, index) => item.chronology !== index + 1) ||
  sourceChronology[0]?.id !== 'site-first-dynamite'
) {
  throw new Error('全站第一来源 chronology 必须从 Dynamite 开始并以连续正整数递增')
}

const publicChronology = [...siteFirstPublicCatalog.items].sort(
  (left, right) => left.metadata?.chronology - right.metadata?.chronology,
)
if (
  publicChronology.some(
    (item, index) =>
      item.metadata?.chronology !== index + 1 || item.id !== sourceChronology[index]?.id,
  )
) {
  throw new Error('全站第一网页目录 chronology 与来源清单不一致')
}

for (const item of siteFirstLock.items) {
  const originalPath = resolveSafeRelative(
    workspaceRoot,
    item.originalPath,
    `${item.id} 原件路径`,
    'resources/raw/travelling-bingo/site-firsts/originals/',
  )
  const bytes = await readFile(originalPath)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== item.sha256) throw new Error(`${item.id} 的原件 SHA-256 不符`)
}

for (const item of siteFirstPublicCatalog.items) {
  if (!Array.isArray(item.images) || item.images.length < 1) {
    throw new Error(`${item.id} 没有全站第一网页衍生图`)
  }
  if (item.category !== 'site-first' || item.source?.platform !== 'bilibili') {
    throw new Error(`${item.id} 的全站第一收藏契约不合法`)
  }
  for (const sourceItem of item.images) {
    await access(
      resolveSafeRelative(
        publicRoot,
        sourceItem.path,
        `${item.id} 网页衍生图路径`,
        'assets/collectibles/site-firsts/',
      ),
    )
  }
}

const postcardSource = JSON.parse(await readFile(postcardSourcePath, 'utf8'))
const postcardDuplicates = JSON.parse(await readFile(postcardDuplicatesPath, 'utf8'))
if (postcardSource.itemCount !== 473 || postcardSource.items.length !== 473) {
  throw new Error('明信片候选来源清单不是 473 项')
}
if (postcardSource.rights !== 'user-confirmed-authorized') {
  throw new Error('明信片候选来源清单缺少用户授权口径')
}
if (postcardDuplicates.groupCount !== 4 || postcardDuplicates.groups.length !== 4) {
  throw new Error('明信片字节重复证据不是 4 组')
}
const postcardIds = new Set(postcardSource.items.map((item) => item.id))
const duplicateHashes = new Set()
for (const group of postcardDuplicates.groups) {
  if (!/^[a-f0-9]{64}$/.test(group.sha256) || duplicateHashes.has(group.sha256)) {
    throw new Error('明信片重复证据存在非法或重复 SHA-256')
  }
  duplicateHashes.add(group.sha256)
  if (group.ids.length !== 2 || group.ids.some((id) => !postcardIds.has(id))) {
    throw new Error(`明信片重复组 ${group.sha256} 的候选 ID 不合法`)
  }
}

const postcardPublicCatalog = JSON.parse(await readFile(postcardPublicDataPath, 'utf8'))
const postcardLock = JSON.parse(await readFile(postcardLockPath, 'utf8'))
ensure(postcardPublicCatalog.schemaVersion === 1, '网页明信片目录版本不受支持')
ensure(postcardLock.schemaVersion === 1, '明信片锁定目录版本不受支持')
ensure(
  postcardPublicCatalog.itemCount > 0 &&
    postcardPublicCatalog.items.length === postcardPublicCatalog.itemCount,
  '网页明信片目录数量声明不一致',
)
ensure(
  postcardLock.itemCount === postcardPublicCatalog.itemCount &&
    postcardLock.items.length === postcardPublicCatalog.itemCount,
  '明信片锁定目录与网页目录数量不一致',
)
ensure(
  postcardPublicCatalog.source?.platform === 'bilibilitoy' &&
    postcardPublicCatalog.source?.rights === 'user-confirmed-authorized',
  '网页明信片目录缺少 Bilibili Toy 来源或用户授权口径',
)
ensure(
  postcardPublicCatalog.source.entryUrl === postcardEntryUrl,
  '网页明信片目录不是从用户指定入口取得',
)
ensure(
  postcardPublicCatalog.source.embeddedDataUrl === postcardSource.embeddedDataUrl,
  '网页明信片目录的有效归档地址与 473 项来源目录不一致',
)
ensure(
  postcardLock.catalogId === postcardPublicCatalog.generatedFrom,
  '明信片锁定目录与网页目录的构建标识不一致',
)

const postcardSourceById = new Map(postcardSource.items.map((item) => [item.id, item]))
const postcardLockById = new Map(postcardLock.items.map((item) => [item.id, item]))
const selectedPostcardSourceIds = postcardPublicCatalog.selection?.selectedSourceIds
ensure(
  Array.isArray(selectedPostcardSourceIds) &&
    selectedPostcardSourceIds.length === postcardPublicCatalog.itemCount,
  '网页明信片选择清单与网页目录数量不一致',
)
ensure(
  new Set(selectedPostcardSourceIds).size === postcardPublicCatalog.itemCount,
  '网页明信片选择清单存在重复 sourceId',
)
ensure(postcardLockById.size === postcardPublicCatalog.itemCount, '明信片锁定目录存在重复 ID')

// 已知字节重复组中最多只能选择一张，避免把同一张真实照片包装成两件收藏品。
for (const group of postcardDuplicates.groups) {
  const selected = group.ids.filter((id) => selectedPostcardSourceIds.includes(id))
  ensure(selected.length < 2, `网页明信片选择了重复原图：${selected.join(', ')}`)
}

const postcardPublicIds = new Set()
const postcardDerivativePaths = new Set()
const postcardDerivativeHashes = new Set()
const expectedPostcardFileNames = new Set()
const expectedRawPostcardFileNames = new Set(['postcards.lock.json'])

for (const item of postcardPublicCatalog.items) {
  ensure(!postcardPublicIds.has(item.id), `网页明信片目录存在重复 ID：${item.id}`)
  postcardPublicIds.add(item.id)
  ensure(item.category === 'postcard', `${item.id} 的收藏品分类不是 postcard`)
  ensure(item.rights === 'user-confirmed-authorized', `${item.id} 缺少用户授权口径`)
  ensure(item.source?.platform === 'bilibilitoy', `${item.id} 不是 Bilibili Toy 来源`)
  ensure(item.source?.pageUrl === postcardEntryUrl, `${item.id} 没有引用用户指定入口`)

  const sourceId = item.metadata?.sourceId
  ensure(selectedPostcardSourceIds.includes(sourceId), `${item.id} 不在网页明信片选择清单中`)
  ensure(item.id === `postcard-${sourceId}`, `${item.id} 与 sourceId 不一致`)
  const sourceItem = postcardSourceById.get(sourceId)
  ensure(sourceItem, `${item.id} 无法回溯到 473 项来源目录`)
  ensure(item.source.url === sourceItem.sourceUrl, `${item.id} 的来源图片地址与候选目录不一致`)
  ensure(
    item.metadata.original?.url === sourceItem.sourceUrl,
    `${item.id} 的原图地址与候选目录不一致`,
  )
  ensure(item.date === sourceItem.date, `${item.id} 的日期与候选目录不一致`)
  ensureRealPostcardReference(item.source.url, `${item.id} 来源图片地址`)
  ensureRealPostcardReference(item.metadata.original.url, `${item.id} 原图地址`)
  ensure(
    item.source.url.startsWith('https://su-xinhao-media.oss-cn-hangzhou.aliyuncs.com/su-xinhao/'),
    `${item.id} 的来源图片不是归档中的真实照片`,
  )

  const lockItem = postcardLockById.get(item.id)
  ensure(lockItem, `${item.id} 缺少原图锁定记录`)
  ensure(lockItem.sourceId === sourceId, `${item.id} 的锁定 sourceId 不一致`)
  ensure(lockItem.sourceUrl === sourceItem.sourceUrl, `${item.id} 的锁定来源地址不一致`)
  ensure(lockItem.rights === 'user-confirmed-authorized', `${item.id} 的锁定记录缺少授权口径`)
  ensure(lockItem.byteLength === sourceItem.byteLength, `${item.id} 的原图字节数与候选目录不一致`)
  ensure(lockItem.originalPath.endsWith(`/${sourceId}.webp`), `${item.id} 的锁定原图文件名不一致`)
  ensureRealPostcardReference(lockItem.sourceUrl, `${item.id} 锁定来源地址`)

  const original = item.metadata.original
  ensure(original.format === 'webp' && lockItem.format === 'webp', `${item.id} 的原图格式不是 WebP`)
  ensure(original.width === lockItem.width, `${item.id} 的原图宽度与锁定目录不一致`)
  ensure(original.height === lockItem.height, `${item.id} 的原图高度与锁定目录不一致`)
  ensure(original.byteLength === lockItem.byteLength, `${item.id} 的原图字节数与锁定目录不一致`)
  ensure(original.sha256 === lockItem.sha256, `${item.id} 的原图 SHA-256 与锁定目录不一致`)
  await verifyWebpEntry(
    {
      width: lockItem.width,
      height: lockItem.height,
      path: lockItem.originalPath,
      byteLength: lockItem.byteLength,
      mime: 'image/webp',
      sha256: lockItem.sha256,
    },
    {
      root: workspaceRoot,
      label: `${item.id} 锁定原图`,
      expectedPrefix: 'resources/raw/travelling-bingo/postcards-demo/',
      requireSha256: true,
    },
  )
  expectedRawPostcardFileNames.add(`${sourceId}.webp`)

  ensure(
    Array.isArray(item.images) && item.images.length === 2,
    `${item.id} 必须正好有两档网页衍生图`,
  )
  ensure(
    Array.isArray(lockItem.derivatives) && lockItem.derivatives.length === 2,
    `${item.id} 的锁定记录必须正好有两档网页衍生图`,
  )
  const imageWidths = new Set(item.images.map((image) => image.width))
  ensure(
    imageWidths.size === 2 && imageWidths.has(480) && imageWidths.has(960),
    `${item.id} 缺少 480/960 两档图片`,
  )

  for (const image of item.images) {
    ensureRealPostcardReference(image.path, `${item.id} 网页衍生图路径`)
    const match = postcardImagePathPattern.exec(image.path)
    ensure(match, `${item.id} 的网页衍生图路径格式不合法`)
    ensure(
      match[1] === sourceId && Number(match[2]) === image.width,
      `${item.id} 的网页衍生图路径与宽度不一致`,
    )
    ensure(
      image.path === `assets/collectibles/postcards/${item.id}-${image.width}.webp`,
      `${item.id} 的网页衍生图没有放在独立真实明信片目录`,
    )
    ensure(!postcardDerivativePaths.has(image.path), `${item.id} 重复引用网页衍生图 ${image.path}`)
    postcardDerivativePaths.add(image.path)

    const lockedDerivative = lockItem.derivatives.find((entry) => entry.path === image.path)
    ensure(lockedDerivative, `${item.id} 的网页衍生图缺少锁定记录`)
    for (const field of ['width', 'height', 'path', 'byteLength', 'mime', 'sha256']) {
      ensure(
        image[field] === lockedDerivative[field],
        `${item.id} 的衍生图 ${field} 与锁定目录不一致`,
      )
    }

    const verified = await verifyWebpEntry(image, {
      label: `${item.id} ${image.width}px 衍生图`,
      expectedPrefix: 'assets/collectibles/postcards/',
      requireSha256: true,
    })
    ensure(
      !postcardDerivativeHashes.has(verified.digest),
      `${item.id} 的网页衍生图与另一张明信片完全重复`,
    )
    postcardDerivativeHashes.add(verified.digest)
    expectedPostcardFileNames.add(image.path.split('/').at(-1))
  }
}

ensure(postcardPublicIds.size === postcardPublicCatalog.itemCount, '网页明信片 ID 存在重复')
const expectedPostcardDerivativeCount = postcardPublicCatalog.items.reduce(
  (total, item) => total + item.images.length,
  0,
)
ensure(
  postcardDerivativePaths.size === expectedPostcardDerivativeCount,
  '网页明信片衍生图数量或路径唯一性不符',
)
ensure(
  expectedRawPostcardFileNames.size === postcardPublicCatalog.itemCount + 1,
  '明信片原图目录数量与网页目录不一致',
)
ensure(
  selectedPostcardSourceIds.every((sourceId) => postcardPublicIds.has(`postcard-${sourceId}`)),
  '网页明信片选择清单与实际收藏品不一致',
)
await verifyExactDirectory(postcardPublicAssetRoot, expectedPostcardFileNames, '公开明信片素材目录')
await verifyExactDirectory(postcardRawRoot, expectedRawPostcardFileNames, '明信片原图锁定目录')

const demoVisuals = JSON.parse(await readFile(demoVisualsPath, 'utf8'))
ensure(demoVisuals.schemaVersion === 1, 'Demo 视觉目录版本不受支持')
ensure(demoVisuals.rights === 'user-confirmed-authorized', 'Demo 视觉目录缺少用户授权口径')
ensure(
  Array.isArray(demoVisuals.room?.images) && demoVisuals.room.images.length === 2,
  '饼屋必须有两档网页图',
)
const demoSourceHashes = new Set()
verifyGenerationSummary(demoVisuals.room.generation, '饼屋母版', 'precise-object-edit')
demoSourceHashes.add(
  await verifyPngSourceEntry(demoVisuals.room.source, {
    label: '饼屋 ImageGen 母版',
    expectedPath: 'resources/raw/travelling-bingo/generated/chan-chan-house-v2.png',
    expectedWidth: 1098,
    expectedHeight: 1433,
    requireAlpha: false,
  }),
)

const expectedRoomSizes = new Map([
  [768, 1002],
  [1098, 1433],
])
const expectedGameFileNames = new Set()
const demoVisualHashes = new Set()
for (const image of demoVisuals.room.images) {
  ensure(
    expectedRoomSizes.get(image.width) === image.height,
    `饼屋 ${image.width}px 图片尺寸不符合设计目录`,
  )
  ensure(
    image.path === `assets/game/chan-chan-house-v2-${image.width}.webp`,
    '饼屋图片路径或文件名不合法',
  )
  const verified = await verifyWebpEntry(image, {
    label: `饼屋 ${image.width}px 图片`,
    expectedPrefix: 'assets/game/',
    requireSha256: true,
  })
  demoVisualHashes.add(verified.digest)
  expectedGameFileNames.add(image.path.split('/').at(-1))
}
ensure(expectedGameFileNames.size === 2, '饼屋网页图缺少 768/1098 两档唯一文件')

const mascotSprites = demoVisuals.mascotSprites
verifyGenerationSummary(mascotSprites?.generation, '饼狗经典四态母版', 'identity-preserve')
demoSourceHashes.add(
  await verifyPngSourceEntry(mascotSprites?.source, {
    label: '饼狗经典四态 ImageGen 母版',
    expectedPath: 'resources/raw/travelling-bingo/generated/bingo-sprites-transparent-v2.png',
    expectedWidth: 1254,
    expectedHeight: 1254,
    requireAlpha: true,
  }),
)
ensure(
  mascotSprites?.layout?.columns === 2 && mascotSprites.layout.rows === 2,
  '饼狗精灵表不是 2×2 布局',
)
ensure(
  JSON.stringify(mascotSprites.poses) === JSON.stringify(['idle', 'travel', 'stream', 'celebrate']),
  '饼狗精灵表不是四种约定状态',
)
ensure(
  mascotSprites.image?.path === 'assets/game/bingo-sprites-v2.webp',
  '饼狗精灵表没有引用短身版 sprite v2',
)
ensure(
  mascotSprites.image.width === 1024 && mascotSprites.image.height === 1024,
  '饼狗 sprite v2 目录尺寸不是 1024×1024',
)
const verifiedMascot = await verifyWebpEntry(mascotSprites.image, {
  label: '饼狗 sprite v2',
  expectedPrefix: 'assets/game/',
  requireSha256: true,
  requireAlpha: true,
})
demoVisualHashes.add(verifiedMascot.digest)
expectedGameFileNames.add('bingo-sprites-v2.webp')

const expectedAnimations = new Map([
  [
    'walk',
    {
      columns: 4,
      frames: ['step-a', 'step-b', 'step-c', 'step-d'],
      path: 'assets/game/bingo-walk-v2.webp',
      sourcePath: 'resources/raw/travelling-bingo/generated/bingo-walk-v2.png',
      sourceWidth: 1774,
      sourceHeight: 887,
    },
  ],
  [
    'actions',
    {
      columns: 4,
      frames: ['replenish', 'sit', 'ready', 'sleep'],
      path: 'assets/game/bingo-actions-v2.webp',
      sourcePath: 'resources/raw/travelling-bingo/generated/bingo-actions-v2.png',
      sourceWidth: 1774,
      sourceHeight: 887,
    },
  ],
  [
    'refuse',
    {
      columns: 2,
      frames: ['hesitate', 'shake-head'],
      path: 'assets/game/bingo-refuse-v2.webp',
      sourcePath: 'resources/raw/travelling-bingo/generated/bingo-refuse-v2.png',
      sourceWidth: 1774,
      sourceHeight: 887,
    },
  ],
])
ensure(
  JSON.stringify(Object.keys(demoVisuals.mascotAnimations ?? {}).sort()) ===
    JSON.stringify([...expectedAnimations.keys()].sort()),
  '饼狗动画目录不是 walk/actions/refuse 三套资源',
)
for (const [animationId, expected] of expectedAnimations) {
  const animation = demoVisuals.mascotAnimations[animationId]
  verifyGenerationSummary(animation.generation, `${animationId} 动画母版`, 'identity-preserve')
  demoSourceHashes.add(
    await verifyPngSourceEntry(animation.source, {
      label: `${animationId} 动画 ImageGen 母版`,
      expectedPath: expected.sourcePath,
      expectedWidth: expected.sourceWidth,
      expectedHeight: expected.sourceHeight,
      requireAlpha: true,
    }),
  )
  ensure(
    animation.layout?.columns === expected.columns &&
      animation.layout.rows === 1 &&
      animation.layout.frameWidth === 512 &&
      animation.layout.frameHeight === 512,
    `${animationId} 动画图集布局不合法`,
  )
  ensure(
    JSON.stringify(animation.frames) === JSON.stringify(expected.frames),
    `${animationId} 动画帧顺序不一致`,
  )
  ensure(animation.image?.path === expected.path, `${animationId} 动画路径不合法`)
  ensure(
    animation.image.width === expected.columns * 512 && animation.image.height === 512,
    `${animationId} 动画图集尺寸不合法`,
  )
  const verified = await verifyWebpEntry(animation.image, {
    label: `${animationId} 饼狗动画`,
    expectedPrefix: 'assets/game/',
    requireSha256: true,
    requireAlpha: true,
  })
  ensure(animation.image.encoding === 'lossless', `${animationId} 动画没有声明无损编码`)
  ensure(
    animation.image.transparentPixelRgb === '000000',
    `${animationId} 动画没有声明透明像素 RGB 清零`,
  )
  await verifyHorizontalAtlas(verified.target, expected.columns, `${animationId} 饼狗动画`)
  demoVisualHashes.add(verified.digest)
  expectedGameFileNames.add(animation.image.path.split('/').at(-1))
}

ensure(demoVisualHashes.size === 6, 'Demo 视觉目录存在完全重复文件')
ensure(demoSourceHashes.size === 5, 'ImageGen 母版目录存在完全重复文件')
await verifyExactDirectory(demoGameAssetRoot, expectedGameFileNames, 'Demo 游戏视觉素材目录')

const fontManifest = JSON.parse(await readFile(fontManifestPath, 'utf8'))
ensure(fontManifest.schemaVersion === 1, '字体目录版本不受支持')
ensure(fontManifest.rights === 'user-confirmed-authorized', '字体目录缺少用户授权口径')
const currentGlyphSet = await collectInterfaceGlyphs(workspaceRoot)
ensure(
  fontManifest.glyphSet?.codePointCount === currentGlyphSet.codePointCount &&
    fontManifest.glyphSet.sha256 === currentGlyphSet.sha256 &&
    JSON.stringify(fontManifest.glyphSet.sourceFiles) ===
      JSON.stringify(currentGlyphSet.sourceFiles),
  '字体子集未覆盖当前界面源码与公开数据，请重新运行 npm run assets:build:fonts',
)

const expectedFonts = new Map([
  [
    'display',
    {
      family: 'TravellingBingo Display',
      sourcePath: 'resources/raw/travelling-bingo/fonts/可画乐融融.ttf',
      filePath: 'assets/fonts/kehua-lerongrong.woff2',
    },
  ],
  [
    'ui',
    {
      family: 'TravellingBingo UI',
      sourcePath: 'resources/raw/travelling-bingo/fonts/可画奶糖体.otf',
      filePath: 'assets/fonts/kehua-naitang.woff2',
    },
  ],
])
ensure(
  Array.isArray(fontManifest.fonts) && fontManifest.fonts.length === expectedFonts.size,
  '字体目录不是两款约定字体',
)
const expectedFontFileNames = new Set()
let verifiedFontSources = 0
for (const font of fontManifest.fonts) {
  const expected = expectedFonts.get(font.id)
  ensure(expected, `字体目录含有未知字体 ${font.id}`)
  ensure(font.family === expected.family, `${font.id} 的 CSS 字体族不一致`)
  ensure(
    font.style === 'normal' && font.cssWeight === 400 && font.fontDisplay === 'swap',
    `${font.id} 的 @font-face 元数据不符合单字重字体约定`,
  )
  ensure(font.source?.path === expected.sourcePath, `${font.id} 的本地字体母版路径不一致`)
  ensure(
    Number.isInteger(font.source.byteLength) &&
      font.source.byteLength > 0 &&
      /^[a-f0-9]{64}$/.test(font.source.sha256),
    `${font.id} 的本地母版锁定信息不合法`,
  )
  try {
    const sourceTarget = resolveSafeRelative(
      workspaceRoot,
      font.source.path,
      `${font.id} 本地字体母版路径`,
      'resources/raw/travelling-bingo/fonts/',
    )
    const sourceBytes = await readFile(sourceTarget)
    ensure(sourceBytes.byteLength === font.source.byteLength, `${font.id} 的本地母版字节数不符`)
    ensure(
      createHash('sha256').update(sourceBytes).digest('hex') === font.source.sha256,
      `${font.id} 的本地母版 SHA-256 不符`,
    )
    verifiedFontSources += 1
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  ensure(font.file?.path === expected.filePath, `${font.id} 的 WOFF2 路径不一致`)
  await verifyWoff2Entry(font.file, `${font.id} 字体子集`)
  expectedFontFileNames.add(font.file.path.split('/').at(-1))
}
ensure(expectedFontFileNames.size === 2, '字体子集文件名存在重复')
ensure(
  verifiedFontSources === 0 || verifiedFontSources === expectedFonts.size,
  `本地字体母版不完整：仅找到 ${verifiedFontSources}/${expectedFonts.size}`,
)
await verifyExactDirectory(publicFontAssetRoot, expectedFontFileNames, '公开字体素材目录')

console.log(
  `素材校验通过：${publicCatalog.itemCount} 张百万直拍、${siteFirstPublicCatalog.itemCount} 项全站第一、${postcardSource.itemCount} 条明信片候选、${postcardPublicCatalog.itemCount} 张真实明信片（${expectedPostcardDerivativeCount} 个 WebP）、${expectedGameFileNames.size} 个 Demo 视觉文件及 ${fontManifest.fonts.length} 个 WOFF2 字体子集一致；本地核验百万直拍原图 ${verifiedMillionOriginals}/${source.items.length}、字体母版 ${verifiedFontSources}/${expectedFonts.size}`,
)
