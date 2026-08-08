import { mergeContentCatalogs, type ContentCatalog } from './catalog'
import {
  friendCatalogSchema,
  bilibiliVideoCatalogSchema,
  millionShotCatalogSchema,
  postcardCatalogSchema,
  siteFirstCatalogSchema,
} from './schema'

const MILLION_SHOT_CATALOG_PATH = 'data/million-shot-posters.json'
const SITE_FIRST_CATALOG_PATH = 'data/site-firsts.json'
const POSTCARD_CATALOG_PATH = 'data/postcards.json'
const FRIEND_CATALOG_PATH = 'data/friends.json'
const VIDEO_CATALOG_PATH = 'data/video-catalog.json'

export type CatalogFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface LoadContentCatalogOptions {
  readonly baseUrl?: string
  readonly fetch?: CatalogFetch
}

export class ContentCatalogLoadError extends Error {
  constructor(
    message: string,
    readonly url: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ContentCatalogLoadError'
  }
}

function assertSafePath(path: string, label: string) {
  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('%') ||
    path.includes('?') ||
    path.includes('#') ||
    path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`${label} 必须是安全的相对路径`)
  }
}

/** 使用 Vite 注入的应用基路径拼接公开资源 URL，禁止跨目录或跨源。 */
export function resolvePublicUrl(
  relativePath: string,
  baseUrl: string = import.meta.env.BASE_URL,
): string {
  assertSafePath(relativePath, '资源路径')

  if (
    !baseUrl.startsWith('/') ||
    baseUrl.startsWith('//') ||
    baseUrl.includes('\\') ||
    baseUrl.includes('%') ||
    baseUrl.includes('?') ||
    baseUrl.includes('#')
  ) {
    throw new Error('应用基路径必须是同源绝对路径')
  }

  const baseSegments = baseUrl.split('/').filter(Boolean)
  if (baseSegments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('应用基路径不能跨目录')
  }

  const normalizedBase = `/${baseSegments.join('/')}/`
  return `${normalizedBase}${relativePath}`
}

async function loadJson(url: string, fetcher: CatalogFetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
  } catch (error) {
    throw new ContentCatalogLoadError(`无法请求收藏目录：${url}`, url, { cause: error })
  }

  if (!response.ok) {
    throw new ContentCatalogLoadError(
      `收藏目录请求失败：${response.status} ${response.statusText}`.trim(),
      url,
    )
  }

  try {
    return await response.json()
  } catch (error) {
    throw new ContentCatalogLoadError(`收藏目录不是有效 JSON：${url}`, url, { cause: error })
  }
}

export async function loadContentCatalog(
  options: LoadContentCatalogOptions = {},
): Promise<ContentCatalog> {
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL
  const fetcher = options.fetch ?? globalThis.fetch
  if (!fetcher) {
    throw new Error('当前环境不支持 fetch，无法加载收藏目录')
  }

  const millionShotUrl = resolvePublicUrl(MILLION_SHOT_CATALOG_PATH, baseUrl)
  const siteFirstUrl = resolvePublicUrl(SITE_FIRST_CATALOG_PATH, baseUrl)
  const postcardUrl = resolvePublicUrl(POSTCARD_CATALOG_PATH, baseUrl)
  const friendUrl = resolvePublicUrl(FRIEND_CATALOG_PATH, baseUrl)
  const videoUrl = resolvePublicUrl(VIDEO_CATALOG_PATH, baseUrl)
  const [millionShotInput, siteFirstInput, postcardInput, friendInput, videoInput] =
    await Promise.all([
      loadJson(millionShotUrl, fetcher),
      loadJson(siteFirstUrl, fetcher),
      loadJson(postcardUrl, fetcher),
      loadJson(friendUrl, fetcher),
      loadJson(videoUrl, fetcher),
    ])

  const millionShotResult = millionShotCatalogSchema.safeParse(millionShotInput)
  if (!millionShotResult.success) {
    throw new ContentCatalogLoadError('百万直拍目录未通过契约校验', millionShotUrl, {
      cause: millionShotResult.error,
    })
  }

  const siteFirstResult = siteFirstCatalogSchema.safeParse(siteFirstInput)
  if (!siteFirstResult.success) {
    throw new ContentCatalogLoadError('全站第一目录未通过契约校验', siteFirstUrl, {
      cause: siteFirstResult.error,
    })
  }

  const postcardResult = postcardCatalogSchema.safeParse(postcardInput)
  if (!postcardResult.success) {
    throw new ContentCatalogLoadError('明信片目录未通过契约校验', postcardUrl, {
      cause: postcardResult.error,
    })
  }

  const friendResult = friendCatalogSchema.safeParse(friendInput)
  if (!friendResult.success) {
    throw new ContentCatalogLoadError('好友目录未通过契约校验', friendUrl, {
      cause: friendResult.error,
    })
  }
  const videoResult = bilibiliVideoCatalogSchema.safeParse(videoInput)
  if (!videoResult.success) {
    throw new ContentCatalogLoadError('视频目录未通过契约校验', videoUrl, {
      cause: videoResult.error,
    })
  }

  return mergeContentCatalogs(
    millionShotResult.data,
    siteFirstResult.data,
    postcardResult.data,
    friendResult.data,
    videoResult.data,
  )
}
