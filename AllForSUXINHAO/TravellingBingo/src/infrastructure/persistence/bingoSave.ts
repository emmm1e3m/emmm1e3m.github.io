import { z } from 'zod'

export const BINGO_SAVE_FORMAT = 'travelling-bingo-save' as const
export const BINGO_SAVE_SCHEMA_VERSION = 1 as const
export const BINGO_SAVE_EXTENSION = '.bingo' as const
export const BINGO_SAVE_MIME_TYPE = 'application/octet-stream' as const
export const MAX_BINGO_SAVE_BYTES = 1024 * 1024

const MAX_JAVASCRIPT_TIMESTAMP = 8_640_000_000_000_000
const SHA_256_BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type BingoSaveErrorCode =
  | 'FILE_TOO_LARGE'
  | 'INVALID_UTF8'
  | 'INVALID_JSON'
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'FUTURE_VERSION'
  | 'SCHEMA_INVALID'
  | 'INTEGRITY_MISMATCH'
  | 'SERIALIZATION_FAILED'
  | 'CRYPTO_UNAVAILABLE'
  | 'DOWNLOAD_UNAVAILABLE'

export class BingoSaveError extends Error {
  readonly code: BingoSaveErrorCode

  constructor(code: BingoSaveErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BingoSaveError'
    this.code = code
  }
}

export interface BingoSaveIntegrity {
  algorithm: 'SHA-256'
  digest: string
}

export interface BingoSaveEnvelope<TPayload> {
  format: typeof BINGO_SAVE_FORMAT
  schemaVersion: typeof BINGO_SAVE_SCHEMA_VERSION
  gameVersion: string
  exportedAt: number
  payload: TPayload
  integrity: BingoSaveIntegrity
}

export interface CreateBingoSaveInput<TPayload> {
  gameVersion: string
  payload: TPayload
  exportedAt?: number
}

export interface BingoSaveSummary {
  format: typeof BINGO_SAVE_FORMAT
  schemaVersion: typeof BINGO_SAVE_SCHEMA_VERSION
  gameVersion: string
  exportedAt: number
  exportedAtIso: string
  byteLength: number
  digest: string
}

export interface BingoSaveExport<TPayload> {
  fileName: string
  text: string
  byteLength: number
  save: BingoSaveEnvelope<TPayload>
  summary: BingoSaveSummary
}

export interface BingoSaveImportResult<TPayload> {
  save: BingoSaveEnvelope<TPayload>
  payload: TPayload
  summary: BingoSaveSummary
}

export type BingoSaveImportSource = string | Blob | ArrayBuffer | Uint8Array

export interface BingoCryptoDependencies {
  subtle?: Pick<SubtleCrypto, 'digest'>
  now?: () => number
}

export interface BingoDownloadDependencies {
  document?: Document
  urlApi?: {
    createObjectURL(blob: Blob): string
    revokeObjectURL(url: string): void
  }
  scheduleCleanup?: (callback: () => void) => void
}

const integritySchema = z.strictObject({
  algorithm: z.literal('SHA-256'),
  digest: z.string().regex(SHA_256_BASE64URL_PATTERN),
})

const envelopeBaseShape = {
  format: z.literal(BINGO_SAVE_FORMAT),
  schemaVersion: z.literal(BINGO_SAVE_SCHEMA_VERSION),
  gameVersion: z.string().min(1).max(64),
  exportedAt: z.number().int().nonnegative().max(MAX_JAVASCRIPT_TIMESTAMP),
}

const preflightSchema = z
  .object({
    format: z.unknown(),
    schemaVersion: z.unknown(),
  })
  .passthrough()

function makeEnvelopeSchema<TPayload>(payloadSchema: z.ZodType<TPayload>) {
  return z.strictObject({
    ...envelopeBaseShape,
    payload: payloadSchema,
    integrity: integritySchema,
  })
}

function makeUnsignedEnvelopeSchema<TPayload>(payloadSchema: z.ZodType<TPayload>) {
  return z.strictObject({
    ...envelopeBaseShape,
    payload: payloadSchema,
  })
}

/**
 * 生成与对象插入顺序无关的紧凑 JSON。对象键按稳定字典序排序，数组顺序保持不变。
 */
export function stableStringify(value: unknown): string {
  const ancestors = new WeakSet<object>()

  const serialize = (current: unknown, path: string): string => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') {
      return JSON.stringify(current)
    }

    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new BingoSaveError(
          'SERIALIZATION_FAILED',
          `无法生成存档：字段“${path}”不是有限数值。`,
        )
      }
      return JSON.stringify(current)
    }

    if (typeof current !== 'object') {
      throw new BingoSaveError(
        'SERIALIZATION_FAILED',
        `无法生成存档：字段“${path}”不是有效的 JSON 值。`,
      )
    }

    if (ancestors.has(current)) {
      throw new BingoSaveError('SERIALIZATION_FAILED', '无法生成存档：数据中存在循环引用。')
    }

    ancestors.add(current)
    try {
      if (Array.isArray(current)) {
        return `[${current.map((item, index) => serialize(item, `${path}[${index}]`)).join(',')}]`
      }

      const prototype = Object.getPrototypeOf(current)
      if (prototype !== Object.prototype && prototype !== null) {
        throw new BingoSaveError(
          'SERIALIZATION_FAILED',
          `无法生成存档：字段“${path}”不是普通对象。`,
        )
      }

      const record = current as Record<string, unknown>
      const entries = Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`)}`)
      return `{${entries.join(',')}}`
    } finally {
      ancestors.delete(current)
    }
  }

  return serialize(value, '$')
}

