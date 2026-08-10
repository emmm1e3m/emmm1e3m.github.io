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
export const bvidSchema = z.string().regex(/^BV[0-9A-Za-z]{10}$/)
export const friendIdSchema = z.enum([
  'class-representative-bing',
  'san-hao-rabbit',
  'xin-hao-rabbit',
  'signal-dog',
  'bili-bing',
])

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

export const friendImageSchema = collectibleImageSchema
  .extend({
    path: safeRelativePathSchema.refine(
      (value) => value.startsWith('assets/friends/') && value.endsWith('.webp'),
      { message: '好友图片必须来自同源 friends WebP 目录' },
    ),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()

export const friendItemSchema = z
  .object({
    id: friendIdSchema,
    name: z.string().trim().min(1),
    kind: z.enum(['human-like', 'rabbit', 'dog']),
    description: z.string().trim().min(1),
    alt: z.string().trim().min(1),
    image: friendImageSchema,
    sourceCell: z.number().int().positive().safe(),
  })
  .strict()

const bilibiliVideoMetadataFields = {
  bvid: bvidSchema,
  title: z.string().trim().min(1),
  authorName: z.string().trim().min(1),
  authorMid: z.number().int().positive().safe(),
  publishedAt: isoDateTimeSchema,
  durationSeconds: z.number().int().positive().safe(),
  coverUrl: httpUrlSchema,
  sourceUrl: httpUrlSchema,
}

function addBilibiliVideoSourceCheck(
  video: { bvid: string; sourceUrl: string },
  context: z.RefinementCtx,
) {
  if (!video.sourceUrl.includes(`/video/${video.bvid}`)) {
    context.addIssue({
      code: 'custom',
      path: ['sourceUrl'],
      message: '视频来源 URL 必须与 bvid 一致',
    })
  }
}

export const bilibiliVideoMetadataSchema = z
  .object({
    ...bilibiliVideoMetadataFields,
  })
  .strict()
  .superRefine(addBilibiliVideoSourceCheck)

export const bilibiliVideoSchema = z
  .object({
    ...bilibiliVideoMetadataFields,
    favoriteId: z.number().int().positive().safe(),
    favoriteOrder: z.number().int().positive().safe(),
  })
  .strict()
  .superRefine(addBilibiliVideoSourceCheck)

function videosMatch(
  left: z.infer<typeof bilibiliVideoMetadataSchema>,
  right: z.infer<typeof bilibiliVideoMetadataSchema>,
) {
  return (
    left.bvid === right.bvid &&
    left.title === right.title &&
    left.authorName === right.authorName &&
    left.authorMid === right.authorMid &&
    left.publishedAt === right.publishedAt &&
    left.durationSeconds === right.durationSeconds &&
    left.coverUrl === right.coverUrl &&
    left.sourceUrl === right.sourceUrl
  )
}

function favoriteVideosMatch(
  left: z.infer<typeof bilibiliVideoSchema>,
  right: z.infer<typeof bilibiliVideoSchema>,
) {
  return (
    videosMatch(left, right) &&
    left.favoriteId === right.favoriteId &&
    left.favoriteOrder === right.favoriteOrder
  )
}

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
        video: bilibiliVideoSchema,
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
        video: bilibiliVideoSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.metadata.bvid !== item.metadata.video.bvid) {
      context.addIssue({
        code: 'custom',
        path: ['metadata', 'video', 'bvid'],
        message: '全站第一条目 bvid 必须与视频元数据一致',
      })
    }
  })

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

export const friendCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedFrom: z.literal('imagegen-friend-atlas-v3'),
    generatedAt: z.iso.date(),
    rights: z.literal('user-confirmed-authorized'),
    source: z
      .object({
        path: safeRelativePathSchema.refine(
          (value) => value === 'resources/raw/travelling-bingo/generated/friend-atlas-v3.png',
          { message: '好友母版路径必须指向受控 ImageGen 资源' },
        ),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        byteLength: z.number().int().positive(),
        mime: z.literal('image/png'),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        generation: z
          .object({
            tool: z.literal('OpenAI built-in ImageGen'),
            mode: z.literal('multi-reference identity-preserve'),
            promptSummary: z.string().trim().min(1),
          })
          .strict(),
      })
      .strict(),
    itemCount: catalogItemCountSchema,
    items: z.array(friendItemSchema).min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    addCatalogConsistencyChecks(catalog, context)

    const sourceCells = new Set<number>()
    catalog.items.forEach((item, index) => {
      if (sourceCells.has(item.sourceCell)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'sourceCell'],
          message: `好友母版格位重复：${item.sourceCell}`,
        })
      }
      sourceCells.add(item.sourceCell)
    })
  })

