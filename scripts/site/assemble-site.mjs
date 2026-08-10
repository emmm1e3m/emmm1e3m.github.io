import { randomUUID } from 'node:crypto'
import { copyFile, cp, lstat, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const outputRoot = resolve(workspaceRoot, '_site')
const buildRoot = resolve(workspaceRoot, 'dist/travelling-bingo')
const rootEntry = resolve(workspaceRoot, 'index.html')
const standalonePlayerEntry = resolve(buildRoot, 'bilibili-multi-player.html')
const runId = `${process.pid}-${randomUUID()}`
const stagingRoot = resolve(workspaceRoot, `_site.__staging-${runId}`)
const backupRoot = resolve(workspaceRoot, `_site.__backup-${runId}`)

function assertOwnedDirectory(target, expectedNamePattern) {
  if (
    dirname(target) !== workspaceRoot ||
    !target.startsWith(`${workspaceRoot}${sep}`) ||
    !expectedNamePattern.test(basename(target))
  ) {
    throw new Error(`站点组装目录校验失败：${target}`)
  }
}

async function pathExists(target) {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function requireRegularFile(target, label) {
  const stats = await lstat(target)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label}必须是普通文件：${target}`)
  }
}

async function requireDirectory(target, label) {
  const stats = await lstat(target)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${label}必须是普通目录：${target}`)
  }
}

async function rejectSymbolicLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name)
    const stats = await lstat(entryPath)
    if (stats.isSymbolicLink()) throw new Error(`构建产物不能包含符号链接：${entryPath}`)
    if (stats.isDirectory()) await rejectSymbolicLinks(entryPath)
  }
}

assertOwnedDirectory(outputRoot, /^_site$/u)
assertOwnedDirectory(stagingRoot, /^_site\.__staging-[\w-]+$/u)
assertOwnedDirectory(backupRoot, /^_site\.__backup-[\w-]+$/u)

await requireRegularFile(rootEntry, '根首页')
await requireDirectory(buildRoot, 'TravellingBingo 构建产物')
await requireRegularFile(resolve(buildRoot, 'index.html'), 'TravellingBingo 构建入口')
await requireRegularFile(standalonePlayerEntry, 'B站多播放器独立页')
await rejectSymbolicLinks(buildRoot)

let outputBackedUp = false
let stagingInstalled = false

try {
  await mkdir(resolve(stagingRoot, 'AllForSUXINHAO'), { recursive: true })

  await copyFile(rootEntry, resolve(stagingRoot, 'index.html'))
  await cp(buildRoot, resolve(stagingRoot, 'AllForSUXINHAO/TravellingBingo'), {
    recursive: true,
  })
  await writeFile(resolve(stagingRoot, '.nojekyll'), '', 'utf8')

  if (await pathExists(outputRoot)) {
    await rename(outputRoot, backupRoot)
    outputBackedUp = true
  }

  await rename(stagingRoot, outputRoot)
  stagingInstalled = true

  if (outputBackedUp) {
    await rm(backupRoot, { recursive: true, force: true })
    outputBackedUp = false
  }
} catch (error) {
  if (!stagingInstalled && outputBackedUp && !(await pathExists(outputRoot))) {
    try {
      await rename(backupRoot, outputRoot)
      outputBackedUp = false
    } catch (restoreError) {
      throw new AggregateError([error, restoreError], '站点组装失败，旧发布目录也未能自动恢复', {
        cause: restoreError,
      })
    }
  }
  throw error
} finally {
  if (await pathExists(stagingRoot)) {
    await rm(stagingRoot, { recursive: true, force: true })
  }
  if (stagingInstalled && outputBackedUp && (await pathExists(backupRoot))) {
    await rm(backupRoot, { recursive: true, force: true })
  }
}

console.log('站点组装完成：输入已预检，并原子替换根首页与 TravellingBingo 发布目录')
