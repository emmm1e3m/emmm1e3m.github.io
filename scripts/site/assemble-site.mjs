import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const outputRoot = resolve(workspaceRoot, '_site')
const expectedOutputRoot = resolve(workspaceRoot, '_site')

if (outputRoot !== expectedOutputRoot || !outputRoot.startsWith(`${workspaceRoot}${sep}`)) {
  throw new Error('站点组装目录校验失败')
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(resolve(outputRoot, 'AllForSUXINHAO'), { recursive: true })

await cp(resolve(workspaceRoot, 'index.html'), resolve(outputRoot, 'index.html'))
await cp(
  resolve(workspaceRoot, 'AllForSUXINHAO/SUperDanmaku'),
  resolve(outputRoot, 'AllForSUXINHAO/SUperDanmaku'),
  { recursive: true },
)
await cp(
  resolve(workspaceRoot, 'AllForSUXINHAO/SUperView'),
  resolve(outputRoot, 'AllForSUXINHAO/SUperView'),
  { recursive: true },
)
await cp(
  resolve(workspaceRoot, 'dist/travelling-bingo'),
  resolve(outputRoot, 'AllForSUXINHAO/TravellingBingo'),
  { recursive: true },
)
await writeFile(resolve(outputRoot, '.nojekyll'), '', 'utf8')

console.log('站点组装完成：根首页、旧工具与 AllForSUXINHAO/TravellingBingo 已隔离发布')
