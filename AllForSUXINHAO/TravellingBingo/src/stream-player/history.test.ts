import { readStreamPlayerHistory, storeStreamSession, STREAM_PLAYER_HISTORY_KEY } from './history'

function createStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next
    }),
  }
}

describe('stream player history', () => {
  it('主游戏与独立页共用固定 key', () => {
    expect(STREAM_PLAYER_HISTORY_KEY).toBe('travelling-bingo:stream-player-history:v1')
  })

  it('按 sessionId 覆盖同一会话并只保留最近 10 条', () => {
    const existing = Array.from({ length: 10 }, (_, index) => ({
      sessionId: `session-${index}`,
      startedAt: index * 10,
      endedAt: index * 10 + 5,
      roundsCompleted: index,
      outcome: 'completed',
    }))
    const storage = createStorage(JSON.stringify(existing))

    storeStreamSession(
      {
        sessionId: 'session-5',
        startedAt: 500,
        endedAt: 600,
        roundsCompleted: 12,
        outcome: 'stopped',
      },
      storage,
    )

    const history = readStreamPlayerHistory(storage)
    expect(history).toHaveLength(10)
    expect(history[0]).toMatchObject({ sessionId: 'session-5', roundsCompleted: 12 })
    expect(history.filter((item) => item.sessionId === 'session-5')).toHaveLength(1)
    expect(storage.setItem).toHaveBeenCalledWith(STREAM_PLAYER_HISTORY_KEY, expect.any(String))
  })

  it('每轮 checkpoint 覆盖同一会话，最终状态仍保持整次任务一条记录', () => {
    const storage = createStorage()

    for (const roundsCompleted of [1, 2, 3]) {
      storeStreamSession(
        {
          sessionId: 'running-session',
          startedAt: 100,
          endedAt: 100 + roundsCompleted,
          roundsCompleted,
          outcome: 'running',
        },
        storage,
      )
      expect(readStreamPlayerHistory(storage)).toEqual([
        expect.objectContaining({
          sessionId: 'running-session',
          roundsCompleted,
          outcome: 'running',
        }),
      ])
    }

    storeStreamSession(
      {
        sessionId: 'running-session',
        startedAt: 100,
        endedAt: 200,
        roundsCompleted: 3,
        outcome: 'stopped',
      },
      storage,
    )
    expect(readStreamPlayerHistory(storage)).toEqual([
      expect.objectContaining({
        sessionId: 'running-session',
        roundsCompleted: 3,
        outcome: 'stopped',
      }),
    ])
  })

  it('记录上限按最近 10 个 session 计算', () => {
    const storage = createStorage()
    for (let index = 0; index < 11; index += 1) {
      storeStreamSession(
        {
          sessionId: `session-${index}`,
          startedAt: index,
          endedAt: index + 1,
          roundsCompleted: index,
          outcome: 'completed',
        },
        storage,
      )
    }

    const history = readStreamPlayerHistory(storage)
    expect(history).toHaveLength(10)
    expect(history.map((item) => item.sessionId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `session-${10 - index}`),
    )
  })

  it('忽略损坏或时间倒置的存储记录', () => {
    const storage = createStorage(
      JSON.stringify([
        { sessionId: 'broken' },
        {
          sessionId: 'reversed',
          startedAt: 20,
          endedAt: 10,
          roundsCompleted: 1,
          outcome: 'completed',
        },
      ]),
    )
    expect(readStreamPlayerHistory(storage)).toEqual([])
  })

  it('存储读取被浏览器拒绝时降级为空历史而不抛错', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('Blocked', 'SecurityError')
      }),
    }

    expect(() => readStreamPlayerHistory(storage)).not.toThrow()
    expect(readStreamPlayerHistory(storage)).toEqual([])
  })

  it('checkpoint 写入超出配额时返回失败而不抛错', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new DOMException('Full', 'QuotaExceededError')
      }),
    }

    expect(
      storeStreamSession(
        {
          sessionId: 'quota-session',
          startedAt: 100,
          endedAt: 200,
          roundsCompleted: 1,
          outcome: 'running',
        },
        storage,
      ),
    ).toBe(false)
  })
})