const millionShotVideoMappingSchema = z
  .object({
    posterId: z.string().regex(/^million-shot-[0-9]+$/),
    sequence: z.number().int().positive().safe(),
    favoriteId: z.number().int().positive().safe(),
    favoriteOrder: z.number().int().positive().safe(),
    bvid: bvidSchema,
  })
  .strict()

const siteFirstVideoMappingSchema = z
  .object({
    posterId: z.string().regex(/^site-first-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    chronology: z.number().int().positive().safe(),
    favoriteId: z.number().int().positive().safe(),
    favoriteOrder: z.number().int().positive().safe(),
    bvid: bvidSchema,
    historyRank: z.literal(1),
  })
  .strict()

const bilibiliFolderSnapshotSchema = z
  .object({
    favoriteId: z.number().int().positive().safe(),
    title: z.string().trim().min(1),
    sourceUrl: httpUrlSchema,
    reportedItemCount: z.number().int().nonnegative().safe(),
    visibleItemCount: z.number().int().nonnegative().safe(),
    latestPage: z
      .object({
        pageNumber: z.literal(1),
        pageSize: z.number().int().positive().safe(),
        items: z.array(bilibiliVideoSchema).min(1),
      })
      .strict(),
  })
  .strict()

export const bilibiliVideoCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedFrom: z.literal('travelling-bingo-bilibili-video-catalog'),
    retrievedAt: isoDateTimeSchema,
    ownerMid: z.number().int().positive().safe(),
    folders: z
      .object({
        millionShots: bilibiliFolderSnapshotSchema,
        siteFirsts: bilibiliFolderSnapshotSchema,
        streaming: bilibiliFolderSnapshotSchema,
      })
      .strict(),
    videos: z.record(bvidSchema, bilibiliVideoSchema),
    posterMappings: z
      .object({
        millionShots: z.array(millionShotVideoMappingSchema).min(1),
        siteFirsts: z.array(siteFirstVideoMappingSchema).min(1),
      })
      .strict(),
    recordPlayer: z
      .object({
        sourceFavoriteId: z.number().int().positive().safe(),
        selectionRule: z.string().trim().min(1),
        items: z.array(bilibiliVideoSchema).length(8),
      })
      .strict(),
    streamPlaylist: z
      .object({
        sourceFavoriteId: z.literal(3963921644),
        selectionRule: z.string().trim().min(1),
        items: z.array(bilibiliVideoSchema).min(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((catalog, context) => {
    for (const [bvid, video] of Object.entries(catalog.videos)) {
      if (video.bvid !== bvid) {
        context.addIssue({
          code: 'custom',
          path: ['videos', bvid, 'bvid'],
          message: '视频索引键必须与条目 bvid 一致',
        })
      }
    }

    if (catalog.recordPlayer.sourceFavoriteId !== catalog.folders.siteFirsts.favoriteId) {
      context.addIssue({
        code: 'custom',
        path: ['recordPlayer', 'sourceFavoriteId'],
        message: '唱片机曲库必须来自全站第一收藏夹',
      })
    }

    const seenRecordPlayerVideos = new Set<string>()

    catalog.recordPlayer.items.forEach((video, index) => {
      const indexed = catalog.videos[video.bvid]
      if (indexed === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['recordPlayer', 'items', index, 'bvid'],
          message: '唱片机曲目必须存在于视频索引中',
        })
      } else if (!videosMatch(video, indexed)) {
        context.addIssue({
          code: 'custom',
          path: ['recordPlayer', 'items', index],
          message: '唱片机曲目必须与视频索引内容一致',
        })
      }
      if (seenRecordPlayerVideos.has(video.bvid)) {
        context.addIssue({
          code: 'custom',
          path: ['recordPlayer', 'items', index, 'bvid'],
          message: '唱片机曲目不能重复',
        })
      }
      seenRecordPlayerVideos.add(video.bvid)

      const mapping = catalog.posterMappings.siteFirsts[index]
      if (
        mapping === undefined ||
        mapping.bvid !== video.bvid ||
        mapping.chronology !== index + 1 ||
        mapping.favoriteId !== video.favoriteId ||
        mapping.favoriteOrder !== video.favoriteOrder
      ) {
        context.addIssue({
          code: 'custom',
          path: ['recordPlayer', 'items', index],
          message: '唱片机曲库必须按全站第一 chronology 第 1–8 项排列',
        })
      }
    })

    if (catalog.streamPlaylist.sourceFavoriteId !== catalog.folders.streaming.favoriteId) {
      context.addIssue({
        code: 'custom',
        path: ['streamPlaylist', 'sourceFavoriteId'],
        message: '刷播目录必须来自指定收藏夹快照',
      })
    }
    if (catalog.folders.streaming.favoriteId !== 3963921644) {
      context.addIssue({
        code: 'custom',
        path: ['folders', 'streaming', 'favoriteId'],
        message: '刷播收藏夹 ID 无效',
      })
    }
    if (catalog.streamPlaylist.items.length !== catalog.folders.streaming.visibleItemCount) {
      context.addIssue({
        code: 'custom',
        path: ['streamPlaylist', 'items'],
        message: '刷播目录必须包含收藏夹全部可见视频',
      })
    }
    if (
      catalog.folders.streaming.latestPage.items.length !==
      Math.min(
        catalog.folders.streaming.visibleItemCount,
        catalog.folders.streaming.latestPage.pageSize,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['folders', 'streaming', 'latestPage', 'items'],
        message: '刷播收藏夹首页数量与可见视频数不一致',
      })
    }

    const seenStreamVideos = new Set<string>()
    catalog.streamPlaylist.items.forEach((video, index) => {
      const indexed = catalog.videos[video.bvid]
      if (indexed === undefined || !videosMatch(video, indexed)) {
        context.addIssue({
          code: 'custom',
          path: ['streamPlaylist', 'items', index],
          message: '刷播视频必须与视频索引内容一致',
        })
      }
      if (
        video.favoriteId !== catalog.folders.streaming.favoriteId ||
        video.favoriteOrder !== index + 1
      ) {
        context.addIssue({
          code: 'custom',
          path: ['streamPlaylist', 'items', index],
          message: '刷播视频必须按收藏夹顺序排列',
        })
      }
      if (seenStreamVideos.has(video.bvid)) {
        context.addIssue({
          code: 'custom',
          path: ['streamPlaylist', 'items', index, 'bvid'],
          message: '刷播视频不能重复',
        })
      }
      seenStreamVideos.add(video.bvid)
    })
    catalog.folders.streaming.latestPage.items.forEach((video, index) => {
      const streamVideo = catalog.streamPlaylist.items[index]
      if (streamVideo === undefined || !favoriteVideosMatch(video, streamVideo)) {
        context.addIssue({
          code: 'custom',
          path: ['folders', 'streaming', 'latestPage', 'items', index],
          message: '刷播目录必须与收藏夹首页顺序一致',
        })
      }
    })

    const seenPosterIds = new Set<string>()
    for (const [category, mappings] of Object.entries(catalog.posterMappings)) {
      mappings.forEach((mapping, index) => {
        if (catalog.videos[mapping.bvid] === undefined) {
          context.addIssue({
            code: 'custom',
            path: ['posterMappings', category, index, 'bvid'],
            message: '海报映射指向了视频索引中不存在的 bvid',
          })
        }
        if (seenPosterIds.has(mapping.posterId)) {
          context.addIssue({
            code: 'custom',
            path: ['posterMappings', category, index, 'posterId'],
            message: '每张海报只能绑定一条视频',
          })
        }
        seenPosterIds.add(mapping.posterId)
      })
    }

    for (const [folderName, folder] of Object.entries(catalog.folders)) {
      folder.latestPage.items.forEach((video, index) => {
        const indexed = catalog.videos[video.bvid]
        if (indexed === undefined || !videosMatch(video, indexed)) {
          context.addIssue({
            code: 'custom',
            path: ['folders', folderName, 'latestPage', 'items', index],
            message: '收藏夹快照必须与视频索引内容一致',
          })
        }
      })
    }
  })

export type CollectibleImage = z.infer<typeof collectibleImageSchema>
export type MillionShotItem = z.infer<typeof millionShotItemSchema>
export type SiteFirstItem = z.infer<typeof siteFirstItemSchema>
export type PostcardItem = z.infer<typeof postcardItemSchema>
export type FriendItem = z.infer<typeof friendItemSchema>
export type FriendId = z.infer<typeof friendIdSchema>
export type BilibiliVideo = z.infer<typeof bilibiliVideoSchema>
export type BilibiliVideoMetadata = z.infer<typeof bilibiliVideoMetadataSchema>
export type RemoteCollectibleItem = z.infer<typeof remoteCollectibleItemSchema>
export type CollectibleItem = z.infer<typeof collectibleItemSchema>
export type CollectibleCategory = CollectibleItem['category']
export type MillionShotCatalogSource = z.infer<typeof millionShotCatalogSchema>
export type SiteFirstCatalogSource = z.infer<typeof siteFirstCatalogSchema>
export type PostcardCatalogSource = z.infer<typeof postcardCatalogSchema>
export type FriendCatalogSource = z.infer<typeof friendCatalogSchema>
export type BilibiliVideoCatalogSource = z.infer<typeof bilibiliVideoCatalogSchema>