function schemaValidationError(error: z.ZodError): BingoSaveError {
  const firstIssue = error.issues[0]
  const field = firstIssue?.path.length ? firstIssue.path.join('.') : '根节点'
  return new BingoSaveError('SCHEMA_INVALID', `存档结构无效：字段“${field}”未通过校验。`, {
    cause: error,
  })
}

function resolveSubtleCrypto(
  dependency?: Pick<SubtleCrypto, 'digest'>,
): Pick<SubtleCrypto, 'digest'> {
  const subtle = dependency ?? globalThis.crypto?.subtle
  if (!subtle) {
    throw new BingoSaveError('CRYPTO_UNAVAILABLE', '当前浏览器无法计算存档摘要。')
  }
  return subtle
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

async function sha256Base64Url(
  value: string,
  subtleDependency?: Pick<SubtleCrypto, 'digest'>,
): Promise<string> {
  const subtle = resolveSubtleCrypto(subtleDependency)
  try {
    const bytes = new TextEncoder().encode(value)
    const hash = await subtle.digest('SHA-256', bytes)
    return bytesToBase64Url(new Uint8Array(hash))
  } catch (error) {
    throw new BingoSaveError('CRYPTO_UNAVAILABLE', '存档摘要计算失败。', { cause: error })
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

function assertFileSize(size: number): void {
  if (size > MAX_BINGO_SAVE_BYTES) {
    throw new BingoSaveError(
      'FILE_TOO_LARGE',
      `存档文件不能超过 1 MiB（当前为 ${size.toLocaleString('zh-CN')} 字节）。`,
    )
  }
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, '0')
}

export function createBingoSaveFileName(exportedAt: number): string {
  const date = new Date(exportedAt)
  const datePart = `${date.getFullYear()}${padDatePart(date.getMonth() + 1)}${padDatePart(date.getDate())}`
  const timePart = `${padDatePart(date.getHours())}${padDatePart(date.getMinutes())}${padDatePart(date.getSeconds())}`
  return `travelling-bingo-${datePart}-${timePart}${BINGO_SAVE_EXTENSION}`
}

function createSummary<TPayload>(
  save: BingoSaveEnvelope<TPayload>,
  size: number,
): BingoSaveSummary {
  return {
    format: save.format,
    schemaVersion: save.schemaVersion,
    gameVersion: save.gameVersion,
    exportedAt: save.exportedAt,
    exportedAtIso: new Date(save.exportedAt).toISOString(),
    byteLength: size,
    digest: save.integrity.digest,
  }
}

/**
 * 校验业务方提供的 payload，生成规范 JSON，并对不含 integrity 的内容计算摘要。
 */
export async function createBingoSave<TPayload>(
  input: CreateBingoSaveInput<TPayload>,
  payloadSchema: z.ZodType<TPayload>,
  dependencies: BingoCryptoDependencies = {},
): Promise<BingoSaveExport<TPayload>> {
  const unsignedResult = makeUnsignedEnvelopeSchema(payloadSchema).safeParse({
    format: BINGO_SAVE_FORMAT,
    schemaVersion: BINGO_SAVE_SCHEMA_VERSION,
    gameVersion: input.gameVersion,
    exportedAt: input.exportedAt ?? dependencies.now?.() ?? Date.now(),
    payload: input.payload,
  })

  if (!unsignedResult.success) {
    throw schemaValidationError(unsignedResult.error)
  }

  const unsigned = unsignedResult.data
  const digest = await sha256Base64Url(stableStringify(unsigned), dependencies.subtle)
  const save: BingoSaveEnvelope<TPayload> = {
    ...unsigned,
    integrity: {
      algorithm: 'SHA-256',
      digest,
    },
  }
  const text = stableStringify(save)
  const size = byteLength(text)
  assertFileSize(size)

  return {
    fileName: createBingoSaveFileName(save.exportedAt),
    text,
    byteLength: size,
    save,
    summary: createSummary(save, size),
  }
}

async function readUtf8Source(source: BingoSaveImportSource): Promise<{
  text: string
  byteLength: number
}> {
  if (typeof source === 'string') {
    const size = byteLength(source)
    assertFileSize(size)
    return { text: source.replace(/^\uFEFF/u, ''), byteLength: size }
  }

  let bytes: Uint8Array
  if (source instanceof Blob) {
    assertFileSize(source.size)
    bytes = new Uint8Array(await source.arrayBuffer())
  } else if (source instanceof ArrayBuffer) {
    assertFileSize(source.byteLength)
    bytes = new Uint8Array(source)
  } else {
    assertFileSize(source.byteLength)
    bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: text.replace(/^\uFEFF/u, ''), byteLength: bytes.byteLength }
  } catch (error) {
    throw new BingoSaveError('INVALID_UTF8', '存档不是有效的 UTF-8 文本。', { cause: error })
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new BingoSaveError('INVALID_JSON', '存档不是有效的 JSON 文件。', { cause: error })
  }
}

function validatePreflight(value: unknown): void {
  const result = preflightSchema.safeParse(value)
  if (!result.success) {
    throw schemaValidationError(result.error)
  }

  if (result.data.format !== BINGO_SAVE_FORMAT) {
    throw new BingoSaveError('INVALID_FORMAT', '这不是“旅行饼狗”的存档文件。')
  }

  const version = result.data.schemaVersion
  if (!Number.isSafeInteger(version)) {
    throw new BingoSaveError('SCHEMA_INVALID', '存档格式版本无效。')
  }
  if ((version as number) > BINGO_SAVE_SCHEMA_VERSION) {
    throw new BingoSaveError(
      'FUTURE_VERSION',
      `该存档来自更新的格式版本（v${String(version)}），当前版本暂时无法读取。`,
    )
  }
  if ((version as number) < BINGO_SAVE_SCHEMA_VERSION) {
    throw new BingoSaveError('UNSUPPORTED_VERSION', `暂不支持格式版本 v${String(version)} 的存档。`)
  }
}

/**
 * 导入流程先限制字节数、解码和严格校验，再验证摘要；调用方只在成功后采用 payload。
 */
export async function importBingoSave<TPayload>(
  source: BingoSaveImportSource,
  payloadSchema: z.ZodType<TPayload>,
  dependencies: Pick<BingoCryptoDependencies, 'subtle'> = {},
): Promise<BingoSaveImportResult<TPayload>> {
  const decoded = await readUtf8Source(source)
  const raw = parseJson(decoded.text)
  validatePreflight(raw)

  const envelopeResult = makeEnvelopeSchema(payloadSchema).safeParse(raw)
  if (!envelopeResult.success) {
    throw schemaValidationError(envelopeResult.error)
  }

  const save = envelopeResult.data
  const rawRecord = raw as Record<string, unknown>
  // 摘要基于文件中的原始 JSON 值计算，避免 Zod transform 改变校验语义。
  const rawUnsigned = {
    format: rawRecord.format,
    schemaVersion: rawRecord.schemaVersion,
    gameVersion: rawRecord.gameVersion,
    exportedAt: rawRecord.exportedAt,
    payload: rawRecord.payload,
  }
  const actualDigest = await sha256Base64Url(stableStringify(rawUnsigned), dependencies.subtle)
  if (actualDigest !== save.integrity.digest) {
    throw new BingoSaveError('INTEGRITY_MISMATCH', '存档摘要不匹配，文件可能已损坏或被修改。')
  }

  return {
    save,
    payload: save.payload,
    summary: createSummary(save, decoded.byteLength),
  }
}

export function createBingoSaveBlob(text: string): Blob {
  const size = byteLength(text)
  assertFileSize(size)
  return new Blob([text], { type: BINGO_SAVE_MIME_TYPE })
}

/** 在一次可信点击事件内调用，触发浏览器下载后释放临时对象 URL。 */
export function downloadBingoSave(
  exported: Pick<BingoSaveExport<unknown>, 'fileName' | 'text'>,
  dependencies: BingoDownloadDependencies = {},
): Blob {
  const documentObject = dependencies.document ?? globalThis.document
  const urlApi = dependencies.urlApi ?? globalThis.URL
  if (!documentObject?.body || !urlApi?.createObjectURL || !urlApi.revokeObjectURL) {
    throw new BingoSaveError('DOWNLOAD_UNAVAILABLE', '当前环境无法下载存档文件。')
  }

  const blob = createBingoSaveBlob(exported.text)
  const objectUrl = urlApi.createObjectURL(blob)
  const anchor = documentObject.createElement('a')
  anchor.href = objectUrl
  anchor.download = exported.fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  documentObject.body.append(anchor)

  try {
    anchor.click()
  } catch (error) {
    anchor.remove()
    urlApi.revokeObjectURL(objectUrl)
    throw new BingoSaveError('DOWNLOAD_UNAVAILABLE', '浏览器未能启动存档下载。', {
      cause: error,
    })
  }

  anchor.remove()
  const scheduleCleanup = dependencies.scheduleCleanup ?? ((callback) => setTimeout(callback, 0))
  scheduleCleanup(() => urlApi.revokeObjectURL(objectUrl))
  return blob
}
