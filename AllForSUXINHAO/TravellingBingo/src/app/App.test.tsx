import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { loadContentCatalog, type CollectibleItem, type ContentCatalog } from '@/content'
import { createInitialGameState, type GameState } from '@/domain'
import {
  createBingoSave,
  downloadBingoSave,
  importBingoSave,
  type BingoSaveImportResult,
} from '@/infrastructure/persistence'

import { App } from './App'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [false, vi.fn()],
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

vi.mock('@/content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content')>()
  return { ...actual, loadContentCatalog: vi.fn() }
})

vi.mock('@/infrastructure/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/persistence')>()
  return {
    ...actual,
    createBingoSave: vi.fn(),
    downloadBingoSave: vi.fn(),
    importBingoSave: vi.fn(),
  }
})

const catalogItems = [
  {
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
  },
  {
    id: 'million-shot-test',
    category: 'million-shot',
    title: '测试百万直拍',
    alt: '测试百万直拍海报',
    images: [
      {
        width: 480,
        height: 640,
        path: 'assets/collectibles/million-shots/test.webp',
        byteLength: 1,
        mime: 'image/webp',
      },
    ],
    tags: ['测试'],
    source: { url: 'https://example.com/million-shot' },
  },
  {
    id: 'site-first-test',
    category: 'site-first',
    title: '测试全站第一',
    alt: '测试全站第一海报',
    images: [
      {
        width: 480,
        height: 640,
        path: 'assets/collectibles/site-firsts/test.webp',
        byteLength: 1,
        mime: 'image/webp',
      },
    ],
    tags: ['测试'],
    source: { url: 'https://example.com/site-first' },
  },
] as unknown as CollectibleItem[]

const catalog: ContentCatalog = {
  items: catalogItems,
  byId: Object.fromEntries(catalogItems.map((item) => [item.id, item])),
  categoryCounts: { postcard: 1, 'million-shot': 1, 'site-first': 1 },
}

function importedGame(): GameState {
  const initial = createInitialGameState({ now: 1_000, seed: 'imported-test', debug: true })
  return {
    ...initial,
    economy: { apples: 7 },
    collections: {
      'million-shot-test': {
        id: 'million-shot-test',
        firstObtainedAt: 2_000,
        duplicateCount: 0,
      },
    },
    statistics: {
      ...initial.statistics,
      started: { ...initial.statistics.started, stream: 1 },
      claimed: { ...initial.statistics.claimed, stream: 1 },
      applesEarned: 2,
    },
  }
}

