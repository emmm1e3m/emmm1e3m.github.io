import { access, lstat, readFile, readdir } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const siteRoot = resolve(workspaceRoot, '_site')

if (!siteRoot.startsWith(`${workspaceRoot}${sep}`)) {
  throw new Error('发布目录越界')
}
const siteRootStats = await lstat(siteRoot)
if (!siteRootStats.isDirectory() || siteRootStats.isSymbolicLink()) {
  throw new Error('发布目录必须是工作区内的普通目录')
}

const requiredFiles = [
  'index.html',
  '.nojekyll',
  'AllForSUXINHAO/TravellingBingo/index.html',
  'AllForSUXINHAO/TravellingBingo/bilibili-multi-player.html',
]
for (const relativePath of requiredFiles) {
  await access(resolve(siteRoot, relativePath))
}

const rootHtml = await readFile(resolve(siteRoot, 'index.html'), 'utf8')
if (!rootHtml.includes('href="/AllForSUXINHAO/TravellingBingo/"')) {
  throw new Error('根首页缺少旅行饼狗最终子路径入口')
}

const rootEntries = await readdir(siteRoot, { withFileTypes: true })
const allowedRootEntries = new Map([
  ['.nojekyll', 'file'],
  ['AllForSUXINHAO', 'directory'],
  ['index.html', 'file'],
])
const unexpectedRootEntries = rootEntries.filter((entry) => {
  const expectedType = allowedRootEntries.get(entry.name)
  return (
    !expectedType ||
    (expectedType === 'file' && !entry.isFile()) ||
    (expectedType === 'directory' && !entry.isDirectory())
  )
})
if (unexpectedRootEntries.length > 0 || rootEntries.length !== allowedRootEntries.size) {
  throw new Error(
    `发布根目录只能包含公开白名单：${unexpectedRootEntries.map((entry) => entry.name).join(', ') || '缺少白名单项'}`,
  )
}

const gameRoot = resolve(siteRoot, 'AllForSUXINHAO/TravellingBingo')
const allForSuxinhaoEntries = await readdir(resolve(siteRoot, 'AllForSUXINHAO'), {
  withFileTypes: true,
})
const unexpectedEntries = allForSuxinhaoEntries.filter(
  (entry) => entry.name !== 'TravellingBingo' || !entry.isDirectory(),
)
if (unexpectedEntries.length > 0 || allForSuxinhaoEntries.length !== 1) {
  throw new Error(
    `AllForSUXINHAO 只能发布 TravellingBingo：${unexpectedEntries.map((entry) => entry.name).join(', ') || '目录数量不正确'}`,
  )
}

const serviceWorker = await readFile(resolve(gameRoot, 'sw.js'), 'utf8')
const webManifest = JSON.parse(await readFile(resolve(gameRoot, 'manifest.webmanifest'), 'utf8'))
const expectedManifestIcons = [
  { src: 'icons/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: 'icons/app-icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
]
if (JSON.stringify(webManifest.icons) !== JSON.stringify(expectedManifestIcons)) {
  throw new Error('Web App Manifest 没有精确引用饼狗 PNG 应用图标')
}
const precacheMatch = serviceWorker.match(/precacheAndRoute\((\[[\s\S]*?\])(?:,|\))/u)
if (!precacheMatch) throw new Error('无法读取 Service Worker 预缓存清单')

const precacheEntries = [
  ...precacheMatch[1].matchAll(/\{url:"([^"]+)",revision:(null|"([^"]+)")\}/gu),
].map(([, url, revisionToken, revision]) => ({
  url,
  revision: revisionToken === 'null' ? null : revision,
}))
if (precacheEntries.length === 0) throw new Error('Service Worker 预缓存清单无法解析')

const duplicatePrecacheUrls = [
  ...new Set(
    precacheEntries
      .map((entry) => entry.url)
      .filter((url, index, urls) => urls.indexOf(url) !== index),
  ),
]
if (duplicatePrecacheUrls.length > 0) {
  throw new Error(`Service Worker 存在重复预缓存项：${duplicatePrecacheUrls.join(', ')}`)
}

