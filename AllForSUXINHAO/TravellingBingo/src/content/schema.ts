import { z } from 'zod'

const safeRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (
        value.startsWith('/') ||
        value.includes('\\') ||
        value.includes('%') ||
        value.includes('?') ||
        value.includes('#')
      ) {
        return false
      }

      return value
        .split('/')
        .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
    },
    { message: '必须是公开目录内不含跳级、查询参数或锚点的相对路径' },
  )

const httpUrlSchema = z.url({ protocol: /^https?$/ })
const isoDateTimeSchema = z.iso.datetime({ offset: true })
const catalogSourceIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const millionShotCatalogSourceIdSchema = catalogSourceIdSchema.refine(
  (value) => value.startsWith('weibo-million-shot-posters-'),
  { message: '百万直拍目录必须来自 weibo-million-shot-posters 来源清单' },
)
const siteFirstCatalogSourceIdSchema = catalogSourceIdSchema.refine(
  (value) => value.startsWith('bilibili-all-site-number-one-'),
  { message: '全站第一目录必须来自 bilibili-all-site-number-one 来源清单' },
)
const postcardCatalogSourceIdSchema = catalogSourceIdSchema.refine(
  (value) => value.startsWith('bilibilitoy-suxinhao-postcards-'),
  { message: '明信片目录必须来自 bilibilitoy-suxinhao-postcards 来源清单' },
)
const catalogItemCountSchema = z.number().int().positive().safe()

export const collectibleImageSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    path: safeRelativePathSchema,
    byteLength: z.number().int().positive(),
    mime: z.literal('image/webp'),
  })
  .strict()

export const postcardImageSchema = collectibleImageSchema
  .extend({
    path: safeRelativePathSchema.refine(
      (value) => value.startsWith('assets/collectibles/postcards/') && value.endsWith('.webp'),
      { message: '明信片图片必须来自同源 postcards WebP 目录' },
    ),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

const baseCollectibleFields = {
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1),
  alt: z.string().trim().min(1),
  rights: z.literal('user-confirmed-authorized'),
  images: z.array(collectibleImageSchema).min(1),
  tags: z.array(z.string().trim().min(1)).min(1),
}

export const millionShotItemSchema = z
  .object({
    ...baseCollectibleFields,
    category: z.literal('million-shot'),
    source: z
      .object({
        platform: z.literal('weibo'),
        url: httpUrlSchema,
        publishedAt: isoDateTimeSchema,
        accessedAt: isoDateTimeSchema,
      })
      .strict(),
    metadata: z
      .object({
        sequence: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()

export const siteFirstItemSchema = z
  .object({
    ...baseCollectibleFields,
    category: z.literal('site-first'),
    source: z
      .object({
        platform: z.literal('bilibili'),
        url: httpUrlSchema,
        accessedAt: isoDateTimeSchema,
      })
      .strict(),
    metadata: z
      .object({
        bvid: z.string().regex(/^BV[0-9A-Za-z]{10}$/),
        chronology: z.number().int().positive().safe(),
        programCategory: z.string().trim().min(1),
        posterKind: z.enum(['designed-poster', 'video-cover-fallback']),
      })
      .strict(),
  })
  .strict()

export const postcardItemSchema = z
  .object({
    id: z.string().regex(/^postcard-[0-9]{4}-[0-9]{2}-[0-9]{4}$/),
    category: z.literal('postcard'),
    title: z.string().trim().min(1),
    alt: z.string().trim().min(1),
    caption: z.string().trim().min(1),
    date: z.iso.date(),
    source: z
      .object({
        platform: z.literal('bilibilitoy'),
        url: httpUrlSchema,
        pageUrl: httpUrlSchema,
        accessedAt: isoDateTimeSchema,
      })
      .strict(),
    rights: z.literal('user-confirmed-authorized'),
    images: z.array(postcardImageSchema).min(1),
    tags: z.array(z.string().trim().min(1)).min(1),
    metadata: z
      .object({
        sourceId: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{4}$/),
        sourceName: z.string().trim().min(1),
        sourceKind: z.literal('published'),
        monthKey: z.string().regex(/^[0-9]{4}-[0-9]{2}$/),
        original: z
          .object({
            url: httpUrlSchema,
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            format: z.literal('webp'),
            byteLength: z.number().int().positive(),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.id !== `postcard-${item.metadata.sourceId}`) {
      context.addIssue({
        code: 'custom',
        path: ['id'],
        message: '明信片 ID 必须由 postcard- 与 sourceId 组成',
      })
    }
  })

export const remoteCollectibleItemSchema = z.discriminatedUnion('category', [
  millionShotItemSchema,
  siteFirstItemSchema,
])

export const collectibleItemSchema = z.discriminatedUnion('category', [
  millionShotItemSchema,
  siteFirstItemSchema,
  postcardItemSchema,
])

function addCatalogConsistencyChecks(
  catalog: { itemCount: number; items: ReadonlyArray<{ id: string }> },
  context: z.RefinementCtx,
) {
  if (catalog.itemCount !== catalog.items.length) {
    context.addIssue({
      code: 'custom',
      path: ['itemCount'],
      message: `itemCount 为 ${catalog.itemCount}，实际 items 数量为 ${catalog.items.length}`,
    })
  }

  const seenIds = new Set<string>()
  catalog.items.forEach((item, index) => {
    if (seenIds.has(item.id)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'id'],
        message: `目录内存在重复 ID：${item.id}`,
      })
    }
    seenIds.add(item.id)
  })
}

export const millionShotCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedFrom: millionShotCatalogSourceIdSchema,
    itemCount: catalogItemCountSchema,
    items: z.array(millionShotItemSchema).min(1),
  })
  .strict()
  .superRefine(addCatalogConsistencyChecks)

export const siteFirstCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedFrom: siteFirstCatalogSourceIdSchema,
    itemCount: catalogItemCountSchema,
    items: z.array(siteFirstItemSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    addCatalogConsistencyChecks(catalog, context)
    const chronology = [...catalog.items].sort(
      (left, right) => left.metadata.chronology - right.metadata.chronology,
    )
    chronology.forEach((item, index) => {
      if (item.metadata.chronology !== index + 1) {
        context.addIssue({
          code: 'custom',
          path: ['items', catalog.items.indexOf(item), 'metadata', 'chronology'],
          message: '全站第一 chronology 必须是从 1 开始且无缺口、无重复的连续正整数',
        })
      }
    })
    if (chronology[0]?.id !== 'site-first-dynamite') {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: '全站第一时间序列必须从 Dynamite 开始',
      })
    }
  })