function importResult(payload: GameState): BingoSaveImportResult<GameState> {
  return {
    payload,
    summary: {
      format: 'travelling-bingo-save',
      schemaVersion: 1,
      gameVersion: '0.1.0-demo.1',
      exportedAt: 3_000,
      exportedAtIso: new Date(3_000).toISOString(),
      byteLength: 800,
      digest: 'a'.repeat(43),
    },
  } as BingoSaveImportResult<GameState>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('旅行饼狗应用入口', () => {
  beforeEach(() => {
    vi.mocked(loadContentCatalog).mockReset()
    vi.mocked(createBingoSave).mockReset()
    vi.mocked(downloadBingoSave).mockReset()
    vi.mocked(importBingoSave).mockReset()
    vi.mocked(loadContentCatalog).mockResolvedValue(catalog)
  })

  it('加载目录后展示标题页，并能通过五击暗门创建 DEBUG 新游戏', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '旅行饼狗' })).toBeInTheDocument()
    const start = await screen.findByRole('button', { name: '开始新旅程' })
    expect(start).toBeEnabled()

    const titleTrigger = screen.getByRole('button', { name: /连续激活五次可打开隐藏门牌/ })
    for (let activation = 0; activation < 5; activation += 1) {
      fireEvent.click(titleTrigger)
    }

    const dialog = screen.getByRole('dialog', { name: '输入调试暗号' })
    fireEvent.change(screen.getByLabelText('暗号'), { target: { value: 'TravellingBingo' } })
    fireEvent.click(screen.getByRole('button', { name: '打开门牌' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())

    fireEvent.click(start)

    expect(await screen.findByRole('button', { name: '苹果 18 个，打开冰箱' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'DEBUG' })).toBeVisible()
  })

  it('先预览存档摘要，再采用导入进度而不误开新游戏', async () => {
    const payload = importedGame()
    const result = importResult(payload)
    vi.mocked(importBingoSave).mockResolvedValue(result)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })

    const file = new File(['valid-save'], 'my-debug-trip.bingo', {
      type: 'application/octet-stream',
    })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [file] },
    })

    const summary = await screen.findByRole('region', { name: '存档摘要' })
    expect(summary).toHaveTextContent('my-debug-trip.bingo')
    expect(summary).toHaveTextContent('7 个')
    expect(summary).toHaveTextContent('1 件')
    expect(summary).toHaveTextContent('在铲铲饼屋休息')
    expect(importBingoSave).toHaveBeenCalledWith(file, expect.anything())

    fireEvent.click(screen.getByRole('button', { name: '带它回家' }))

    expect(await screen.findByRole('button', { name: '苹果 7 个，打开冰箱' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'DEBUG' })).toBeVisible()
    expect(screen.getByText('1/3')).toBeVisible()
  })

  it('拒绝收藏 ID 不属于当前目录的存档，不展示可确认预览', async () => {
    const payload = importedGame()
    payload.collections['removed-collection'] = {
      id: 'removed-collection',
      firstObtainedAt: 2_000,
      duplicateCount: 0,
    }
    vi.mocked(importBingoSave).mockResolvedValue(importResult(payload))

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    const file = new File(['invalid-save'], 'removed-collection.bingo')
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [file] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '收藏 ID“removed-collection”不在当前收藏目录中',
    )
    expect(screen.queryByRole('region', { name: '存档摘要' })).not.toBeInTheDocument()
  })

  it('连续选择 A/B 时只允许较新的导入结果覆盖预览', async () => {
    const first = deferred<BingoSaveImportResult<GameState>>()
    const second = deferred<BingoSaveImportResult<GameState>>()
    vi.mocked(importBingoSave)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    render(<App />)
    await screen.findByRole('button', { name: '开始新旅程' })
    const input = screen.getByLabelText('读取 .bingo 存档')
    fireEvent.change(input, {
      target: { files: [new File(['a'], 'A.bingo')] },
    })
    fireEvent.change(input, {
      target: { files: [new File(['b'], 'B.bingo')] },
    })

    const newerGame = importedGame()
    newerGame.economy.apples = 12
    await act(async () => {
      second.resolve(importResult(newerGame))
      await second.promise
    })
    expect(await screen.findByRole('region', { name: '存档摘要' })).toHaveTextContent('B.bingo')
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('12 个')

    const olderGame = importedGame()
    olderGame.economy.apples = 3
    await act(async () => {
      first.resolve(importResult(olderGame))
      await first.promise
    })
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('B.bingo')
    expect(screen.getByRole('region', { name: '存档摘要' })).toHaveTextContent('12 个')
  })

  it('开始新游戏会使尚未完成的导入失效', async () => {
    const pending = deferred<BingoSaveImportResult<GameState>>()
    vi.mocked(importBingoSave).mockReturnValueOnce(pending.promise)
    vi.mocked(createBingoSave).mockResolvedValue({
      fileName: 'new-game.bingo',
      text: '{}',
    } as Awaited<ReturnType<typeof createBingoSave>>)

    render(<App />)
    const start = await screen.findByRole('button', { name: '开始新旅程' })
    fireEvent.change(screen.getByLabelText('读取 .bingo 存档'), {
      target: { files: [new File(['pending'], 'pending.bingo')] },
    })
    fireEvent.click(start)
    expect(await screen.findByRole('button', { name: '苹果 18 个，打开冰箱' })).toBeVisible()

    const oldImportedGame = importedGame()
    await act(async () => {
      pending.resolve(importResult(oldImportedGame))
      await pending.promise
    })
    fireEvent.click(screen.getByRole('button', { name: /离开铲铲饼屋/ }))
    fireEvent.click(screen.getByRole('button', { name: '下载存档并离开' }))

    expect(await screen.findByRole('button', { name: '开始新旅程' })).toBeEnabled()
    expect(screen.queryByRole('region', { name: '存档摘要' })).not.toBeInTheDocument()
  })
})