const precacheByUrl = new Map(precacheEntries.map((entry) => [entry.url, entry]))
const expectedIconFiles = [
  'icons/app-icon-192.png',
  'icons/app-icon-512.png',
  'icons/app-icon-maskable-512.png',
  'icons/apple-touch-icon-180.png',
  'icons/favicon-32.png',
]
for (const iconPath of expectedIconFiles) {
  if (!precacheByUrl.has(iconPath)) {
    throw new Error(`Service Worker 缺少应用图标预缓存项：${iconPath}`)
  }
}

const fixedAssetEntries = precacheEntries.filter(
  (entry) =>
    entry.url.startsWith('assets/game/') ||
    entry.url.startsWith('assets/fonts/') ||
    entry.url.startsWith('assets/friends/') ||
    entry.url.startsWith('assets/links/') ||
    entry.url.startsWith('icons/') ||
    entry.url === 'data/friends.json' ||
    entry.url === 'data/video-catalog.json' ||
    (entry.url.startsWith('assets/collectibles/') && entry.url.endsWith('-480.webp')),
)
if (fixedAssetEntries.length === 0) throw new Error('Service Worker 缺少固定名资源预缓存项')
for (const entry of fixedAssetEntries) {
  if (typeof entry.revision !== 'string' || entry.revision.length === 0) {
    throw new Error(`固定名资源缺少内容 revision：${entry.url}`)
  }
}

const highResolutionCollectibles = precacheEntries.filter(
  (entry) =>
    entry.url.startsWith('assets/collectibles/') &&
    entry.url.endsWith('.webp') &&
    !entry.url.endsWith('-480.webp'),
)
if (highResolutionCollectibles.length > 0) {
  throw new Error(
    `高清收藏图应按需缓存，不应预缓存：${highResolutionCollectibles.map((entry) => entry.url).join(', ')}`,
  )
}

if (
  !serviceWorker.includes('travelling-bingo-collectibles-hires-v2') ||
  !serviceWorker.includes('StaleWhileRevalidate')
) {
  throw new Error('Service Worker 缺少高清收藏图的 StaleWhileRevalidate 缓存策略')
}
if (serviceWorker.includes('travelling-bingo-game-art-')) {
  throw new Error('游戏场景已经预缓存，不应再注册重复的 runtime cache')
}

const hashedCodePattern = /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u
const hashedCodeEntries = precacheEntries.filter((entry) => hashedCodePattern.test(entry.url))
if (hashedCodeEntries.length === 0) throw new Error('Service Worker 缺少内容哈希 JS/CSS 预缓存项')
for (const entry of hashedCodeEntries) {
  if (entry.revision !== null) {
    throw new Error(`内容哈希 JS/CSS 不应重复附加 revision：${entry.url}`)
  }
}

function isAllowedGameFile(relativePath) {
  if (
    relativePath === 'index.html' ||
    relativePath === 'bilibili-multi-player.html' ||
    relativePath === 'manifest.webmanifest' ||
    relativePath === 'sw.js' ||
    relativePath === 'registerSW.js' ||
    /^workbox-[A-Za-z0-9_-]+\.js$/u.test(relativePath)
  ) {
    return true
  }

  return (
    /^assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u.test(relativePath) ||
    /^assets\/game\/[a-z0-9][a-z0-9-]*\.webp$/u.test(relativePath) ||
    /^assets\/fonts\/[A-Za-z0-9][A-Za-z0-9._-]*\.woff2$/u.test(relativePath) ||
    /^assets\/friends\/[a-z0-9][a-z0-9-]*\.webp$/u.test(relativePath) ||
    /^assets\/links\/weibo-[0-9]+\.jpg$/u.test(relativePath) ||
    /^assets\/collectibles\/(?:million-shots|postcards|site-firsts)\/[a-z0-9][a-z0-9-]*\.webp$/u.test(
      relativePath,
    ) ||
    /^data\/[a-z0-9][a-z0-9-]*\.json$/u.test(relativePath) ||
    /^icons\/[a-z0-9][a-z0-9-]*\.png$/u.test(relativePath)
  )
}

