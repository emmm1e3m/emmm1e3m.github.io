import { createRequire } from 'node:module'

const localRequire = createRequire(import.meta.url)
const requireFromSubsetFont = createRequire(localRequire.resolve('subset-font'))
const fontverter = requireFromSubsetFont('fontverter')

function ensureRange(buffer, offset, length, label) {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    offset + length > buffer.length
  ) {
    throw new Error(`${label} 超出字体文件边界`)
  }
}

function parseFormat4(buffer, offset, codePoints) {
  ensureRange(buffer, offset, 14, 'cmap format 4 表头')
  const length = buffer.readUInt16BE(offset + 2)
  const end = offset + length
  ensureRange(buffer, offset, length, 'cmap format 4 子表')
  const segmentCount = buffer.readUInt16BE(offset + 6) / 2
  if (!Number.isInteger(segmentCount) || segmentCount <= 0) {
    throw new Error('cmap format 4 的分段数量不合法')
  }

  const endCodesOffset = offset + 14
  const startCodesOffset = endCodesOffset + segmentCount * 2 + 2
  const idDeltasOffset = startCodesOffset + segmentCount * 2
  const idRangeOffsetsOffset = idDeltasOffset + segmentCount * 2
  ensureRange(buffer, idRangeOffsetsOffset, segmentCount * 2, 'cmap format 4 分段')

  for (let index = 0; index < segmentCount; index += 1) {
    const startCode = buffer.readUInt16BE(startCodesOffset + index * 2)
    const endCode = buffer.readUInt16BE(endCodesOffset + index * 2)
    const delta = buffer.readInt16BE(idDeltasOffset + index * 2)
    const rangeOffsetPosition = idRangeOffsetsOffset + index * 2
    const rangeOffset = buffer.readUInt16BE(rangeOffsetPosition)
    if (startCode > endCode) throw new Error('cmap format 4 的分段范围不合法')

    for (let codePoint = startCode; codePoint <= endCode && codePoint !== 0xffff; codePoint += 1) {
      let glyphId
      if (rangeOffset === 0) {
        glyphId = (codePoint + delta) & 0xffff
      } else {
        const glyphOffset = rangeOffsetPosition + rangeOffset + (codePoint - startCode) * 2
        if (glyphOffset + 2 > end) continue
        glyphId = buffer.readUInt16BE(glyphOffset)
        if (glyphId !== 0) glyphId = (glyphId + delta) & 0xffff
      }
      if (glyphId !== 0) codePoints.add(codePoint)
    }
  }
}

function parseFormat12Or13(buffer, offset, codePoints, format) {
  ensureRange(buffer, offset, 16, `cmap format ${format} 表头`)
  const length = buffer.readUInt32BE(offset + 4)
  ensureRange(buffer, offset, length, `cmap format ${format} 子表`)
  const groupCount = buffer.readUInt32BE(offset + 12)
  ensureRange(buffer, offset + 16, groupCount * 12, `cmap format ${format} 分组`)

  for (let index = 0; index < groupCount; index += 1) {
    const groupOffset = offset + 16 + index * 12
    const startCode = buffer.readUInt32BE(groupOffset)
    const endCode = buffer.readUInt32BE(groupOffset + 4)
    const startGlyph = buffer.readUInt32BE(groupOffset + 8)
    if (startCode > endCode || endCode > 0x10ffff) {
      throw new Error(`cmap format ${format} 的分组范围不合法`)
    }
    for (let codePoint = startCode; codePoint <= endCode; codePoint += 1) {
      const glyphId = format === 13 ? startGlyph : startGlyph + codePoint - startCode
      if (glyphId !== 0) codePoints.add(codePoint)
    }
  }
}

function readSfntCodePoints(buffer) {
  ensureRange(buffer, 0, 12, 'SFNT 表头')
  const tableCount = buffer.readUInt16BE(4)
  ensureRange(buffer, 12, tableCount * 16, 'SFNT 表目录')

  let cmapOffset = null
  let cmapLength = null
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16
    if (buffer.toString('ascii', recordOffset, recordOffset + 4) !== 'cmap') continue
    cmapOffset = buffer.readUInt32BE(recordOffset + 8)
    cmapLength = buffer.readUInt32BE(recordOffset + 12)
    break
  }
  if (cmapOffset === null || cmapLength === null) throw new Error('字体缺少 cmap 字符映射表')
  ensureRange(buffer, cmapOffset, cmapLength, 'cmap 字符映射表')
  ensureRange(buffer, cmapOffset, 4, 'cmap 表头')

  const subtableCount = buffer.readUInt16BE(cmapOffset + 2)
  ensureRange(buffer, cmapOffset + 4, subtableCount * 8, 'cmap 子表目录')
  const codePoints = new Set()
  const parsedOffsets = new Set()

  for (let index = 0; index < subtableCount; index += 1) {
    const recordOffset = cmapOffset + 4 + index * 8
    const subtableOffset = cmapOffset + buffer.readUInt32BE(recordOffset + 4)
    if (parsedOffsets.has(subtableOffset)) continue
    parsedOffsets.add(subtableOffset)
    ensureRange(buffer, subtableOffset, 2, 'cmap 子表')
    const format = buffer.readUInt16BE(subtableOffset)

    if (format === 0) {
      ensureRange(buffer, subtableOffset, 262, 'cmap format 0 子表')
      for (let codePoint = 0; codePoint < 256; codePoint += 1) {
        if (buffer[subtableOffset + 6 + codePoint] !== 0) codePoints.add(codePoint)
      }
    } else if (format === 4) {
      parseFormat4(buffer, subtableOffset, codePoints)
    } else if (format === 6) {
      ensureRange(buffer, subtableOffset, 10, 'cmap format 6 表头')
      const firstCode = buffer.readUInt16BE(subtableOffset + 6)
      const entryCount = buffer.readUInt16BE(subtableOffset + 8)
      ensureRange(buffer, subtableOffset + 10, entryCount * 2, 'cmap format 6 字形表')
      for (let entry = 0; entry < entryCount; entry += 1) {
        if (buffer.readUInt16BE(subtableOffset + 10 + entry * 2) !== 0) {
          codePoints.add(firstCode + entry)
        }
      }
    } else if (format === 12 || format === 13) {
      parseFormat12Or13(buffer, subtableOffset, codePoints, format)
    }
  }

  if (codePoints.size === 0) throw new Error('字体 cmap 中没有可用字符')
  return codePoints
}

export async function inspectFontCodePoints(fontBytes) {
  const input = Buffer.from(fontBytes)
  const sourceFormat = fontverter.detectFormat(input)
  const sfnt = sourceFormat === 'sfnt' ? input : await fontverter.convert(input, 'sfnt')
  return {
    sourceFormat,
    codePoints: readSfntCodePoints(sfnt),
  }
}

export function findMissingCodePoints(requiredText, availableCodePoints) {
  return [...new Set(requiredText)].filter(
    (character) => !availableCodePoints.has(character.codePointAt(0)),
  )
}

export function summarizeCharacters(characters, maximum = 18) {
  const values = [...characters]
  const preview = values.slice(0, maximum).join('')
  return values.length > maximum ? `${preview}…（共 ${values.length} 个）` : preview
}
