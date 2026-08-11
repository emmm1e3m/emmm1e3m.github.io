import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import type { CollectibleItem, ContentCatalog, FriendItem } from '@/content'
import { createInitialGameState, type GameAction, type GameState } from '@/domain'
import { getWardrobeCatalogItem, MAX_WARDROBE_PHOTOS } from '@/domain/game/wardrobe'
import type { SavedWardrobeLook, WardrobePhoto } from '@/domain/game/types'

const { downloadWardrobeLookMock } = vi.hoisted(() => ({
  downloadWardrobeLookMock: vi.fn<() => Promise<void>>(),
}))

vi.mock('./renderWardrobeLook', () => ({
  downloadWardrobeLook: downloadWardrobeLookMock,
}))

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
        scaleX: 0.48,
        scaleY: 0.48,
        rotation: 0,
        z: 1,
      },
    ],
    createdAt: updatedAt - 10,
    updatedAt,
  }
}

function renderPage(
  game = wardrobeGame(),
  onAction = vi.fn<(action: GameAction) => void>(),
  contentCatalog = catalog,
) {
  const result = render(
    <MiracleWardrobePage
      game={game}
      catalog={contentCatalog}
      onClose={vi.fn()}
      onAction={onAction}
    />,
  )
  return { ...result, onAction }
}

