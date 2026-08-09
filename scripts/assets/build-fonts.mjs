import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import subsetFont from 'subset-font'

import {
  findMissingCodePoints,
  inspectFontCodePoints,
  summarizeCharacters,
} from './font-metadata.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const appRoot = resolve(workspaceRoot, 'AllForSUXINHAO/TravellingBingo')
const rawFontRoot = resolve(workspaceRoot, 'resources/raw/travelling-bingo/fonts')
const outputRoot = resolve(appRoot, 'public/assets/fonts')
const manifestPath = resolve(appRoot, 'public/data/font-manifest.json')
const readableExtensions = new Set(['.css', '.html', '.json', '.ts', '.tsx'])
const alwaysIncluded =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~，。！？：；（）《》“”‘’—…·、￥'
const requiredCustomFontCharacter = /[\u0020-\u007e\p{Script=Han}，。！？：；（）《》“”‘’—…·、￥]/u

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
  }
}

export async function readCommonChineseCharacters(root = workspaceRoot) {
  const target = resolve(root, 'scripts/assets/data/modern-chinese-common-2500.txt')
  const contents = await readFile(target, 'utf8')
  const text = contents
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('')
    .replace(/\s/gu, '')
    .normalize('NFC')
  const characters = [...text]
  const uniqueCharacters = new Set(characters)
  if (characters.length !== 2500 || uniqueCharacters.size !== 2500) {
    throw new Error(
      `《现代汉语常用字表》常用字数据必须恰好包含 2500 个不重复字符，当前为 ${characters.length}/${uniqueCharacters.size}`,
    )
  }
  if (characters.some((character) => !/\p{Script=Han}/u.test(character))) {
    throw new Error('《现代汉语常用字表》常用字数据含有非汉字字符')
  }
  if (!text.startsWith('一乙二十丁厂') || !text.endsWith('魔灌蠢霸露囊罐')) {
    throw new Error('《现代汉语常用字表》常用字数据的首尾顺序不符合已核对版本')
  }
  return {
    text,
    codePointCount: uniqueCharacters.size,
    path: relative(root, target).split('\\').join('/'),
  }
}

export async function collectFontGlyphs(root = workspaceRoot) {
  const [runtime, common] = await Promise.all([
    collectInterfaceGlyphs(root),
    readCommonChineseCharacters(root),
  ])
  const characters = new Set(`${common.text}${runtime.text}`)
  const text = [...characters]
    .sort((left, right) => left.codePointAt(0) - right.codePointAt(0))
    .join('')
  return {
    text,
    codePointCount: characters.size,
    requiredText: [...text]
      .filter((character) => requiredCustomFontCharacter.test(character))
      .join(''),
    common,
    runtime,
  }
}

async function buildFonts() {
  const glyphSet = await collectFontGlyphs()
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

    const sourceMetadata = await inspectFontCodePoints(sourceBytes)
    const sourceMissing = findMissingCodePoints(glyphSet.requiredText, sourceMetadata.codePoints)
    if (sourceMissing.length > 0) {
      throw new Error(
        `${definition.sourceName} 缺少必须发布的常用或界面字符：${summarizeCharacters(sourceMissing)}`,
      )
    }

    const subsetBytes = await subsetFont(sourceBytes, glyphSet.text, {
      targetFormat: 'woff2',
      preserveNameIds: [0, 1, 2, 3, 4, 5, 6],
    })
    if (subsetBytes.subarray(0, 4).toString('ascii') !== 'wOF2') {
      throw new Error(`${definition.sourceName} 的网页字体不是 WOFF2`)
    }
    if (subsetBytes.byteLength >= 100 * 1024 * 1024) {
      throw new Error(`${definition.sourceName} 的网页字体超过 GitHub 单文件 100 MiB 限制`)
    }
    const outputMetadata = await inspectFontCodePoints(subsetBytes)
    const outputMissing = findMissingCodePoints(glyphSet.requiredText, outputMetadata.codePoints)
    if (outputMissing.length > 0) {
      throw new Error(
        `${definition.sourceName} 的网页字体缺少常用或界面字符：${summarizeCharacters(outputMissing)}`,
      )
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
        format: sourceMetadata.sourceFormat,
      },
      file: {
        path: `assets/fonts/${definition.outputName}`,
        byteLength: subsetBytes.byteLength,
        mime: 'font/woff2',
        mappedCodePointCount: outputMetadata.codePoints.size,
      },
    })
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        rights: 'user-confirmed-authorized',
        generatedAt: '2026-08-09',
        glyphSet: {
          strategy: 'modern-chinese-common-2500-plus-runtime',
          codePointCount: glyphSet.codePointCount,
          requiredCustomFontCodePointCount: [...glyphSet.requiredText].length,
          commonCharacters: {
            standard: '《现代汉语常用字表》常用字部分',
            authority: '国家语言文字工作委员会、国家教育委员会',
            publishedAt: '1988-01-26',
            codePointCount: glyphSet.common.codePointCount,
            path: glyphSet.common.path,
            referenceUrl:
              'https://www.moe.gov.cn/jyb_xwfb/xw_fbh/moe_2069/s7135/s7562/s7569/201308/t20130827_156353.html',
          },
          runtimeCodePointCountAtBuild: glyphSet.runtime.codePointCount,
        },
        fonts,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(
    `常用字网页字体已生成：2500 个标准常用汉字与当前界面合并为 ${glyphSet.codePointCount} 个字符，${fonts
      .map((font) => `${font.file.path} ${(font.file.byteLength / 1024).toFixed(1)} KiB`)
      .join('；')}`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  await buildFonts()
}
