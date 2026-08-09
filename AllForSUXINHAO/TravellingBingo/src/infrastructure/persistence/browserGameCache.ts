import { z } from 'zod'

export const BROWSER_GAME_CACHE_KEY = 'travelling-bingo:browser-save:v1'
export const BROWSER_GAME_CACHE_FORMAT = 'travelling-bingo-browser-save' as const
export const BROWSER_GAME_CACHE_VERSION = 1 as const

const MAX_JAVASCRIPT_TIMESTAMP = 8_640_000_000_000_000

const browserGameCacheSchema = z.strictObject({
  format: z.literal(BROWSER_GAME_CACHE_FORMAT),
  cacheVersion: z.literal(BROWSER_GAME_CACHE_VERSION),
  saveId: z.string().min(1).max(128),
  gameVersion: z.string().min(1).max(64),
  firstCachedAt: z.number().int().nonnegative().max(MAX_JAVASCRIPT_TIMESTAMP),
  updatedAt: z.number().int().nonnegative().max(MAX_JAVASCRIPT_TIMESTAMP),
  lastPeriodicBackupRequestedAt: z
    .number()
    .int()
    .nonnegative()
    .max(MAX_JAVASCRIPT_TIMESTAMP)
    .nullable(),
  payload: z.unknown(),
})

export interface BrowserGameCache<TPayload = unknown> {
  format: typeof BROWSER_GAME_CACHE_FORMAT
  cacheVersion: typeof BROWSER_GAME_CACHE_VERSION
  saveId: string
  gameVersion: string
  firstCachedAt: number
  updatedAt: number
  lastPeriodicBackupRequestedAt: number | null
  payload: TPayload
}

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem'>

function resolveBrowserStorage(storage?: BrowserStorage): BrowserStorage {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch (error) {
    throw new Error('当前浏览器无法使用缓存存档。', { cause: error })
  }
}

export function createBrowserGameCache<TPayload>(input: {
  saveId: string
  gameVersion: string
  now: number
  payload: TPayload
}): BrowserGameCache<TPayload> {
  const cache: BrowserGameCache<TPayload> = {
    format: BROWSER_GAME_CACHE_FORMAT,
    cacheVersion: BROWSER_GAME_CACHE_VERSION,
    saveId: input.saveId,
    gameVersion: input.gameVersion,
    firstCachedAt: input.now,
    updatedAt: input.now,
    lastPeriodicBackupRequestedAt: null,
    payload: input.payload,
  }
  const parsed = browserGameCacheSchema.safeParse(cache)
  if (!parsed.success) throw new Error('无法创建浏览器缓存存档。', { cause: parsed.error })
  return cache
}

export function updateBrowserGameCache<TPayload>(
  cache: BrowserGameCache<unknown>,
  payload: TPayload,
  updatedAt: number,
  gameVersion = cache.gameVersion,
): BrowserGameCache<TPayload> {
  return {
    ...cache,
    gameVersion,
    updatedAt,
    payload,
  }
}

export function markPeriodicBackupRequested<TPayload>(
  cache: BrowserGameCache<TPayload>,
  requestedAt: number,
): BrowserGameCache<TPayload> {
  return { ...cache, lastPeriodicBackupRequestedAt: requestedAt }
}

export function readBrowserGameCache(storage?: BrowserStorage): BrowserGameCache<unknown> | null {
  let serialized: string | null
  try {
    serialized = resolveBrowserStorage(storage).getItem(BROWSER_GAME_CACHE_KEY)
  } catch (error) {
    throw new Error('浏览器缓存存档没有读取成功。', { cause: error })
  }
  if (serialized === null) return null

  let raw: unknown
  try {
    raw = JSON.parse(serialized) as unknown
  } catch (error) {
    throw new Error('浏览器缓存存档不是有效的 JSON。', { cause: error })
  }
  const parsed = browserGameCacheSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('浏览器缓存存档的结构或版本无效。', { cause: parsed.error })
  }
  return parsed.data as BrowserGameCache<unknown>
}

export function writeBrowserGameCache<TPayload>(
  cache: BrowserGameCache<TPayload>,
  storage?: BrowserStorage,
): void {
  const parsed = browserGameCacheSchema.safeParse(cache)
  if (!parsed.success) {
    throw new Error('浏览器缓存存档没有通过写入校验。', { cause: parsed.error })
  }
  try {
    resolveBrowserStorage(storage).setItem(BROWSER_GAME_CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    throw new Error('浏览器缓存存档没有写入成功，请下载存档后再离开。', { cause: error })
  }
}
