import { webcrypto } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  gameStateSchema,
  importableGameStateSchema,
  type ImportableGameState,
} from '@/app/gameStateSchema'
import {
  createInitialGameState,
  deriveActivityTiming,
  normalizeImportedGameBalance,
  reduceGame,
  type CollectionCatalog,
  type GameBalance,
  type GameState,
  type GameTransition,
} from '@/domain'

import { createBingoSave, importBingoSave } from './bingoSave'

const catalog: CollectionCatalog = {
  postcard: ['postcard-persistence'],
  'million-shot': ['million-persistence'],
  'site-first': ['site-first-persistence'],
  siteFirstChronology: ['site-first-persistence'],
}

function successful(transition: GameTransition): Extract<GameTransition, { ok: true }> {
  if (!transition.ok) throw new Error(`${transition.error.code}: ${transition.error.message}`)
  return transition
}

function debugStateReadyToTravel(): GameState {
  const state = createInitialGameState({ now: 1_000, seed: 'duration-snapshot', debug: true })
  return {
    ...state,
    pet: {
      ...state.pet,
      preferences: { ...state.pet.preferences, travel: true },
    },
  }
}

describe('游戏活动存档时长快照', () => {
  it('真实 .bingo 往返保留 startedAt/endsAt，并始终按原 endsAt 判断 running 与 ready', async () => {
    const startedAt = 10_000
    const shortDurationMs = 5_000
    const laterDurationMs = 300_000
    const started = successful(
      reduceGame(
        debugStateReadyToTravel(),
        {
          type: 'activity/start',
          kind: 'travel',
          now: startedAt,
          debugDurationMs: shortDurationMs,
        },
        catalog,
      ),
    ).state
    const withLongerCurrentBalance = successful(
      reduceGame(started, { type: 'debug/duration-set', durationMs: laterDurationMs }, catalog),
    ).state

    expect(withLongerCurrentBalance.activeActivity).toMatchObject({
      startedAt,
      endsAt: startedAt + shortDurationMs,
    })
    expect(withLongerCurrentBalance.gameBalance.activityDurationMs).toBe(laterDurationMs)

    const exported = await createBingoSave(
      {
        gameVersion: '0.2.0-duration-snapshot-test',
        exportedAt: startedAt + 1_000,
        payload: withLongerCurrentBalance,
      },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const rawPayload = (JSON.parse(exported.text) as { payload: GameState }).payload
    expect(rawPayload.activeActivity).toMatchObject({
      startedAt,
      endsAt: startedAt + shortDurationMs,
    })

    const imported = await importBingoSave(exported.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })
    const activity = imported.payload.activeActivity

    expect(activity).toEqual(withLongerCurrentBalance.activeActivity)
    expect(imported.payload.gameBalance.activityDurationMs).toBe(laterDurationMs)
    expect(deriveActivityTiming(activity, startedAt + shortDurationMs - 1)).toMatchObject({
      phase: 'running',
      remainingMs: 1,
    })
    expect(deriveActivityTiming(activity, startedAt + shortDurationMs)).toMatchObject({
      phase: 'ready',
      remainingMs: 0,
      progress: 1,
    })

    const earlyClaim = reduceGame(
      imported.payload,
      {
        type: 'activity/claim',
        runId: activity!.runId,
        now: startedAt + shortDurationMs - 1,
      },
      catalog,
    )
    expect(earlyClaim).toMatchObject({ ok: false, error: { code: 'ACTIVITY_NOT_READY' } })

    const readyClaim = successful(
      reduceGame(
        imported.payload,
        {
          type: 'activity/claim',
          runId: activity!.runId,
          now: startedAt + shortDurationMs,
        },
        catalog,
      ),
    )
    expect(readyClaim.state.activeActivity).toBeNull()
  })

  it('普通旧档接受历史短 balance，规范化后旧活动按原 endsAt、下一次活动按未来默认', async () => {
    const oldDurationMs = 5_000
    const futureDefault: Readonly<GameBalance> = {
      activityDurationMs: 300_000,
      probabilities: { postcard: 1, millionShot: 0.5, siteFirst: 0.2, friend: 0.25 },
    }
    const oldBase = debugStateReadyToTravel()
    const ordinaryOldBase: GameState = {
      ...oldBase,
      profile: { ...oldBase.profile, debug: false },
      gameBalance: {
        activityDurationMs: oldDurationMs,
        probabilities: { postcard: 1, millionShot: 0.3, siteFirst: 0.05, friend: 0.1 },
      },
    }
    const startedAt = 20_000
    const oldStarted = successful(
      reduceGame(
        ordinaryOldBase,
        { type: 'activity/start', kind: 'travel', now: startedAt },
        catalog,
      ),
    ).state
    const oldActivity = oldStarted.activeActivity
    expect(oldActivity?.endsAt).toBe(startedAt + oldDurationMs)
    expect(gameStateSchema.safeParse(oldStarted).success).toBe(false)
    expect(importableGameStateSchema.safeParse(oldStarted).success).toBe(true)

    const oldSave = await createBingoSave<ImportableGameState>(
      {
        gameVersion: '0.2.0-old-short-balance',
        exportedAt: startedAt + 1_000,
        payload: oldStarted,
      },
      importableGameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(oldSave.text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    if (imported.payload.schemaVersion !== 2) throw new Error('测试存档没有保留 v2 payload')

    const normalized = normalizeImportedGameBalance(imported.payload, futureDefault)
    expect(normalized.gameBalance).toEqual(futureDefault)
    expect(normalized.activeActivity).toEqual(oldActivity)
    expect(
      deriveActivityTiming(normalized.activeActivity, startedAt + oldDurationMs - 1).phase,
    ).toBe('running')
    expect(deriveActivityTiming(normalized.activeActivity, startedAt + oldDurationMs).phase).toBe(
      'ready',
    )

    const claimed = successful(
      reduceGame(
        normalized,
        {
          type: 'activity/claim',
          runId: normalized.activeActivity!.runId,
          now: startedAt + oldDurationMs,
        },
        catalog,
      ),
    ).state
    const nextStartedAt = startedAt + oldDurationMs + 100
    const readyForNextActivity: GameState = {
      ...claimed,
      inventory: { ...claimed.inventory, 'travel-basic': 1 },
      pet: {
        ...claimed.pet,
        preferences: { ...claimed.pet.preferences, travel: true },
        tired: false,
      },
    }
    const nextStarted = successful(
      reduceGame(
        readyForNextActivity,
        { type: 'activity/start', kind: 'travel', now: nextStartedAt },
        catalog,
      ),
    ).state

    expect(nextStarted.activeActivity?.endsAt).toBe(
      nextStartedAt + futureDefault.activityDurationMs,
    )
  })
})
