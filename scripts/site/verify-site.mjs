import { access, lstat, readFile, readdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const siteRoot = resolve(workspaceRoot, '_site')

if (!siteRoot.startsWith(`${workspaceRoot}${sep}`)) {
  throw new Error('发布目录越界')
}

const requiredFiles = [
  'index.html',
  '.nojekyll',
  'AllForSUXINHAO/TravellingBingo/index.html',
  'AllForSUXINHAO/SUperView/SUperView_mini_v1.html',
  'AllForSUXINHAO/SUperView/SUperView_mini_v2.html',
  'AllForSUXINHAO/SUperDanmaku/test',
  'AllForSUXINHAO/SUperDanmaku/tasks/test',
]
for (const relativePath of requiredFiles) {
  await access(resolve(siteRoot, relativePath))
}

const rootHtml = await readFile(resolve(siteRoot, 'index.html'), 'utf8')
if (!rootHtml.includes('href="/AllForSUXINHAO/TravellingBingo/"')) {
  throw new Error('根首页缺少旅行饼狗最终子路径入口')
}

const gameRoot = resolve(siteRoot, 'AllForSUXINHAO/TravellingBingo')
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
const fixedAssetEntries = precacheEntries.filter(
  (entry) =>
    entry.url.startsWith('assets/game/') ||
    (entry.url.startsWith('assets/collectibles/') && entry.url.endsWith('-480.webp')),
)
if (fixedAssetEntries.length === 0) throw new Error('Service Worker 缺少固定名图片预缓存项')
for (const entry of fixedAssetEntries) {
  if (typeof entry.revision !== 'string' || entry.revision.length === 0) {
    throw new Error(`固定名图片缺少内容 revision：${entry.url}`)
  }
}

const hashedCodePattern = /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u
const hashedCodeEntries = precacheEntries.filter((entry) => hashedCodePattern.test(entry.url))
if (hashedCodeEntries.length === 0) throw new Error('Service Worker 缺少内容哈希 JS/CSS 预缓存项')
for (const entry of hashedCodeEntries) {
  if (entry.revision !== null) {
    throw new Error(`内容哈希 JS/CSS 不应重复附加 revision：${entry.url}`)
  }
}

const forbiddenTopLevelPaths = ['docs', 'research', 'resources', 'scripts', 'package.json']
for (const relativePath of forbiddenTopLevelPaths) {
  try {
    await access(resolve(siteRoot, relativePath))
    throw new Error(`发布包包含禁止路径：${relativePath}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const forbiddenSuffixes = ['.heic', '.map']
async function verifyTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name)
    const stats = await lstat(entryPath)
    if (stats.isSymbolicLink()) throw new Error(`发布包不能包含符号链接：${entryPath}`)
    if (entry.isDirectory()) {
      await verifyTree(entryPath)
      continue
    }
    if (forbiddenSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      throw new Error(`发布包包含禁止文件：${entryPath}`)
    }
  }
}

await verifyTree(siteRoot)
console.log('发布包校验通过：最终子路径、旧文件与公开边界均正确')