describe('MiracleWardrobePage', () => {
  beforeEach(() => {
    downloadWardrobeLookMock.mockReset()
    downloadWardrobeLookMock.mockResolvedValue(undefined)
  })

  it('全屏页只保留搭配、合拍与收藏，并使用奇迹标语', () => {
    const { container } = renderPage()

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
    expect(
      [...container.querySelectorAll('#miracle-panel-dressing > *')].map(
        (element) => element.className,
      ),
    ).toEqual(['miracle-editor-library', 'miracle-editor-stage', 'miracle-editor-tools'])
    expect(wardrobeStyles).toContain(
      'grid-template-columns: minmax(220px, 0.72fr) minmax(360px, 1.24fr) minmax(230px, 0.62fr)',
    )
  })

  it('搭配室用中心拖动和角落手柄变换元素，并可在画布外恢复默认变换', () => {
    const { onAction } = renderPage()

    expect(screen.getByRole('button', { name: '饼狗' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '信号狗' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '课代饼' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    const actions = within(screen.getByRole('region', { name: '选中元素调整' })).getAllByRole(
      'button',
    )
    expect(actions.map((button) => button.textContent)).toEqual(['🔼', '🔽', '🔄️', '❌'])
    expect(actions.map((button) => button.getAttribute('aria-label'))).toEqual([
      '向前一层',
      '向后一层',
      '恢复默认比例/变换',
      '移除元素',
    ])

    const canvas = screen.getByTestId('miracle-look-canvas')
    const character = screen.getByRole('img', { name: '饼狗海星体模板' })
    expect(canvas).toHaveClass('miracle-look-composition')
    expect(canvas).toHaveStyle({ '--miracle-look-composition-scale': '0.38' })
    expect(character.parentElement).toBe(canvas)
    expect(
      screen.getByRole('button', { name: `${starterAssetName}，已选中` }).parentElement
        ?.parentElement,
    ).toBe(canvas)
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

    const handle = screen.getByRole('button', {
      name: `${starterAssetName}：等比缩放并旋转`,
    })
    Object.assign(handle, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(handle, {
      pointerId: 4,
      clientX: 336,
      clientY: 356,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 4,
      clientX: 360,
      clientY: 260,
    })
    fireEvent.pointerUp(handle, { pointerId: 4 })

    const stretchHandle = screen.getByRole('button', {
      name: `${starterAssetName}：分别调整宽度和高度`,
    })
    Object.assign(stretchHandle, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(stretchHandle, {
      pointerId: 5,
      clientX: 180,
      clientY: 200,
    })
    fireEvent.pointerMove(stretchHandle, {
      pointerId: 5,
      clientX: 105,
      clientY: 220,
    })
    fireEvent.pointerUp(stretchHandle, { pointerId: 5 })

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
            scaleX: expect.any(Number),
            scaleY: expect.any(Number),
            rotation: expect.any(Number),
          }),
        ],
        now: expect.any(Number),
      }),
    )
    const created = onAction.mock.calls.at(-1)?.[0]
    if (created?.type !== 'wardrobe/look-create') throw new Error('没有创建造型')
    expect(created.elements[0].x).not.toBe(0.5)
    expect(created.elements[0].scaleX).not.toBe(0.48)
    expect(created.elements[0].scaleY).not.toBe(created.elements[0].scaleX)
    expect(created.elements[0].rotation).not.toBe(0)

    fireEvent.click(screen.getByRole('button', { name: '恢复默认比例/变换' }))
    fireEvent.click(screen.getByRole('button', { name: '保存为新造型' }))
    const resetCreated = onAction.mock.calls.at(-1)?.[0]
    if (resetCreated?.type !== 'wardrobe/look-create') throw new Error('没有保存复位后的造型')
    expect(resetCreated.elements[0]).toMatchObject({
      placementId: created.elements[0].placementId,
      assetId: created.elements[0].assetId,
      x: 0.5,
      y: 0.76,
      scaleX: 0.48,
      scaleY: 0.48,
      rotation: 0,
      z: created.elements[0].z,
    })
  })

  it('搭配和合拍素材各自按分类筛选，图层列表位于素材选择器之前', () => {
    const game = wardrobeGame()
    game.wardrobe = {
      ...game.wardrobe,
      ownedAssetIds: [...game.wardrobe.ownedAssetIds, 'round-glasses'],
    }
    const { container } = renderPage(game)
    const glassesName = getWardrobeCatalogItem('round-glasses')?.name ?? '红色圆框眼镜'

    expect(screen.getByRole('button', { name: starterAssetName })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: glassesName })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '眼镜【1】' }))
    expect(screen.getByRole('button', { name: glassesName })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: starterAssetName })).not.toBeInTheDocument()

    const dressingTools = container.querySelector('.miracle-editor-tools')
    expect(dressingTools?.firstElementChild).toHaveClass('miracle-layer-list')

    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    expect(
      [...container.querySelectorAll('#miracle-panel-photo > *')].map(
        (element) => element.className,
      ),
    ).toEqual(['miracle-photo-setup', 'miracle-photo-stage', 'miracle-photo-tools'])
    expect(screen.getByRole('button', { name: starterAssetName })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '眼镜【1】' }))
    expect(screen.getByRole('button', { name: glassesName })).toBeInTheDocument()
    expect(container.querySelector('.miracle-photo-tools')?.firstElementChild).toHaveClass(
      'miracle-layer-list',
    )
  })

  it('合拍左栏只显示当前明信片摘要，打开共享选择墙后单击即更新并关闭', async () => {
    const postcards = Array.from({ length: 100 }, (_, index) => {
      const id = `postcard-test-${String(index + 1).padStart(3, '0')}`
      return {
        ...postcard,
        id,
        title: `测试风景 ${index + 1}`,
        images: [
          {
            ...postcard.images[0],
            path: `assets/collectibles/postcards/${id}.webp`,
          },
        ],
      } as unknown as CollectibleItem
    })
    const largeCatalog: ContentCatalog = {
      ...catalog,
      items: postcards,
      byId: Object.fromEntries(postcards.map((item) => [item.id, item])),
      categoryCounts: { postcard: postcards.length, 'million-shot': 0, 'site-first': 0 },
    }
    const game = wardrobeGame()
    game.collections = Object.fromEntries(
      postcards.map((item) => [
        item.id,
        { id: item.id, firstObtainedAt: 1_000, duplicateCount: 0 },
      ]),
    )
    const { container } = renderPage(game, vi.fn(), largeCatalog)
    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))

    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(container.querySelectorAll('.reality-postcard-tile')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: '选择合拍明信片' }))
    expect(screen.getByRole('dialog', { name: '选择合拍的风景' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(100)
    expect(screen.queryByRole('radio', { name: /默认纸张/u })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /测试风景 100/u }))
    expect(screen.queryByRole('dialog', { name: '选择合拍的风景' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-background-id="postcard-test-100"]')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '选择合拍明信片' })).toHaveFocus(),
    )
  })

  it('键盘可以移动并用双手柄调整搭配元素、合拍人物和独立元素', () => {
    const { onAction } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))

    const lookCenter = screen.getByRole('button', { name: `${starterAssetName}，已选中` })
    const lookStretch = screen.getByRole('button', {
      name: `${starterAssetName}：分别调整宽度和高度`,
    })
    const lookUniform = screen.getByRole('button', {
      name: `${starterAssetName}：等比缩放并旋转`,
    })
    expect(lookCenter).toHaveAttribute(
      'aria-keyshortcuts',
      'ArrowLeft ArrowRight ArrowUp ArrowDown',
    )
    expect(lookUniform).toHaveAttribute('aria-description', '方向键上下缩放，左右旋转')
    fireEvent.keyDown(lookCenter, { key: 'ArrowRight' })
    fireEvent.keyDown(lookStretch, { key: 'ArrowRight' })
    fireEvent.keyDown(lookStretch, { key: 'ArrowDown' })
    fireEvent.keyDown(lookUniform, { key: 'ArrowUp' })
    fireEvent.keyDown(lookUniform, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: '保存为新造型' }))

    const lookAction = onAction.mock.calls.at(-1)?.[0]
    if (lookAction?.type !== 'wardrobe/look-create') throw new Error('没有保存键盘调整后的造型')
    expect(lookAction.elements[0]).toMatchObject({
      x: 0.52,
      y: 0.76,
      rotation: 5,
    })
    expect(lookAction.elements[0].scaleX).toBeCloseTo(0.572)
    expect(lookAction.elements[0].scaleY).toBeCloseTo(0.484)
    expect(lookAction.elements[0].scaleX / lookAction.elements[0].scaleY).toBeCloseTo(0.52 / 0.44)

    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    const participantCenter = screen.getByRole('button', { name: '移动饼狗' })
    const participantStretch = screen.getByRole('button', {
      name: '饼狗：分别调整宽度和高度',
    })
    const participantUniform = screen.getByRole('button', {
      name: '饼狗：等比缩放并旋转',
    })
    fireEvent.keyDown(participantCenter, { key: 'ArrowLeft' })
    fireEvent.keyDown(participantStretch, { key: 'ArrowRight' })
    fireEvent.keyDown(participantStretch, { key: 'ArrowUp' })
    fireEvent.keyDown(participantUniform, { key: 'ArrowDown' })
    fireEvent.keyDown(participantUniform, { key: 'ArrowLeft' })

    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))
    const decorationCenter = screen.getByRole('button', {
      name: `移动独立元素${starterAssetName}`,
    })
    const decorationStretch = screen.getByRole('button', {
      name: `${starterAssetName}：分别调整宽度和高度`,
    })
    const decorationUniform = screen.getByRole('button', {
      name: `${starterAssetName}：等比缩放并旋转`,
    })
    fireEvent.keyDown(decorationCenter, { key: 'ArrowUp' })
    fireEvent.keyDown(decorationStretch, { key: 'ArrowRight' })
    fireEvent.keyDown(decorationStretch, { key: 'ArrowDown' })
    fireEvent.keyDown(decorationUniform, { key: 'ArrowUp' })
    fireEvent.keyDown(decorationUniform, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))

    const photoAction = onAction.mock.calls.at(-1)?.[0]
    if (photoAction?.type !== 'wardrobe/photo-create') {
      throw new Error('没有保存键盘调整后的合拍')
    }
    expect(photoAction.participants[0]).toMatchObject({
      x: 0.48,
      rotation: -5,
    })
    expect(photoAction.participants[0].scaleX).toBeCloseTo(0.38 / 1.1)
    expect(photoAction.participants[0].scaleY).toBeCloseTo(0.38 / 1.1)
    expect(photoAction.decorations[0]).toMatchObject({
      y: 0.48,
      rotation: 5,
    })
    expect(photoAction.decorations[0].scaleX).toBeCloseTo(0.34 * 1.1)
    expect(photoAction.decorations[0].scaleY).toBeCloseTo(0.26 * 1.1)
    expect(photoAction.decorations[0].scaleX / photoAction.decorations[0].scaleY).toBeCloseTo(
      0.34 / 0.26,
    )
  })

  it('非等比初值用右下手柄触及缩放边界时仍保持两轴比例', () => {
    const { onAction } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))
    const lookCanvas = screen.getByTestId('miracle-look-canvas')
    vi.spyOn(lookCanvas, 'getBoundingClientRect').mockReturnValue({
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
    const lookStretch = screen.getByRole('button', {
      name: `${starterAssetName}：分别调整宽度和高度`,
    })
    fireEvent.keyDown(lookStretch, { key: 'ArrowRight' })
    fireEvent.keyDown(lookStretch, { key: 'ArrowRight' })
    const lookUniform = screen.getByRole('button', {
      name: `${starterAssetName}：等比缩放并旋转`,
    })
    Object.assign(lookUniform, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(lookUniform, { pointerId: 21, clientX: 300, clientY: 304 })
    fireEvent.pointerMove(lookUniform, { pointerId: 21, clientX: 10_000, clientY: 304 })
    fireEvent.pointerUp(lookUniform, { pointerId: 21 })
    fireEvent.click(screen.getByRole('button', { name: '保存为新造型' }))
    const maximumLook = onAction.mock.calls.at(-1)?.[0]
    if (maximumLook?.type !== 'wardrobe/look-create') throw new Error('没有保存最大缩放造型')
    expect(maximumLook.elements[0].scaleX).toBeCloseTo(5)
    expect(maximumLook.elements[0].scaleX / maximumLook.elements[0].scaleY).toBeCloseTo(0.56 / 0.48)

    fireEvent.pointerDown(lookUniform, { pointerId: 22, clientX: 300, clientY: 304 })
    fireEvent.pointerMove(lookUniform, { pointerId: 22, clientX: 200, clientY: 304 })
    fireEvent.pointerUp(lookUniform, { pointerId: 22 })
    fireEvent.click(screen.getByRole('button', { name: '保存为新造型' }))
    const minimumLook = onAction.mock.calls.at(-1)?.[0]
    if (minimumLook?.type !== 'wardrobe/look-create') throw new Error('没有保存最小缩放造型')
    expect(minimumLook.elements[0].scaleY).toBeCloseTo(0.05)
    expect(minimumLook.elements[0].scaleX / minimumLook.elements[0].scaleY).toBeCloseTo(0.56 / 0.48)

    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    const photoCanvas = document.querySelector<HTMLElement>('.miracle-photo-canvas')
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
    const participantStretch = screen.getByRole('button', {
      name: '饼狗：分别调整宽度和高度',
    })
    fireEvent.keyDown(participantStretch, { key: 'ArrowRight' })
    fireEvent.keyDown(participantStretch, { key: 'ArrowRight' })
    const participantUniform = screen.getByRole('button', {
      name: '饼狗：等比缩放并旋转',
    })
    Object.assign(participantUniform, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(participantUniform, {
      pointerId: 23,
      clientX: 250,
      clientY: 228,
    })
    fireEvent.pointerMove(participantUniform, {
      pointerId: 23,
      clientX: 10_000,
      clientY: 228,
    })
    fireEvent.pointerUp(participantUniform, { pointerId: 23 })
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))
    const maximumPhoto = onAction.mock.calls.at(-1)?.[0]
    if (maximumPhoto?.type !== 'wardrobe/photo-create') throw new Error('没有保存最大缩放合拍')
    expect(maximumPhoto.participants[0].scaleX).toBeCloseTo(5)
    expect(maximumPhoto.participants[0].scaleX / maximumPhoto.participants[0].scaleY).toBeCloseTo(
      0.42 / 0.34,
    )
  })

  it('未保存的当前搭配也能下载透明 PNG，并在失败时给出反馈', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))
    fireEvent.click(screen.getByRole('button', { name: '下载透明 PNG' }))

    expect(downloadWardrobeLookMock).toHaveBeenCalledWith(
      'bingo',
      expect.arrayContaining([
        expect.objectContaining({ assetId: 'cream-apple-cape', scaleX: 0.48, scaleY: 0.48 }),
      ]),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('饼狗的透明 PNG 已经生成'),
    )

    downloadWardrobeLookMock.mockRejectedValueOnce(new Error('canvas failed'))
    fireEvent.click(screen.getByRole('button', { name: '下载透明 PNG' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('透明 PNG 生成失败，请稍后再试'),
    )
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
    expect(
      container.querySelector('[data-background-id="postcard-2025-01-0001"]'),
    ).toBeInTheDocument()
    expect(screen.queryByText('饼狗不是必须出镜')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '饼狗' }))
    expect(screen.getByRole('button', { name: '饼狗' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '信号狗' }))
    fireEvent.change(screen.getByRole('combobox', { name: '信号狗的造型' }), {
      target: { value: dogLook.lookId },
    })

    const photoCanvas = container.querySelector<HTMLElement>('.miracle-photo-canvas')
    expect(photoCanvas).not.toBeNull()
    expect(photoCanvas?.parentElement).toHaveClass('miracle-photo-canvas-slot')
    expect(photoCanvas).toHaveStyle({
      '--miracle-photo-aspect': '0.75',
      aspectRatio: '0.75',
    })
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
    screen.getByRole('button', { name: '移动信号狗' })
    const handle = screen.getByRole('button', { name: '信号狗：等比缩放并旋转' })
    Object.assign(handle, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(handle, {
      pointerId: 8,
      clientX: 147,
      clientY: 273,
    })
    fireEvent.pointerMove(handle, {
      pointerId: 8,
      clientX: 220,
      clientY: 150,
    })
    fireEvent.pointerUp(handle, { pointerId: 8 })
    fireEvent.click(screen.getByRole('button', { name: '恢复默认比例/变换' }))
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
            scaleX: 0.3,
            scaleY: 0.3,
            rotation: 0,
            z: 1,
          },
        ],
        decorations: [],
        now: expect.any(Number),
      }),
    )
    const createdPhoto = onAction.mock.calls.at(-1)?.[0]
    if (createdPhoto?.type !== 'wardrobe/photo-create') throw new Error('没有创建合拍')
    expect(createdPhoto.participants[0]).not.toHaveProperty('defaultTransform')
    expect(wardrobeStyles).toContain('overflow: clip')
    expect(wardrobeStyles).not.toContain("input[type='range']")
  })

  it('合拍独立元素支持双手柄、全局图层、复位并进入保存动作', () => {
    const { onAction } = renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    fireEvent.click(screen.getByRole('button', { name: starterAssetName }))

    const canvas = document.querySelector<HTMLElement>('.miracle-photo-canvas')
    expect(canvas).not.toBeNull()
    vi.spyOn(canvas as HTMLElement, 'getBoundingClientRect').mockReturnValue({
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
    expect(screen.getByRole('button', { name: `移动独立元素${starterAssetName}` })).toBeVisible()

    const uniformHandle = screen.getByRole('button', {
      name: `${starterAssetName}：等比缩放并旋转`,
    })
    Object.assign(uniformHandle, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(uniformHandle, {
      pointerId: 10,
      clientX: 195,
      clientY: 245,
    })
    fireEvent.pointerMove(uniformHandle, {
      pointerId: 10,
      clientX: 225,
      clientY: 230,
    })
    fireEvent.pointerUp(uniformHandle, { pointerId: 10 })

    const stretchHandle = screen.getByRole('button', {
      name: `${starterAssetName}：分别调整宽度和高度`,
    })
    Object.assign(stretchHandle, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    })
    fireEvent.pointerDown(stretchHandle, {
      pointerId: 11,
      clientX: 105,
      clientY: 155,
    })
    fireEvent.pointerMove(stretchHandle, {
      pointerId: 11,
      clientX: 65,
      clientY: 175,
    })
    fireEvent.pointerUp(stretchHandle, { pointerId: 11 })
    fireEvent.click(screen.getByRole('button', { name: '向后一层' }))
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))

    const transformed = onAction.mock.calls.at(-1)?.[0]
    if (transformed?.type !== 'wardrobe/photo-create') throw new Error('没有创建带独立元素的合拍')
    expect(transformed.participants[0].z).toBe(2)
    expect(transformed.decorations).toHaveLength(1)
    expect(transformed.decorations[0]).toMatchObject({
      placementId: expect.stringMatching(/^photo-cream-apple-cape-/u),
      assetId: 'cream-apple-cape',
      z: 1,
    })
    expect(transformed.decorations[0].scaleX).not.toBe(transformed.decorations[0].scaleY)
    expect(transformed.decorations[0].rotation).not.toBe(0)
    expect(transformed.decorations[0]).not.toHaveProperty('defaultTransform')

    fireEvent.click(screen.getByRole('button', { name: '恢复默认比例/变换' }))
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))
    const reset = onAction.mock.calls.at(-1)?.[0]
    if (reset?.type !== 'wardrobe/photo-create') throw new Error('没有保存复位后的合拍')
    expect(reset.decorations[0]).toEqual({
      placementId: transformed.decorations[0].placementId,
      assetId: 'cream-apple-cape',
      x: 0.5,
      y: 0.5,
      scaleX: 0.3,
      scaleY: 0.3,
      rotation: 0,
      z: 1,
    })
  })

  it('收藏缩略图在紧凑低框中完整显示，桌面整页锁定且移动端改由活动面板滚动', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '衣服收藏' }))

    const image = screen.getByRole('img', { name: starterAssetName })
    expect(image.parentElement).toHaveClass('miracle-collection-thumb')
    expect(image.closest('section')).toHaveClass('miracle-collection-group--outfit')
    expect(wardrobeStyles).toContain('grid-template-rows: auto auto auto minmax(0, 1fr)')
    expect(wardrobeStyles).toContain('height: 100dvh')
    expect(wardrobeStyles).toContain('overflow: hidden')
    expect(wardrobeStyles).toContain('overflow-y: auto')
    expect(wardrobeStyles).toContain('grid-auto-rows: max-content')
    const thumbnailRules = wardrobeStyles.slice(
      wardrobeStyles.indexOf('.miracle-collection-thumb {'),
      wardrobeStyles.indexOf('.miracle-collection-group strong {'),
    )
    expect(thumbnailRules).toContain('height: clamp(78px, 5vw, 92px)')
    expect(thumbnailRules).toContain('width: calc(100% - 12px)')
    expect(thumbnailRules).toContain('object-fit: contain')
    expect(wardrobeStyles).toContain('container-type: size')
    expect(wardrobeStyles).toContain(
      'width: min(100cqw, calc(100cqh * var(--miracle-photo-aspect, 1.3333)))',
    )
    expect(wardrobeStyles).toMatch(
      /@media \(max-width: 960px\)[\s\S]*?\.miracle-photo-canvas-slot\s*\{[\s\S]*?container-type: normal;/u,
    )
    expect(wardrobeStyles).toMatch(
      /@media \(max-width: 960px\)[\s\S]*?\.miracle-asset-buttons[\s\S]*?overflow: visible;/u,
    )
    const thumbnailScales = [...thumbnailRules.matchAll(/transform: scale\(([\d.]+)\)/gu)].map(
      (match) => Number(match[1]),
    )
    expect(thumbnailScales).toHaveLength(3)
    expect(Math.max(...thumbnailScales)).toBeLessThanOrEqual(1.08)
    expect(thumbnailRules).not.toContain('scale(1.32)')
    expect(thumbnailRules).not.toContain('scale(1.45)')
    expect(thumbnailRules).not.toContain('scale(1.72)')
    expect(wardrobeStyles).toMatch(/\.miracle-look-library button\s*\{[^}]*min-height:\s*44px;/su)
    expect(wardrobeStyles).toMatch(/\.miracle-layer-list button\s*\{[^}]*min-height:\s*44px;/su)
  })

  it('取消所有人物后明确提示至少一位，且不派发合拍动作', () => {
    const { onAction } = renderPage()
    fireEvent.click(screen.getByRole('tab', { name: '合拍' }))
    fireEvent.click(screen.getByRole('button', { name: '饼狗' }))
    fireEvent.click(screen.getByRole('button', { name: '保存这张合拍' }))

    expect(screen.getByRole('status')).toHaveTextContent('选择至少一只')
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
            scaleX: 0.34,
            scaleY: 0.34,
            rotation: 0,
            z: 1,
          },
        ],
        decorations: [],
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