export const postcardCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedFrom: postcardCatalogSourceIdSchema,
    itemCount: catalogItemCountSchema,
    source: z
      .object({
        platform: z.literal('bilibilitoy'),
        entryUrl: httpUrlSchema,
        embeddedDataUrl: httpUrlSchema,
        accessedAt: isoDateTimeSchema,
        rights: z.literal('user-confirmed-authorized'),
      })
      .strict(),
    selection: z
      .object({
        method: z.literal('hand-curated-contact-sheet'),
        selectedSourceIds: z.array(z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{4}$/)),
      })
      .strict(),
    items: z.array(postcardItemSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    addCatalogConsistencyChecks(catalog, context)

    const selectedIds = new Set(catalog.selection.selectedSourceIds)
    if (
      selectedIds.size !== catalog.selection.selectedSourceIds.length ||
      selectedIds.size !== catalog.items.length ||
      catalog.items.some((item) => !selectedIds.has(item.metadata.sourceId))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selection', 'selectedSourceIds'],
        message: '入选 sourceId 必须唯一且与 items 完全一致',
      })
    }

    catalog.items.forEach((item, index) => {
      if (item.source.pageUrl !== catalog.source.entryUrl) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'source', 'pageUrl'],
          message: '条目 pageUrl 必须指向目录声明的 Bilibili Toy 入口',
        })
      }
      if (item.source.url !== item.metadata.original.url) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'source', 'url'],
          message: '条目来源 URL 必须与原图来源一致',
        })
      }
    })
  })

export type CollectibleImage = z.infer<typeof collectibleImageSchema>
export type MillionShotItem = z.infer<typeof millionShotItemSchema>
export type SiteFirstItem = z.infer<typeof siteFirstItemSchema>
export type PostcardItem = z.infer<typeof postcardItemSchema>
export type RemoteCollectibleItem = z.infer<typeof remoteCollectibleItemSchema>
export type CollectibleItem = z.infer<typeof collectibleItemSchema>
export type CollectibleCategory = CollectibleItem['category']
export type MillionShotCatalogSource = z.infer<typeof millionShotCatalogSchema>
export type SiteFirstCatalogSource = z.infer<typeof siteFirstCatalogSchema>
export type PostcardCatalogSource = z.infer<typeof postcardCatalogSchema>
