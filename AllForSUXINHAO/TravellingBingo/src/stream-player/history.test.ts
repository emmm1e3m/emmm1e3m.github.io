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
})
