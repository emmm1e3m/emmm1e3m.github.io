import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import subsetFont from 'subset-font'

const scriptPath = fileURLToPath(import.meta.url)
const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const appRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo')
const rawFontRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/fonts')
const outputRoot = resolve(appRoot, 'public/assets/fonts')
const manifestPath = resolve(appRoot, 'public/data/font-manifest.json')
const readableExtensions = new Set(['.css', '.html', '.json', '.ts', '.tsx'])
const alwaysIncluded =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~，。！？：；（）《》“”‘’—…·、￥'

const fontDefinitions = [
  {
    id: 'display',
    family: 'TravellingBingo Display',
    role: '标题与强调文字',
    sourceName: '可画乐融融.ttf',
    outputName: 'kehua-lerongrong.woff2',
    cssWeight: 400,
  },
  {
    id: 'ui',
    family: 'TravellingBingo UI',
    role: '正文与小型 UI 文字',
    sourceName: '可画奶糖体.otf',
    outputName: 'kehua-naitang.woff2',
    cssWeight: 400,
  },
]

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function collectTextFiles(root, result, shouldInclude = () => true) {
  const entries = await readdir(root, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of entries) {
    const target = resolve(root, entry.name)
    if (entry.isDirectory()) {
      await collectTextFiles(target, result, shouldInclude)
      continue
    }
    if (!entry.isFile() || !readableExtensions.has(extname(entry.name).toLowerCase())) continue
    if (!shouldInclude(target)) continue
    result.push(target)
  }
}

export async function collectInterfaceGlyphs(root = workspaceRoot) {
  const currentAppRoot = resolve(root, 'AllForSUXINHAO/TravellingBingo')
  const sourceFiles = []
  await collectTextFiles(resolve(currentAppRoot, 'src'), sourceFiles, (sourceFile) => {
    const normalizedPath = sourceFile.split('\\').join('/')
    return !normalizedPath.includes('/test/') && !/\.test\.[^.]+$/u.test(normalizedPath)
  })
  for (const dataName of ['million-shot-posters.json', 'postcards.json', 'site-firsts.json']) {
    sourceFiles.push(resolve(currentAppRoot, 'public/data', dataName))
  }
  sourceFiles.push(resolve(currentAppRoot, 'index.html'))
  sourceFiles.sort((left, right) => left.localeCompare(right, 'en'))

  const characters = new Set(alwaysIncluded)
  for (const sourceFile of sourceFiles) {
    const sourceText = (await readFile(sourceFile, 'utf8')).normalize('NFC')
    for (const character of sourceText) {
      if (character.codePointAt(0) >= 0x20) characters.add(character)
    }
  }

  const text = [...characters]
    .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
    .join('')
  return {
    text,
    codePointCount: characters.size,
    sourceFiles: sourceFiles.map((sourceFile) => relative(root, sourceFile).split('\\').join('/')),
    sha256: sha256(Buffer.from(text, 'utf8')),
  }
}

async function buildFonts() {
  const glyphSet = await collectInterfaceGlyphs()
  await mkdir(outputRoot, { recursive: true })

  const fonts = []
  for (const definition of fontDefinitions) {
    const sourcePath = resolve(rawFontRoot, definition.sourceName)
    let sourceBytes
    try {
      sourceBytes = await readFile(sourcePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(
          `缺少本地字体母版 ${relative(workspaceRoot, sourcePath)}；请按 resources/raw/travelling-bingo/fonts/README.md 放置字体。`,
          { cause: error },
        )
      }
      throw error
    }

    const subsetBytes = await subsetFont(sourceBytes, glyphSet.text, {
      targetFormat: 'woff2',
      preserveNameIds: [0, 1, 2, 3, 4, 5, 6],
    })
    if (subsetBytes.subarray(0, 4).toString('ascii') !== 'wOF2') {
      throw new Error(`${definition.sourceName} 的子集不是 WOFF2`)
    }
    if (subsetBytes.byteLength >= 1024 * 1024) {
      throw new Error(`${definition.sourceName} 的子集仍超过 1 MiB，请收窄界面字形来源`)
    }

    const outputPath = resolve(outputRoot, definition.outputName)
    await writeFile(outputPath, subsetBytes)
    fonts.push({
      id: definition.id,
      family: definition.family,
      role: definition.role,
      style: 'normal',
      cssWeight: definition.cssWeight,
      fontDisplay: 'swap',
      source: {
        path: `resources/raw/travelling-bingo/fonts/${definition.sourceName}`,
        byteLength: (await stat(sourcePath)).size,
        sha256: sha256(sourceBytes),
      },
      file: {
        path: `assets/fonts/${definition.outputName}`,
        byteLength: subsetBytes.byteLength,
        mime: 'font/woff2',
        sha256: sha256(subsetBytes),
      },
    })
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        rights: 'user-confirmed-authorized',
        generatedAt: '2026-08-08',
        glyphSet: {
          strategy:
            'all Unicode code points used by runtime game source and collectible catalogs, plus printable ASCII and Chinese punctuation',
          codePointCount: glyphSet.codePointCount,
          sha256: glyphSet.sha256,
          sourceFiles: glyphSet.sourceFiles,
        },
        fonts,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    `字体子集已生成：${glyphSet.codePointCount} 个界面字符，${fonts
      .map((font) => `${font.file.path} ${(font.file.byteLength / 1024).toFixed(1)} KiB`)
      .join('；')}`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await buildFonts()
}
