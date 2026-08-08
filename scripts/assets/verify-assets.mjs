import { createHash } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

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

  const digest = createHash('sha256').update(bytes).digest('hex')
  if (requireSha256 || entry.sha256 !== undefined) {
    ensure(/^[a-f0-9]{64}$/.test(entry.sha256), `${label} 的 SHA-256 不合法`)
    ensure(digest === entry.sha256, `${label} 的 SHA-256 与目录不符`)
  }

  return { digest, metadata, target }
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
if (source.items.length !== 30) throw new Error('百万直拍来源清单不是 30 项')
if (source.selection.rights !== 'user-confirmed-authorized') {
  throw new Error('百万直拍来源清单缺少用户授权口径')
}

const ids = new Set(source.items.map((item) => item.id))
const sequences = new Set(source.items.map((item) => item.sequence))
if (ids.size !== 30 || sequences.size !== 30) throw new Error('百万直拍清单存在重复 ID 或编号')

for (const item of source.items) {
  if (!item.sourcePostUrl.startsWith('https://weibo.com/')) {
    throw new Error(`${item.id} 的微博来源地址不合法`)
  }
  if (!item.sourceImageUrl.startsWith('https://wx')) {
    throw new Error(`${item.id} 的原图地址不合法`)
  }
}

const lock = JSON.parse(await readFile(lockPath, 'utf8'))
if (lock.itemCount !== 30 || lock.items.length !== 30) throw new Error('海报下载锁定清单不是 30 项')

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
if (verifiedMillionOriginals !== 0 && verifiedMillionOriginals !== 30) {
  throw new Error(`本地百万直拍原图不完整：仅找到 ${verifiedMillionOriginals}/30`)
}

const publicCatalog = JSON.parse(await readFile(publicDataPath, 'utf8'))
if (publicCatalog.itemCount !== 30 || publicCatalog.items.length !== 30) {
  throw new Error('网页百万直拍目录不是 30 项')
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
  siteFirstSource.items.length !== 8 ||
  siteFirstLock.items.length !== 8 ||
  siteFirstPublicCatalog.items.length !== 8
) {
  throw new Error('全站第一的来源、锁定或网页清单不是 8 项')
}
if (siteFirstSource.rights !== 'user-confirmed-authorized') {
  throw new Error('全站第一来源清单缺少用户授权口径')
}

const siteFirstBvids = new Set(siteFirstSource.items.map((item) => item.bvid))
if (siteFirstBvids.size !== 8) throw new Error('全站第一清单存在重复 BV 号')

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
  postcardPublicCatalog.itemCount === 12 && postcardPublicCatalog.items.length === 12,
  '网页明信片目录不是 12 项',
)
ensure(
  postcardLock.itemCount === 12 && postcardLock.items.length === 12,
  '明信片锁定目录不是 12 项',
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
  Array.isArray(selectedPostcardSourceIds) && selectedPostcardSourceIds.length === 12,
  '网页明信片选择清单不是 12 项',
)
ensure(new Set(selectedPostcardSourceIds).size === 12, '网页明信片选择清单存在重复 sourceId')
ensure(postcardLockById.size === 12, '明信片锁定目录存在重复 ID')

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

ensure(postcardPublicIds.size === 12, '网页明信片 ID 数量不是 12')
ensure(postcardDerivativePaths.size === 24, '网页明信片衍生图不是 24 个唯一文件')
ensure(expectedRawPostcardFileNames.size === 13, '明信片原图目录不是 12 张原图加一份锁定清单')
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

const expectedRoomSizes = new Map([
  [960, 640],
  [1536, 1024],
])
const expectedGameFileNames = new Set()
const demoVisualHashes = new Set()
for (const image of demoVisuals.room.images) {
  ensure(
    expectedRoomSizes.get(image.width) === image.height,
    `饼屋 ${image.width}px 图片尺寸不符合设计目录`,
  )
  ensure(
    image.path === `assets/game/chan-chan-house-${image.width}.webp`,
    '饼屋图片路径或文件名不合法',
  )
  const verified = await verifyWebpEntry(image, {
    label: `饼屋 ${image.width}px 图片`,
    expectedPrefix: 'assets/game/',
  })
  demoVisualHashes.add(verified.digest)
  expectedGameFileNames.add(image.path.split('/').at(-1))
}
ensure(expectedGameFileNames.size === 2, '饼屋网页图缺少 960/1536 两档唯一文件')

const mascotSprites = demoVisuals.mascotSprites
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
  requireAlpha: true,
})
demoVisualHashes.add(verifiedMascot.digest)
expectedGameFileNames.add('bingo-sprites-v2.webp')
ensure(demoVisualHashes.size === 3, 'Demo 视觉目录存在完全重复文件')
await verifyExactDirectory(demoGameAssetRoot, expectedGameFileNames, 'Demo 游戏视觉素材目录')

console.log(
  `素材校验通过：30 张百万直拍、8 项全站第一、473 条明信片候选、12 张真实明信片（24 个 WebP）及 3 个 Demo 视觉文件一致；本地核验百万直拍原图 ${verifiedMillionOriginals}/30`,
)
