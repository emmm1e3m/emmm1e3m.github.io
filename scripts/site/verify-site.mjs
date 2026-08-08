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

const requiredFiles = ['index.html', '.nojekyll', 'AllForSUXINHAO/TravellingBingo/index.html']
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
if (!precacheByUrl.has('icons/app-icon.svg')) {
  throw new Error('Service Worker 缺少应用图标预缓存项')
}

const fixedAssetEntries = precacheEntries.filter(
  (entry) =>
    entry.url.startsWith('assets/game/') ||
    entry.url.startsWith('assets/fonts/') ||
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
    /^assets\/collectibles\/(?:million-shots|postcards|site-firsts)\/[a-z0-9][a-z0-9-]*\.webp$/u.test(
      relativePath,
    ) ||
    /^data\/[a-z0-9][a-z0-9-]*\.json$/u.test(relativePath) ||
    relativePath === 'icons/app-icon.svg'
  )
}

const allowedGameDirectories = new Set([
  'assets',
  'assets/collectibles',
  'assets/collectibles/million-shots',
  'assets/collectibles/postcards',
  'assets/collectibles/site-firsts',
  'assets/fonts',
  'assets/game',
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
  (entry) => entry.startsWith('assets/game/') || entry.startsWith('assets/fonts/'),
)) {
  const precacheEntry = precacheByUrl.get(relativePath)
  if (!precacheEntry || typeof precacheEntry.revision !== 'string' || !precacheEntry.revision) {
    throw new Error(`游戏图片与字体必须带内容 revision 预缓存：${relativePath}`)
  }
}

if (!publishedGameFiles.some((entry) => entry.startsWith('assets/fonts/'))) {
  throw new Error('发布包缺少游戏字体')
}
if (!publishedGameFiles.some((entry) => /^assets\/game\/bingo-.+-v2\.webp$/u.test(entry))) {
  throw new Error('发布包缺少新版饼狗动作资源')
}

console.log('发布包校验通过：公开白名单、预缓存唯一性与按需高清缓存均正确')
