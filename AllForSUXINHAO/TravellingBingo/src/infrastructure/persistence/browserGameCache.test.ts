import {
  BROWSER_GAME_CACHE_KEY,
  createBrowserGameCache,
  markPeriodicBackupRequested,
  readBrowserGameCache,
  updateBrowserGameCache,
  writeBrowserGameCache,
} from './browserGameCache'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next
    }),
  }
}

describe('浏览器主存档', () => {
  it('用单槽版本封套往返 UTF-8 载荷', () => {
    const storage = memoryStorage()
    const cache = createBrowserGameCache({
      saveId: 'save-1',
      gameVersion: '0.4.0-demo.1',
      now: 1_000,
      payload: { profile: { displayName: '小饼干' } },
    })

    writeBrowserGameCache(cache, storage)

    expect(storage.setItem).toHaveBeenCalledWith(BROWSER_GAME_CACHE_KEY, expect.any(String))
    expect(readBrowserGameCache(storage)).toEqual(cache)
  })

  it('更新进度时保留档位身份与周期备份时间', () => {
    const initial = createBrowserGameCache({
      saveId: 'save-1',
      gameVersion: '0.4.0-demo.1',
      now: 1_000,
      payload: { apples: 1 },
    })
    const backedUp = markPeriodicBackupRequested(initial, 2_000)
    const updated = updateBrowserGameCache(backedUp, { apples: 2 }, 3_000, '0.5.0')

    expect(updated).toMatchObject({
      saveId: 'save-1',
      gameVersion: '0.5.0',
      firstCachedAt: 1_000,
      updatedAt: 3_000,
      lastPeriodicBackupRequestedAt: 2_000,
      payload: { apples: 2 },
    })
  })

  it('拒绝损坏 JSON、未来版本与额外字段且不自行覆盖原值', () => {
    const invalidJson = memoryStorage('{')
    expect(() => readBrowserGameCache(invalidJson)).toThrow('不是有效的 JSON')
    expect(invalidJson.setItem).not.toHaveBeenCalled()

    const future = memoryStorage(
      JSON.stringify({
        format: 'travelling-bingo-browser-save',
        cacheVersion: 2,
        saveId: 'future',
        gameVersion: '9.0.0',
        firstCachedAt: 1,
        updatedAt: 1,
        lastPeriodicBackupRequestedAt: null,
        payload: {},
      }),
    )
    expect(() => readBrowserGameCache(future)).toThrow('结构或版本无效')
    expect(future.setItem).not.toHaveBeenCalled()
  })

  it('明确上抛浏览器配额写入失败', () => {
    const storage = memoryStorage()
    storage.setItem.mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const cache = createBrowserGameCache({
      saveId: 'save-1',
      gameVersion: '0.4.0-demo.1',
      now: 1_000,
      payload: {},
    })

    expect(() => writeBrowserGameCache(cache, storage)).toThrow('没有写入成功')
  })
})
