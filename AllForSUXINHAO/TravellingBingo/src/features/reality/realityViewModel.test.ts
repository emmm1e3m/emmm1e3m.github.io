import type { CollectibleItem, ContentCatalog } from '@/content'
import { createInitialGameState, type GameState, type WardrobePhoto } from '@/domain'

import { buildPomodoroBackgroundOptions, findPomodoroBackgroundOption } from './realityViewModel'

const postcard = {
  id: 'postcard-clock',
  category: 'postcard',
  title: '苹果钟明信片',
  alt: '苹果钟明信片风景',
  caption: '一起看风景。',
  rights: 'user-confirmed-authorized',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcard-clock-480.webp',
      byteLength: 1,
      mime: 'image/webp',
    },
    {
      width: 960,
      height: 1280,
      path: 'assets/collectibles/postcard-clock-960.webp',
      byteLength: 1,
      mime: 'image/webp',
    },
  ],
  tags: ['测试'],
  source: { url: 'https://example.com/postcard-clock' },
} as CollectibleItem

const catalog: ContentCatalog = {
  items: [postcard],
  byId: { [postcard.id]: postcard },
  categoryCounts: { postcard: 1, 'million-shot': 0, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [],
  friendById: {},
  videosByBvid: {},
  recordPlayerVideos: [],
}

const photo: WardrobePhoto = {
  photoId: 'photo-clock',
  postcardId: postcard.id,
  participants: [],
  decorations: [],
  createdAt: new Date(2026, 7, 11).getTime(),
}

function gameWithPhoto(savedPhoto: WardrobePhoto | null): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'pomodoro-photo-background' })
  return {
    ...game,
    collections: {
      [postcard.id]: { id: postcard.id, firstObtainedAt: 1_000, duplicateCount: 0 },
    },
    wardrobe: {
      ...game.wardrobe,
      photos: savedPhoto ? { [savedPhoto.photoId]: savedPhoto } : {},
    },
  }
}

describe('苹果钟背景视图模型', () => {
  it('同时列出已收藏明信片与保存的奇迹合拍，并为合拍选择清晰度资源', () => {
    const options = buildPomodoroBackgroundOptions(gameWithPhoto(photo), catalog)

    expect(options.map((option) => option.ref)).toEqual([
      { kind: 'postcard', id: postcard.id },
      { kind: 'wardrobe-photo', id: photo.photoId },
    ])
    const photoOption = options[1]
    expect(photoOption?.kind).toBe('wardrobe-photo')
    if (photoOption?.kind !== 'wardrobe-photo') throw new Error('测试合拍背景未生成')
    expect(photoOption.thumbnailPostcard?.url).toMatch(/postcard-clock-480\.webp$/u)
    expect(photoOption.fullPostcard?.url).toMatch(/postcard-clock-960\.webp$/u)
    expect(photoOption.aspectRatio).toBe(0.75)
    expect(photoOption.title).toBe('奇迹合拍 · 8月11日')
  })

  it('照片删除后不再解析旧引用，界面可以自然回退到白纸', () => {
    const selected = { kind: 'wardrobe-photo', id: photo.photoId } as const
    const before = buildPomodoroBackgroundOptions(gameWithPhoto(photo), catalog)
    const after = buildPomodoroBackgroundOptions(gameWithPhoto(null), catalog)

    expect(findPomodoroBackgroundOption(before, selected)?.id).toBe(photo.photoId)
    expect(findPomodoroBackgroundOption(after, selected)).toBeNull()
  })

  it('失效明信片引用保留人物合拍并使用暖白默认比例', () => {
    const orphaned = { ...photo, photoId: 'photo-orphaned', postcardId: null }
    const options = buildPomodoroBackgroundOptions(gameWithPhoto(orphaned), catalog)
    const option = options.find((candidate) => candidate.kind === 'wardrobe-photo')

    expect(option?.kind).toBe('wardrobe-photo')
    if (option?.kind !== 'wardrobe-photo') throw new Error('测试合拍背景未生成')
    expect(option.thumbnailPostcard).toBeNull()
    expect(option.fullPostcard).toBeNull()
    expect(option.aspectRatio).toBe(4 / 3)
  })
})
