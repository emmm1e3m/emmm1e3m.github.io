import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  gameStateSchema,
  importableGameStateSchema,
  type ImportableGameState,
} from '@/app/gameStateSchema'
import {
  createInitialGameState,
  DEFAULT_GAME_BALANCE,
  DEFAULT_GAME_BALANCE_V3,
  deriveActivityTiming,
  gameStateV11Schema,
  migrateStoredGameStateToV11,
  migrateStoredGameStateToV12,
  normalizeImportedGameBalance,
  reconcileGameStateWithCatalog,
  reduceGame,
  validateImportedGameState,
  type CollectionCatalog,
  type GameBalance,
  type GameState,
  type GameStateV3,
  type GameStateV5,
  type GameStateV5LegacyMusic,
  type GameStateV7,
  type GameStateV11,
  type GameTransition,
  generateWardrobeShop,
} from '@/domain'

import { createBingoSave, importBingoSave, type BingoSaveError } from './bingoSave'

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

function readPublishedFixture(name: string): Promise<string> {
  return readFile(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8')
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

function asPublishedV3(state: GameState): GameStateV3 {
  return {
    schemaVersion: 3,
    profile: structuredClone(state.profile),
    economy: structuredClone(state.economy),
    inventory: {
      'travel-basic': state.inventory['travel-basic'],
      'travel-apple': state.inventory['travel-apple'],
      'signal-headphones': state.inventory['signal-headphones'],
      'trend-toolbox': state.inventory['trend-toolbox'],
      'lucky-apple': state.inventory['lucky-apple'],
    },
    collections: structuredClone(state.collections),
    friends: structuredClone(state.friends),
    activeActivity: structuredClone(state.activeActivity),
    pet: {
      ...structuredClone(state.pet),
      location: state.pet.location === 'work-computer' ? 'computer' : state.pet.location,
    },
    tasks: {
      active: structuredClone(state.tasks.active),
      completedCount: state.tasks.completedCount,
      recentTemplateIds: structuredClone(state.tasks.recentTemplateIds),
      oneOffCompleted: structuredClone(state.tasks.oneOffCompleted),
    },
    gameBalance: structuredClone(state.gameBalance),
    statistics: structuredClone(state.statistics),
    random: structuredClone(state.random),
  }
}

function asPublishedV5(state: GameState): GameStateV5 {
  const session = state.reality.pomodoro.session
  const legacySession: GameStateV5['reality']['pomodoro']['session'] = session
    ? (() => {
        const { background, ...withoutBackground } = session
        return {
          ...withoutBackground,
          postcardId: background?.kind === 'postcard' ? background.id : null,
        }
      })()
    : null
  const reality: GameStateV5['reality'] = {
    nextStaySequence: state.reality.nextStaySequence,
    activeStay: state.reality.activeStay,
    pendingSettlement: state.reality.pendingSettlement,
    todos: state.reality.todos,
    pomodoro: {
      nextSessionSequence: state.reality.pomodoro.nextSessionSequence,
      selectedPostcardId:
        state.reality.pomodoro.selectedBackground?.kind === 'postcard'
          ? state.reality.pomodoro.selectedBackground.id
          : null,
      session: legacySession,
    },
  }
  const { wardrobe: _wardrobe, ...withoutWardrobe } = state
  void _wardrobe
  return { ...withoutWardrobe, schemaVersion: 5, reality }
}

function asPublishedV7(state: GameState): GameStateV7 {
  const session = state.reality.pomodoro.session
  const legacySession: GameStateV7['reality']['pomodoro']['session'] = session
    ? (() => {
        const { background, ...withoutBackground } = session
        return {
          ...withoutBackground,
          postcardId: background?.kind === 'postcard' ? background.id : null,
        }
      })()
    : null
  const reality: GameStateV7['reality'] = {
    nextStaySequence: state.reality.nextStaySequence,
    activeStay: state.reality.activeStay,
    pendingSettlement: state.reality.pendingSettlement,
    todos: structuredClone(state.reality.todos),
    pomodoro: {
      nextSessionSequence: state.reality.pomodoro.nextSessionSequence,
      selectedPostcardId:
        state.reality.pomodoro.selectedBackground?.kind === 'postcard'
          ? state.reality.pomodoro.selectedBackground.id
          : null,
      session: legacySession,
    },
    streamHistory: structuredClone(state.reality.streamHistory),
  }
  const { wardrobe: _wardrobe, ...withoutWardrobe } = structuredClone(state)
  void _wardrobe
  return { ...withoutWardrobe, schemaVersion: 7, reality }
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
        gameVersion: '0.4.0-duration-snapshot-test',
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

  it('冻结的刷播历史兼容字段可完整导出并恢复', async () => {
    const initial = createInitialGameState({ now: 50_000, seed: 'stream-history-save' })
    const completed: GameState = {
      ...initial,
      reality: {
        ...initial.reality,
        streamHistory: {
          completedRounds: 2,
          recentSessions: [
            {
              sessionId: 'stream-session-save',
              startedAt: 70_000,
              endedAt: 82_000,
              roundsCompleted: 2,
              outcome: 'completed',
            },
          ],
        },
      },
    }

    expect(gameStateSchema.safeParse(completed).success).toBe(true)
    const exported = await createBingoSave(
      { gameVersion: '0.8.0-stream-history', exportedAt: 90_000, payload: completed },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(exported.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })

    expect(imported.payload.reality.streamHistory).toEqual({
      completedRounds: 2,
      recentSessions: [
        {
          sessionId: 'stream-session-save',
          startedAt: 70_000,
          endedAt: 82_000,
          roundsCompleted: 2,
          outcome: 'completed',
        },
      ],
    })
  })

  it('严格导入 V7 后显式迁移默认刷播设置、现实租约、衣柜与每日奖励，并只以 V12 再次导出', async () => {
    const v7 = asPublishedV7(
      createInitialGameState({ now: 50_000, seed: 'stream-settings-v7-save' }),
    )
    expect(gameStateSchema.safeParse(v7).success).toBe(false)
    expect(importableGameStateSchema.safeParse(v7).success).toBe(true)

    const oldSave = await createBingoSave<ImportableGameState>(
      { gameVersion: '0.7.0-demo.1', exportedAt: 60_000, payload: v7 },
      importableGameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(oldSave.text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    const migrated = migrateStoredGameStateToV12(imported.payload, { now: 70_000, catalog })

    expect(migrated).toMatchObject({
      schemaVersion: 12,
      reality: {
        streamSettings: { selfTestBvid: null, favoriteId: 3682220021 },
        streamDailyReward: { lastRewardDateKey: null },
      },
      wardrobe: { layoutVersion: 2 },
    })
    expect(gameStateSchema.safeParse(migrated).success).toBe(true)

    const currentSave = await createBingoSave(
      { gameVersion: '0.10.1', exportedAt: 80_000, payload: migrated },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const roundTrip = await importBingoSave(currentSave.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })
    expect(roundTrip.payload.reality.streamSettings).toEqual({
      selfTestBvid: null,
      favoriteId: 3682220021,
    })
  })

  it('冻结 V11 原始存档可严格导入，并在采用后显式迁移为 V12', async () => {
    const v7 = asPublishedV7(
      createInitialGameState({ now: 50_000, seed: 'frozen-v11-save-import' }),
    )
    const v11: GameStateV11 = migrateStoredGameStateToV11(v7, { now: 60_000, catalog })
    expect(gameStateV11Schema.safeParse(v11).success).toBe(true)

    const oldSave = await createBingoSave<GameStateV11>(
      { gameVersion: '0.10.0', exportedAt: 70_000, payload: v11 },
      gameStateV11Schema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(oldSave.text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    expect(imported.payload.schemaVersion).toBe(11)

    const migrated = migrateStoredGameStateToV12(imported.payload, { now: 80_000, catalog })
    expect(migrated).toMatchObject({
      schemaVersion: 12,
      reality: { streamDailyReward: { lastRewardDateKey: null } },
      wardrobe: { layoutVersion: 2 },
    })
    expect(gameStateSchema.safeParse(migrated).success).toBe(true)
  })

  it('V4 好友聚合记录完整往返且不写目录快照', async () => {
    const initial = createInitialGameState({
      now: 1_000,
      seed: 'friend-round-trip',
      displayName: '苹果朋友',
    })
    const state: GameState = {
      ...initial,
      friends: {
        'signal-dog': {
          id: 'signal-dog',
          firstMetAt: 2_000,
          lastMetAt: 8_000,
          encounterCount: 4,
          totalGiftApples: 9,
        },
      },
    }
    const exported = await createBingoSave(
      { gameVersion: '0.4.0-friend-round-trip', exportedAt: 9_000, payload: state },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(exported.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })

    expect(imported.payload.friends).toEqual(state.friends)
    expect(exported.text).not.toContain('friendTotal')
    expect(exported.text).not.toContain('friendCatalog')
  })

  it('V4 现实进度、魔法、番茄钟与自定义播放列表完整往返且不复制展示元数据', async () => {
    const initial = createInitialGameState({
      now: 1_000,
      seed: 'v4-complete-round-trip',
      displayName: '苹果搭档',
    })
    const state: GameState = {
      ...initial,
      profile: { ...initial.profile, companionDays: 3 },
      inventory: {
        ...initial.inventory,
        'bottled-speed-magic': 2,
        'bottled-vitality-magic': 1,
      },
      collections: {
        'postcard-persistence': {
          id: 'postcard-persistence',
          firstObtainedAt: 1_500,
          duplicateCount: 0,
        },
      },
      world: 'reality',
      player: {
        effects: {
          vitality: {
            activatedAt: 2_000,
            activatedOnCompanionDay: 3,
            expiresAfterCompanionDay: 10,
          },
        },
      },
      reality: {
        nextStaySequence: 1,
        activeStay: {
          stayId: 'reality-0',
          enteredAt: 3_000,
          activeDurationMs: 0,
          leaseStartedAt: 3_000,
        },
        pendingSettlement: null,
        todos: {
          'todo-study': {
            id: 'todo-study',
            title: '认真读十分钟',
            createdAt: 2_500,
            updatedAt: 2_500,
            dueAt: 63_000,
            completedAt: null,
            notificationIssuedAt: null,
          },
        },
        pomodoro: {
          nextSessionSequence: 1,
          selectedBackground: { kind: 'postcard', id: 'postcard-persistence' },
          session: {
            sessionId: 'pomodoro-0',
            status: 'focus',
            startedAt: 3_000,
            focusEndsAt: 63_000,
            cycleEndsAt: 63_000,
            focusDurationMs: 60_000,
            breakDurationMs: 0,
            completedAt: null,
            focusNotificationIssuedAt: null,
            completionNotificationIssuedAt: null,
            todoId: 'todo-study',
            background: { kind: 'postcard', id: 'postcard-persistence' },
          },
        },
        streamHistory: initial.reality.streamHistory,
        streamSettings: {
          selfTestBvid: 'BV1xx411c7mD',
          favoriteId: 3986840044,
        },
        streamDailyReward: initial.reality.streamDailyReward,
      },
      musicPlayer: {
        currentBvid: 'BV1xx411c7mD',
        currentIndex: 0,
        loopMode: 'single',
      },
      wardrobe: {
        ...initial.wardrobe,
        shop: {
          companionDay: 3,
          assetIds: generateWardrobeShop(initial.random.seed, 3, initial.wardrobe.ownedAssetIds),
        },
      },
    }
    expect(gameStateSchema.safeParse(state).success).toBe(true)

    const exported = await createBingoSave(
      { gameVersion: '0.4.0-complete-round-trip', exportedAt: 4_000, payload: state },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(exported.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })

    expect(imported.payload).toEqual(state)
    for (const forbiddenKey of [
      'remainingMs',
      'embedUrl',
      'videoCatalog',
      'catalogTotal',
      'categoryCounts',
      'startAtSeconds',
      'autoplay',
      'playlists',
      'activePlaylistId',
    ]) {
      expect(exported.text).not.toContain(`"${forbiddenKey}"`)
    }
  })

  it('普通旧 V3 接受历史短 balance，规范化后旧活动按原 endsAt、下一次活动按未来默认', async () => {
    const oldDurationMs = 5_000
    const futureDefault: Readonly<GameBalance> = {
      activityDurationMs: 300_000,
      probabilities: {
        postcard: 1,
        millionShot: 0.5,
        siteFirst: 0.2,
        travelFriend: 0.25,
        musicFriend: 0.15,
      },
    }
    const oldBase = debugStateReadyToTravel()
    const ordinaryOldBase: GameState = {
      ...oldBase,
      profile: { ...oldBase.profile, debug: false },
      gameBalance: {
        activityDurationMs: oldDurationMs,
        probabilities: {
          postcard: 1,
          millionShot: 0.3,
          siteFirst: 0.05,
          travelFriend: 0.1,
          musicFriend: 0.05,
        },
      },
    }
    const startedAt = 20_000
    const oldStartedV4 = successful(
      reduceGame(
        ordinaryOldBase,
        { type: 'activity/start', kind: 'travel', now: startedAt },
        catalog,
      ),
    ).state
    const oldStarted = asPublishedV3(oldStartedV4)
    const oldActivity = oldStarted.activeActivity
    expect(oldActivity?.endsAt).toBe(startedAt + oldDurationMs)
    expect(gameStateSchema.safeParse(oldStarted).success).toBe(false)
    expect(importableGameStateSchema.safeParse(oldStarted).success).toBe(true)

    const oldSave = await createBingoSave<ImportableGameState>(
      {
        gameVersion: '0.3.0-old-short-balance',
        exportedAt: startedAt + 1_000,
        payload: oldStarted,
      },
      importableGameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(oldSave.text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    if (imported.payload.schemaVersion !== 3) throw new Error('测试存档没有保留 V3 payload')

    const normalized = normalizeImportedGameBalance(
      migrateStoredGameStateToV12(imported.payload, { now: startedAt + 1_000, catalog }),
      futureDefault,
    )
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

  it('普通旧 V4 可带历史默认规则导入，但只规范未来活动且不改进行中时间窗', async () => {
    const historicalDurationMs = 112_000
    const startedAt = 30_000
    const base = debugStateReadyToTravel()
    const historicalOrdinary: GameState = {
      ...base,
      profile: { ...base.profile, debug: false },
      gameBalance: {
        activityDurationMs: historicalDurationMs,
        probabilities: {
          postcard: 0.6,
          millionShot: 0.35,
          siteFirst: 0.08,
          travelFriend: 0.15,
          musicFriend: 0.1,
        },
      },
    }
    const started = successful(
      reduceGame(
        historicalOrdinary,
        { type: 'activity/start', kind: 'travel', now: startedAt },
        catalog,
      ),
    ).state
    const persistedActivity = structuredClone(started.activeActivity)
    expect(started.activeActivity?.endsAt).toBe(startedAt + historicalDurationMs)
    expect(gameStateSchema.safeParse(started).success).toBe(false)
    expect(importableGameStateSchema.safeParse(started).success).toBe(true)

    const exported = await createBingoSave<ImportableGameState>(
      {
        gameVersion: '0.4.0-historical-default',
        exportedAt: startedAt + 1_000,
        payload: started,
      },
      importableGameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(exported.text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    const normalized = normalizeImportedGameBalance(
      migrateStoredGameStateToV12(imported.payload, { now: startedAt + 1_000, catalog }),
    )

    expect(normalized.gameBalance).toEqual(DEFAULT_GAME_BALANCE)
    expect(normalized.activeActivity).toEqual(persistedActivity)
    expect(normalized.activeActivity?.endsAt).toBe(startedAt + historicalDurationMs)
  })
})

describe('冻结的已发布存档兼容性', () => {
  it('读取发布提交 8097645 生成的真实 V11，迁移后以 V12 完整再导出', async () => {
    const text = await readPublishedFixture('published-v11-8097645.bingo')
    const imported = await importBingoSave(text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })

    expect(imported.summary.gameVersion).toBe('0.10.0')
    expect(imported.payload.schemaVersion).toBe(11)
    if (imported.payload.schemaVersion !== 11) throw new Error('固定存档不是 V11')
    const legacy = imported.payload
    expect(gameStateV11Schema.safeParse(legacy).success).toBe(true)
    const before = structuredClone(legacy)
    const legacyLook = Object.values(legacy.wardrobe.looks)[0]
    const legacyPhoto = Object.values(legacy.wardrobe.photos)[0]
    if (legacyLook === undefined || legacyPhoto === undefined) {
      throw new Error('固定 V11 存档缺少造型或合拍')
    }
    expect(legacyLook.elements).not.toHaveLength(0)
    expect(legacyLook.elements[0]).toHaveProperty('scale')
    expect(legacyLook.elements[0]).not.toHaveProperty('scaleX')
    expect(legacyPhoto).not.toHaveProperty('decorations')
    const fixtureCatalog: CollectionCatalog = {
      ...catalog,
      postcard:
        legacyPhoto.postcardId === null
          ? catalog.postcard
          : [...catalog.postcard, legacyPhoto.postcardId],
    }

    const migrated = migrateStoredGameStateToV12(legacy, { now: 900_000, catalog: fixtureCatalog })
    expect(legacy).toEqual(before)
    expect(migrated).toMatchObject({
      schemaVersion: 12,
      reality: {
        streamDailyReward: { lastRewardDateKey: null },
        pomodoro: {
          selectedBackground:
            legacy.reality.pomodoro.selectedPostcardId === null
              ? null
              : { kind: 'postcard', id: legacy.reality.pomodoro.selectedPostcardId },
        },
      },
      wardrobe: { layoutVersion: 2 },
    })
    const migratedLook = migrated.wardrobe.looks[legacyLook.lookId]
    const migratedPhoto = migrated.wardrobe.photos[legacyPhoto.photoId]
    expect(migrated.wardrobe.shop).toEqual(legacy.wardrobe.shop)
    expect(migrated.wardrobe.ownedAssetIds).toEqual(legacy.wardrobe.ownedAssetIds)
    expect(migratedLook.elements).toHaveLength(legacyLook.elements.length)
    migratedLook.elements.forEach((element, index) => {
      expect(element.scaleX).toBe(legacyLook.elements[index].scale)
      expect(element.scaleY).toBe(legacyLook.elements[index].scale)
    })
    expect(migratedPhoto.decorations).toEqual([])
    expect(migratedPhoto.participants[0].sourceLookId).toBe(
      legacyPhoto.participants[0].sourceLookId,
    )
    expect(migratedPhoto.participants[0].scaleX).toBe(legacyPhoto.participants[0].scale)
    expect(migratedPhoto.participants[0].scaleY).toBe(legacyPhoto.participants[0].scale)
    migratedPhoto.participants[0].elements.forEach((element, index) => {
      expect(element.scaleX).toBe(legacyPhoto.participants[0].elements[index].scale)
      expect(element.scaleY).toBe(legacyPhoto.participants[0].elements[index].scale)
    })
    expect(validateImportedGameState(migrated, fixtureCatalog)).toEqual({ ok: true })
    expect(gameStateSchema.safeParse(migrated).success).toBe(true)

    const reexported = await createBingoSave(
      { gameVersion: '0.10.1', exportedAt: 910_000, payload: migrated },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const roundTrip = await importBingoSave(reexported.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })
    expect(roundTrip.payload).toEqual(migrated)
  })

  it('读取真实固定 v1 并确定性迁移称呼、陪伴天数与空好友图鉴', async () => {
    const text = await readPublishedFixture('published-v1-ordinary.bingo.fixture')
    const imported = await importBingoSave(text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })

    expect(imported.summary.schemaVersion).toBe(1)
    expect(imported.payload.schemaVersion).toBe(1)
    const migrated = migrateStoredGameStateToV12(imported.payload, { now: 900_000, catalog })

    expect(migrated).toMatchObject({
      schemaVersion: 12,
      profile: { displayName: '你', companionDays: 3 },
      friends: {},
      reality: {
        streamSettings: { selfTestBvid: null, favoriteId: 3682220021 },
      },
    })
    expect(validateImportedGameState(migrated, catalog)).toEqual({ ok: true })
  })

  it('读取真实固定 v2，保留活动绝对时间及已抽中的收藏和朋友结果', async () => {
    const text = await readPublishedFixture('published-v2-active.bingo.fixture')
    const imported = await importBingoSave(text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    expect(imported.payload.schemaVersion).toBe(2)

    const migrated = reconcileGameStateWithCatalog(
      normalizeImportedGameBalance(
        migrateStoredGameStateToV12(imported.payload, { now: 900_000, catalog }),
      ),
      catalog,
    )
    expect(migrated.profile).toMatchObject({ displayName: '你', companionDays: 3 })
    expect(migrated.activeActivity).toEqual({
      runId: 'frozen-v2-active',
      kind: 'travel',
      startedAt: 50_000,
      endsAt: 55_000,
      rewardSeed: 'frozen-v2-reward',
      rewardPlan: {
        baseApples: 0,
        modifierApples: 0,
        collection: { id: 'postcard-persistence', category: 'postcard' },
        friendId: 'signal-dog',
        giftItemId: null,
        guaranteedByPity: false,
        pityAfterClaim: null,
      },
      supplyId: 'travel-basic',
      usedLuckyApple: false,
    })
    expect(migrated.gameBalance).toEqual(DEFAULT_GAME_BALANCE)
    expect(validateImportedGameState(migrated, catalog)).toEqual({ ok: true })

    const reexported = await createBingoSave(
      { gameVersion: '0.4.0-fixture-round-trip', exportedAt: 910_000, payload: migrated },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const roundTrip = await importBingoSave(reexported.text, gameStateSchema, {
      subtle: webcrypto.subtle,
    })
    expect(roundTrip.payload.activeActivity).toEqual(migrated.activeActivity)
  })

  it('读取真实固定 v2 DEBUG 时保留历史调参并扩展新概率字段', async () => {
    const text = await readPublishedFixture('published-v2-debug.bingo.fixture')
    const imported = await importBingoSave(text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    const migrated = migrateStoredGameStateToV12(imported.payload, { now: 900_000, catalog })

    expect(migrated.profile.debug).toBe(true)
    expect(migrated.gameBalance).toEqual({
      activityDurationMs: 10_000,
      probabilities: {
        postcard: 0.2,
        millionShot: 0.9,
        siteFirst: 0.7,
        travelFriend: 0.6,
        musicFriend: DEFAULT_GAME_BALANCE_V3.probabilities.musicFriend,
      },
    })
    expect(gameStateSchema.safeParse(migrated).success).toBe(true)
  })

  it('已发布的旧 V5 列表缓存仍可导入，采用后不再导出列表字段', async () => {
    const current = asPublishedV5(
      createInitialGameState({ now: 1_000, seed: 'legacy-v5-music-cache' }),
    )
    const legacyV5: GameStateV5LegacyMusic = {
      ...current,
      musicPlayer: {
        ...current.musicPlayer,
        playlists: {
          legacy: {
            id: 'legacy',
            name: '旧版列表',
            bvids: ['BV1234567890'],
            createdAt: 1_000,
            updatedAt: 1_000,
          },
        },
        order: ['legacy'],
        activePlaylistId: 'legacy',
        currentBvid: 'BV1234567890',
        currentIndex: 0,
        loopMode: 'single',
      },
    }
    expect(gameStateSchema.safeParse(legacyV5).success).toBe(false)
    expect(importableGameStateSchema.safeParse(legacyV5).success).toBe(true)

    const oldSave = await createBingoSave<ImportableGameState>(
      { gameVersion: '0.5.0-legacy-music', exportedAt: 2_000, payload: legacyV5 },
      importableGameStateSchema,
      { subtle: webcrypto.subtle },
    )
    const imported = await importBingoSave(oldSave.text, importableGameStateSchema, {
      subtle: webcrypto.subtle,
    })
    const migrated = migrateStoredGameStateToV12(imported.payload, { now: 2_000, catalog })

    expect(migrated.musicPlayer).toEqual({
      currentBvid: 'BV1234567890',
      currentIndex: 0,
      loopMode: 'single',
    })
    expect(gameStateSchema.safeParse(migrated).success).toBe(true)

    const currentSave = await createBingoSave(
      { gameVersion: '0.5.0-current-music', exportedAt: 3_000, payload: migrated },
      gameStateSchema,
      { subtle: webcrypto.subtle },
    )
    expect(currentSave.text).not.toContain('"playlists"')
    expect(currentSave.text).not.toContain('"activePlaylistId"')
  })

  it('固定旧档被篡改且摘要未更新时仍在迁移前拒绝', async () => {
    const text = await readPublishedFixture('published-v2-active.bingo.fixture')
    const tampered = JSON.parse(text) as { payload: { economy: { apples: number } } }
    tampered.payload.economy.apples += 1

    await expect(
      importBingoSave(JSON.stringify(tampered), importableGameStateSchema, {
        subtle: webcrypto.subtle,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BingoSaveError>>({ code: 'INTEGRITY_MISMATCH' }),
    )
  })
})
