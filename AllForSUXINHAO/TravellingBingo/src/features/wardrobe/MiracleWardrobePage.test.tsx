import { fireEvent, render, screen } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog, FriendItem } from '@/content'
import { createInitialGameState, type GameAction, type GameState } from '@/domain'
import { getWardrobeCatalogItem, MAX_WARDROBE_PHOTOS } from '@/domain/game/wardrobe'
import type { SavedWardrobeLook, WardrobePhoto } from '@/domain/game/types'

import wardrobeStyles from './MiracleWardrobePage.css?raw'
import { MiracleWardrobePage } from './MiracleWardrobePage'

const postcard = {
  id: 'postcard-2025-01-0001',
  category: 'postcard',
  title: '测试明信片',
  alt: '测试明信片照片',
  images: [
    {
      width: 480,
      height: 640,
      path: 'assets/collectibles/postcards/test.webp',
      byteLength: 1,
      mime: 'image/webp',
      sha256: '0'.repeat(64),
    },
  ],
  tags: ['测试'],
  source: { url: 'https://example.com/postcard' },
} as unknown as CollectibleItem

const signalDog = {
  id: 'signal-dog',
  name: '信号狗',
  kind: 'dog',
  description: '测试朋友',
  alt: '信号狗头像',
  image: {
    path: 'assets/friends/signal-dog.webp',
    width: 360,
    height: 560,
    byteLength: 1,
    mime: 'image/webp',
    sha256: '0'.repeat(64),
  },
} as unknown as FriendItem

const catalog: ContentCatalog = {
  items: [postcard],
  byId: { [postcard.id]: postcard },
  categoryCounts: { postcard: 1, 'million-shot': 0, 'site-first': 0 },
  siteFirstChronology: [],
  friends: [signalDog],
  friendById: { 'signal-dog': signalDog },
  videosByBvid: {},
  recordPlayerVideos: [],
}

const starterAssetName = getWardrobeCatalogItem('cream-apple-cape')?.name ?? '奶油苹果斗篷'

function wardrobeGame(): GameState {
  const game = createInitialGameState({ now: 1_000, seed: 'miracle-wardrobe-ui' })
  return {
    ...game,
    economy: { apples: 50 },
    collections: {
      [postcard.id]: { id: postcard.id, firstObtainedAt: 1_000, duplicateCount: 0 },
    },
    friends: {
      'signal-dog': {
        id: 'signal-dog',
        firstMetAt: 1_000,
        lastMetAt: 1_000,
        encounterCount: 1,
        totalGiftApples: 2,
      },
    },
  }
}

function savedLook(
  lookId: string,
  name: string,
  updatedAt: number,
  targetId: SavedWardrobeLook['targetId'] = 'bingo',
): SavedWardrobeLook {
  return {
    lookId,
    targetId,
    name,
    elements: [
      {
        placementId: `${lookId}-cape`,
        assetId: 'cream-apple-cape',
        x: 0.5,
        y: 0.76,
        scale: 0.48,
        rotation: 0,
        z: 1,
      },
    ],
    createdAt: updatedAt - 10,
    updatedAt,
  }
}

function renderPage(game = wardrobeGame(), onAction = vi.fn<(action: GameAction) => void>()) {
  const result = render(
    <MiracleWardrobePage game={game} catalog={catalog} onClose={vi.fn()} onAction={onAction} />,
  )
  return { ...result, onAction }
}