const allowedGameDirectories = new Set([
  'assets',
  'assets/collectibles',
  'assets/collectibles/million-shots',
  'assets/collectibles/postcards',
  'assets/collectibles/site-firsts',
  'assets/fonts',
  'assets/friends',
  'assets/game',
  'assets/links',
  'data',
  'icons',
])

const publishedGameFiles = []
async function verifyTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name)
    const stats = await lstat(entryPath)
    if (stats.isSymbolicLink()) throw new Error(`发布包不能包含符号链接：${entryPath}`)
    const relativePath = relative(gameRoot, entryPath).split(sep).join('/')
    if (entry.isDirectory()) {
      if (!allowedGameDirectories.has(relativePath)) {
        throw new Error(`发布包包含白名单外目录：${relativePath}`)
      }
      await verifyTree(entryPath)
      continue
    }
    if (!stats.isFile() || !isAllowedGameFile(relativePath)) {
      throw new Error(`发布包包含白名单外文件：${relativePath}`)
    }
    publishedGameFiles.push(relativePath)
  }
}

await verifyTree(gameRoot)

for (const relativePath of publishedGameFiles.filter(
  (entry) =>
    entry.startsWith('assets/game/') ||
    entry.startsWith('assets/fonts/') ||
    entry.startsWith('assets/friends/') ||
    entry.startsWith('assets/links/') ||
    entry.startsWith('icons/') ||
    entry === 'data/friends.json' ||
    entry === 'data/video-catalog.json' ||
    (entry.startsWith('assets/collectibles/') && entry.endsWith('-480.webp')),
)) {
  const precacheEntry = precacheByUrl.get(relativePath)
  if (!precacheEntry || typeof precacheEntry.revision !== 'string' || !precacheEntry.revision) {
    throw new Error(`固定名资源必须带内容 revision 预缓存：${relativePath}`)
  }
}

const publishedIconFiles = publishedGameFiles.filter((entry) => entry.startsWith('icons/')).sort()
if (JSON.stringify(publishedIconFiles) !== JSON.stringify([...expectedIconFiles].sort())) {
  throw new Error(`发布包应用图标目录不精确：实际 ${publishedIconFiles.join(', ') || '为空'}`)
}

const expectedFriendFiles = [
  'assets/friends/bili-bing.webp',
  'assets/friends/class-representative-bing.webp',
  'assets/friends/san-hao-rabbit.webp',
  'assets/friends/signal-dog.webp',
  'assets/friends/xin-hao-rabbit.webp',
]
const publishedFriendFiles = publishedGameFiles
  .filter((entry) => entry.startsWith('assets/friends/'))
  .sort()
if (JSON.stringify(publishedFriendFiles) !== JSON.stringify(expectedFriendFiles)) {
  throw new Error(`发布包好友图鉴目录不精确：实际 ${publishedFriendFiles.join(', ') || '为空'}`)
}

const expectedLinkFiles = ['assets/links/weibo-7760819929.jpg', 'assets/links/weibo-7878664767.jpg']
const publishedLinkFiles = publishedGameFiles
  .filter((entry) => entry.startsWith('assets/links/'))
  .sort()
if (JSON.stringify(publishedLinkFiles) !== JSON.stringify(expectedLinkFiles)) {
  throw new Error(`发布包微博头像目录不精确：实际 ${publishedLinkFiles.join(', ') || '为空'}`)
}
for (const dataFile of ['data/friends.json', 'data/video-catalog.json']) {
  if (!publishedGameFiles.includes(dataFile)) {
    throw new Error(`发布包缺少运行时数据：${dataFile}`)
  }
}

if (!publishedGameFiles.some((entry) => entry.startsWith('assets/fonts/'))) {
  throw new Error('发布包缺少游戏字体')
}
if (!publishedGameFiles.some((entry) => /^assets\/game\/bingo-.+-v2\.webp$/u.test(entry))) {
  throw new Error('发布包缺少新版饼狗动作资源')
}

console.log('发布包校验通过：公开白名单、预缓存唯一性与按需高清缓存均正确')