describe('MiracleWardrobePage', () => {
  it('全屏页只保留搭配、合拍与收藏，并使用奇迹标语', () => {
    renderPage()

    expect(screen.getByRole('dialog', { name: '奇迹饼狗' })).toBeInTheDocument()
    expect(screen.getByText('遇见饼狗是最美的奇迹')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '搭配室',
      '合拍',
      '衣服收藏',
    ])
    expect(screen.queryByRole('tab', { name: '今日衣橱' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '舞台测试' })).not.toBeInTheDocument()
    expect(screen.queryByText(/第 \d+ 个游戏日/u)).not.toBeInTheDocument()
  })

  it('搭配室用中心拖动和角落手柄变换元素，并可在画布外恢复默认变换', () => {
    const { container, onAction } = renderPage()

    expect(screen.getByRole('button', { name: '饼狗' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '信号狗' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '课代饼' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))
    expect(screen.queryAllByRole('slider')).toHaveLength(0)

    const canvas = screen.getByTestId('miracle-look-canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 400,
      left: 0,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    })
    const layer = screen.getByRole('button', { name: `${starterAssetName}，已选中` })
    Object.assign(layer, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(layer, { pointerId: 3, clientX: 200, clientY: 304 })
    fireEvent.pointerMove(layer, { pointerId: 3, clientX: 240, clientY: 260 })
    fireEvent.pointerUp(layer, { pointerId: 3 })

    const handle = container.querySelector<HTMLElement>('.miracle-transform-handle')
    expect(handle).not.toBeNull()
    Object.assign(handle as HTMLElement, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(handle as HTMLElement, {
      pointerId: 4,
      clientX: 336,
      clientY: 356,
    })
    fireEvent.pointerMove(handle as HTMLElement, {
      pointerId: 4,
      clientX: 360,
      clientY: 260,
    })
    fireEvent.pointerUp(handle as HTMLElement, { pointerId: 4 })

    fireEvent.change(screen.getByRole('textbox', { name: '造型名称' }), {
      target: { value: '苹果旅行装' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存为新造型' }))

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wardrobe/look-create',
        targetId: 'bingo',
        name: '苹果旅行装',
        elements: [
          expect.objectContaining({
            placementId: expect.stringMatching(/^layer-cream-apple-cape-/u),
            assetId: 'cream-apple-cape',
            x: expect.any(Number),
            scale: expect.any(Number),
            rotation: expect.any(Number),
          }),
        ],
        now: expect.any(Number),
      }),
    )
    const created = onAction.mock.calls.at(-1)?.[0]
    if (created?.type !== 'wardrobe/look-create') throw new Error('没有创建造型')
    expect(created.elements[0].x).not.toBe(0.5)
    expect(created.elements[0].scale).not.toBe(0.48)
    expect(created.elements[0].rotation).not.toBe(0)

    fireEvent.click(screen.getByRole('button', { name: '恢复默认变换' }))
    fireEvent.click(screen.getByRole('button', { name: '保存为新造型' }))
    const resetCreated = onAction.mock.calls.at(-1)?.[0]
    if (resetCreated?.type !== 'wardrobe/look-create') throw new Error('没有保存复位后的造型')
    expect(resetCreated.elements[0]).toMatchObject({
      placementId: created.elements[0].placementId,
      assetId: created.elements[0].assetId,
      x: 0.5,
      y: 0.76,
      scale: 0.48,
      rotation: 0,
      z: created.elements[0].z,
    })
  })

  it('同一角色可以载入、更新和删除多套已保存造型', () => {
    const game = wardrobeGame()
    const older = savedLook('look-bingo-1', '苹果散步装', 2_000)
    const newer = savedLook('look-bingo-2', '晚风舞台装', 3_000)
    game.wardrobe = {
      ...game.wardrobe,
      nextLookSequence: 3,
      looks: { [older.lookId]: older, [newer.lookId]: newer },
    }
    const { onAction } = renderPage(game)

    expect(screen.getByRole('button', { name: '晚风舞台装' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: '苹果散步装' }))
    expect(screen.getByRole('textbox', { name: '造型名称' })).toHaveValue('苹果散步装')

    fireEvent.change(screen.getByRole('textbox', { name: '造型名称' }), {
      target: { value: '苹果散步装 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: '更新当前造型' }))
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wardrobe/look-update',
        lookId: older.lookId,
        name: '苹果散步装 2',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '晚风舞台装' }))
    fireEvent.click(screen.getByRole('button', { name: '删除当前造型' }))
    expect(onAction).toHaveBeenCalledWith({
      type: 'wardrobe/look-delete',
      lookId: newer.lookId,
    })
    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    expect(screen.getByRole('combobox', { name: '饼狗的造型' })).toHaveValue(older.lookId)
  })

  it('合拍允许取消饼狗，按明信片真实比例预览并保存所选造型', () => {
    const game = wardrobeGame()
    const dogLook = savedLook('look-signal-dog-1', '信号灯造型', 2_000, 'signal-dog')
    game.wardrobe = {
      ...game.wardrobe,
      nextLookSequence: 2,
      looks: { [dogLook.lookId]: dogLook },
    }
    const { container, onAction } = renderPage(game)
    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))

    expect(screen.getByRole('heading', { name: '是谁出镜呢' })).toBeInTheDocument()
    const preview = screen.getByRole('img', { name: '奇迹饼狗合拍预览' })
    expect(preview.getAttribute('style')).toContain('aspect-ratio: 480 / 640')
    expect(screen.getByRole('button', { name: '测试明信片' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: '饼狗' }))
    expect(screen.getByRole('button', { name: '饼狗' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '信号狗' }))
    fireEvent.change(screen.getByRole('combobox', { name: '信号狗的造型' }), {
      target: { value: dogLook.lookId },
    })

    const photoCanvas = container.querySelector<HTMLElement>('.miracle-photo-canvas')
    expect(photoCanvas).not.toBeNull()
    vi.spyOn(photoCanvas as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 300,
      bottom: 400,
      left: 0,
      width: 300,
      height: 400,
      toJSON: () => ({}),
    })
    const participant = screen.getByRole('button', { name: '移动信号狗' })
    const handle = participant.querySelector<HTMLElement>('.miracle-transform-handle')
    expect(handle).not.toBeNull()
    Object.assign(handle as HTMLElement, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(handle as HTMLElement, {
      pointerId: 8,
      clientX: 147,
      clientY: 273,
    })
    fireEvent.pointerMove(handle as HTMLElement, {
      pointerId: 8,
      clientX: 220,
      clientY: 150,
    })
    fireEvent.pointerUp(handle as HTMLElement, { pointerId: 8 })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认变换' }))
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wardrobe/photo-create',
        postcardId: postcard.id,
        participants: [
          {
            targetId: 'signal-dog',
            lookId: dogLook.lookId,
            x: 0.34,
            y: 0.57,
            scale: 0.3,
            rotation: 0,
            z: 1,
          },
        ],
        now: expect.any(Number),
      }),
    )
    const createdPhoto = onAction.mock.calls.at(-1)?.[0]
    if (createdPhoto?.type !== 'wardrobe/photo-create') throw new Error('没有创建合拍')
    expect(createdPhoto.participants[0]).not.toHaveProperty('defaultTransform')
    expect(wardrobeStyles).toContain('overflow: clip')
    expect(wardrobeStyles).not.toContain("input[type='range']")
  })

  it('取消所有人物后明确提示至少一位，且不派发合拍动作', () => {
    const { onAction } = renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    fireEvent.click(screen.getByRole('button', { name: '饼狗' }))
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))

    expect(screen.getByRole('status')).toHaveTextContent('至少选择一位出镜的朋友')
    expect(onAction).not.toHaveBeenCalled()
  })

  it('合拍相册满额时给出真实提示且不继续派发保存动作', () => {
    const game = wardrobeGame()
    const photos: Record<string, WardrobePhoto> = {}
    for (let index = 0; index < MAX_WARDROBE_PHOTOS; index += 1) {
      const photoId = `photo-${index + 1}`
      photos[photoId] = {
        photoId,
        postcardId: postcard.id,
        createdAt: 2_000 + index,
        participants: [
          {
            targetId: 'bingo',
            sourceLookId: null,
            elements: [],
            x: 0.5,
            y: 0.57,
            scale: 0.34,
            rotation: 0,
            z: 1,
          },
        ],
      }
    }
    game.wardrobe = { ...game.wardrobe, photos }
    const { onAction } = renderPage(game)

    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      `合拍相册已经装满 ${MAX_WARDROBE_PHOTOS} 张，请先删除一张再保存`,
    )
    expect(onAction).not.toHaveBeenCalled()
  })
})
