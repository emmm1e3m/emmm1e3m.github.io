import { BILIBILI_BVID_PATTERN, MAX_APPLES, PIANO_NOTE_IDS } from '../game/constants'
import { incrementSafeCounter, saturatingAddSafeCounter } from '../game/counters'
import type {
  CollectionCatalog,
  CollectibleCategory,
  GameState,
  RoomArea,
  TaskBoard,
  TaskEvent,
  TaskId,
  TaskInstance,
  TaskTriggerGroup,
  TaskBoardV4,
} from '../game/types'
import { createRandomCursor, hashSeed, randomInteger, type RandomCursor } from '../rewards/prng'

export interface TaskPresentation {
  title: string
  description: string
}

export interface TaskAssignmentRequirement {
  kind: 'owned-collection'
  /** 未指定类别时，可由任意收藏满足。 */
  category?: CollectibleCategory
  minimum: number
}

export interface TaskTemplate extends TaskPresentation {
  id: TaskId
  triggerGroup: TaskTriggerGroup
  target: number
  rewardApples: number
  oneOff?: boolean
  /** 只影响新任务的签发；已经签发的任务继续使用自身快照。 */
  assignmentRequirements?: readonly TaskAssignmentRequirement[]
}

export const TASK_LIBRARY: Readonly<Record<TaskId, TaskTemplate>> = {
  'greet-bingo': {
    id: 'greet-bingo',
    triggerGroup: 'pet',
    title: '看看饼狗的小背包',
    description: '打开一次饼狗菜单',
    target: 1,
    rewardApples: 1,
  },
  'open-backpack': {
    id: 'open-backpack',
    triggerGroup: 'pet',
    title: '看看小背包',
    description: '打开一次饼狗菜单',
    target: 1,
    rewardApples: 1,
  },
  'room-stroll': {
    id: 'room-stroll',
    triggerGroup: 'room-navigation',
    title: '在饼屋里走走',
    description: '去两个不同的角落',
    target: 2,
    rewardApples: 2,
  },
  'piano-time': {
    id: 'piano-time',
    triggerGroup: 'music',
    title: '弹一小段琴',
    description: '在电子琴上弹响一个音',
    target: 1,
    rewardApples: 1,
  },
  'record-time': {
    id: 'record-time',
    triggerGroup: 'music',
    title: '看看一张唱片',
    description: '主动打开唱片播放器看看',
    target: 1,
    rewardApples: 1,
  },
  'two-melodies': {
    id: 'two-melodies',
    triggerGroup: 'music',
    title: '逛逛音乐角落',
    description: '弹响不同琴键，或打开不同视频看看',
    target: 2,
    rewardApples: 2,
  },
  'wardrobe-choice': {
    id: 'wardrobe-choice',
    triggerGroup: 'wardrobe',
    title: '挑挑今天的造型',
    description: '去衣架旁看看',
    target: 1,
    rewardApples: 1,
  },
  'open-memories': {
    id: 'open-memories',
    triggerGroup: 'collection',
    title: '打开收藏墙',
    description: '看看已经收藏的回忆',
    target: 1,
    rewardApples: 1,
    assignmentRequirements: [{ kind: 'owned-collection', minimum: 1 }],
  },
  'revisit-two': {
    id: 'revisit-two',
    triggerGroup: 'collection',
    title: '重温两份回忆',
    description: '查看两份不同的收藏',
    target: 2,
    rewardApples: 2,
    assignmentRequirements: [{ kind: 'owned-collection', minimum: 2 }],
  },
  'remember-postcard': {
    id: 'remember-postcard',
    triggerGroup: 'collection',
    title: '重看一张明信片',
    description: '查看一份明信片收藏',
    target: 1,
    rewardApples: 1,
    assignmentRequirements: [{ kind: 'owned-collection', category: 'postcard', minimum: 1 }],
  },
  'remember-million': {
    id: 'remember-million',
    triggerGroup: 'collection',
    title: '重看一次百万瞬间',
    description: '查看一份百万直拍收藏',
    target: 1,
    rewardApples: 1,
    assignmentRequirements: [{ kind: 'owned-collection', category: 'million-shot', minimum: 1 }],
  },
  'remember-first': {
    id: 'remember-first',
    triggerGroup: 'collection',
    title: '重看全站第一',
    description: '查看一份全站第一收藏',
    target: 1,
    rewardApples: 2,
    assignmentRequirements: [{ kind: 'owned-collection', category: 'site-first', minimum: 1 }],
  },
  'stage-test': {
    id: 'stage-test',
    triggerGroup: 'stage',
    title: '奇迹饼狗',
    description: '完成一次舞台测试',
    target: 1,
    rewardApples: 3,
    oneOff: true,
  },
}

const TASK_IDS = Object.keys(TASK_LIBRARY) as TaskId[]
const RETIRED_TASK_IDS: ReadonlySet<TaskId> = new Set(['greet-bingo'])
const ROOM_AREA_KEYS: ReadonlySet<RoomArea> = new Set([
  'bed',
  'computer',
  'wardrobe',
  'piano',
  'record-player',
  'fridge',
  'collection-wall',
  'door',
  'work-computer',
])
const PIANO_PROGRESS_KEYS: ReadonlySet<string> = new Set([
  'piano',
  ...PIANO_NOTE_IDS.map((noteId) => `piano:${noteId}`),
])
const LEGACY_RECORD_PLAYER_PROGRESS_KEY = 'record-player'

const EMPTY_CATALOG: CollectionCatalog = {
  postcard: [],
  'million-shot': [],
  'site-first': [],
  siteFirstChronology: [],
}

export interface TaskAvailabilityInput {
  catalog?: CollectionCatalog
  collections?: Readonly<Record<string, unknown>>
  oneOffCompleted?: readonly TaskId[]
}

interface TaskGenerationInput extends TaskAvailabilityInput {
  seed: string
  sequence: number
  now: number
  recentTemplateIds?: readonly TaskId[]
  completedCount?: number
}

export interface GeneratedTaskBoard {
  board: TaskBoardV4
  nextSequence: number
}

export interface ReplaceRetiredTaskBoardInput {
  board: TaskBoardV4
  seed: string
  sequence: number
  now: number
  catalog?: CollectionCatalog
  collections?: Readonly<Record<string, unknown>>
}

export interface ReconcileTaskBoardAvailabilityInput extends TaskAvailabilityInput {
  board: TaskBoard
  seed: string
  sequence: number
}

export interface ReconciledTaskBoard {
  board: TaskBoard
  nextSequence: number
}

export type TaskReachabilityValidation = { ok: true } | { ok: false; message: string }

function unreachable(message: string): TaskReachabilityValidation {
  return { ok: false, message }
}

function validateFiniteKeySpace(
  task: TaskInstance,
  allowedKeys: ReadonlySet<string>,
): TaskReachabilityValidation {
  if (task.target > allowedKeys.size) {
    return unreachable(`任务“${task.taskId}”的历史目标超过可产生的独立事件数量。`)
  }
  return task.seenKeys.every((key) => allowedKeys.has(key))
    ? { ok: true }
    : unreachable(`任务“${task.taskId}”包含无法由该任务产生的进度事件。`)
}

function isVideoProgressKey(key: string): boolean {
  return key.startsWith('video:') && BILIBILI_BVID_PATTERN.test(key.slice('video:'.length))
}

/**
 * 校验历史 target 快照是否仍有足够多的不同领域事件可达，并约束已记录 key 的命名空间。
 * rewardApples 是已经签发的历史奖励快照，故本函数刻意不与当前模板奖励强等。
 */
export function validateTaskInstanceReachability(
  task: TaskInstance,
  catalog: CollectionCatalog,
): TaskReachabilityValidation {
  switch (task.taskId) {
    case 'greet-bingo':
      return unreachable('打招呼任务已经退役，无法继续完成。')
    case 'open-backpack':
      return validateFiniteKeySpace(task, new Set(['opened']))
    case 'room-stroll':
      return validateFiniteKeySpace(task, ROOM_AREA_KEYS)
    case 'piano-time': {
      const keyValidation = validateFiniteKeySpace(task, PIANO_PROGRESS_KEYS)
      if (!keyValidation.ok) return keyValidation
      // 旧版的 `piano` 只能作为已经写入的历史 key 保留，当前版本无法再次产生它；
      // 因此只有历史进度已经包含该 key 时，可达上限才额外增加一项。
      const reachableKeyCount = PIANO_NOTE_IDS.length + (task.seenKeys.includes('piano') ? 1 : 0)
      return task.target <= reachableKeyCount
        ? { ok: true }
        : unreachable(`任务“${task.taskId}”的历史目标超过可产生的独立事件数量。`)
    }
    case 'record-time': {
      const keysAreValid = task.seenKeys.every(
        (key) => key === LEGACY_RECORD_PLAYER_PROGRESS_KEY || isVideoProgressKey(key),
      )
      if (!keysAreValid) return unreachable('唱片机任务包含无效的视频进度 key。')
      return task.target <= TASK_LIBRARY['record-time'].target
        ? { ok: true }
        : unreachable('唱片机任务的历史目标超过已发布模板的可达上限。')
    }
    case 'two-melodies': {
      const keysAreValid = task.seenKeys.every(
        (key) =>
          PIANO_PROGRESS_KEYS.has(key) ||
          key === LEGACY_RECORD_PLAYER_PROGRESS_KEY ||
          isVideoProgressKey(key),
      )
      if (!keysAreValid) return unreachable('音乐任务包含无效的琴键或视频进度 key。')
      return task.target <= TASK_LIBRARY['two-melodies'].target
        ? { ok: true }
        : unreachable('音乐任务的历史目标超过已发布模板的可达上限。')
    }
    case 'wardrobe-choice':
      return validateFiniteKeySpace(task, new Set(['wardrobe']))
    case 'open-memories':
      return validateFiniteKeySpace(task, new Set(['wall']))
    case 'revisit-two':
      return validateFiniteKeySpace(
        task,
        new Set([...catalog.postcard, ...catalog['million-shot'], ...catalog['site-first']]),
      )
    case 'remember-postcard':
      return validateFiniteKeySpace(task, new Set(catalog.postcard))
    case 'remember-million':
      return validateFiniteKeySpace(task, new Set(catalog['million-shot']))
    case 'remember-first':
      return validateFiniteKeySpace(task, new Set(catalog['site-first']))
    case 'stage-test':
      return validateFiniteKeySpace(task, new Set(['opened']))
  }
}

interface TaskAssignmentContext {
  ownedCollectionIds: ReadonlySet<string>
  ownedCollectionIdsByCategory: Readonly<Record<CollectibleCategory, ReadonlySet<string>>>
  completedOneOff: ReadonlySet<TaskId>
}

function createTaskAssignmentContext(input: TaskAvailabilityInput): TaskAssignmentContext {
  const catalog = input.catalog ?? EMPTY_CATALOG
  const owned = new Set(Object.keys(input.collections ?? {}))
  const ownedCollectionIdsByCategory = {
    postcard: new Set(catalog.postcard.filter((id) => owned.has(id))),
    'million-shot': new Set(catalog['million-shot'].filter((id) => owned.has(id))),
    'site-first': new Set(catalog['site-first'].filter((id) => owned.has(id))),
  }
  return {
    ownedCollectionIds: new Set(
      Object.values(ownedCollectionIdsByCategory).flatMap((ids) => [...ids]),
    ),
    ownedCollectionIdsByCategory,
    completedOneOff: new Set(input.oneOffCompleted ?? []),
  }
}

function meetsAssignmentRequirement(
  requirement: TaskAssignmentRequirement,
  context: TaskAssignmentContext,
): boolean {
  const owned = requirement.category
    ? context.ownedCollectionIdsByCategory[requirement.category]
    : context.ownedCollectionIds
  return owned.size >= requirement.minimum
}

function meetsTaskAssignmentRequirementsInContext(
  taskId: TaskId,
  context: TaskAssignmentContext,
): boolean {
  return (TASK_LIBRARY[taskId].assignmentRequirements ?? []).every((requirement) =>
    meetsAssignmentRequirement(requirement, context),
  )
}

export function meetsTaskAssignmentRequirements(
  taskId: TaskId,
  input: TaskAvailabilityInput,
): boolean {
  return meetsTaskAssignmentRequirementsInContext(taskId, createTaskAssignmentContext(input))
}

function meetsTaskInstanceAssignmentRequirementsInContext(
  task: TaskInstance,
  context: TaskAssignmentContext,
): boolean {
  return (TASK_LIBRARY[task.taskId].assignmentRequirements ?? []).every((requirement) =>
    meetsAssignmentRequirement(
      { ...requirement, minimum: Math.max(requirement.minimum, task.target) },
      context,
    ),
  )
}

export function meetsTaskInstanceAssignmentRequirements(
  task: TaskInstance,
  input: TaskAvailabilityInput,
): boolean {
  return meetsTaskInstanceAssignmentRequirementsInContext(task, createTaskAssignmentContext(input))
}

/**
 * 在随机抽取前建立可签发候选池。收藏只统计当前目录中仍可打开的已拥有项目，
 * 防止未知或已移除的历史 ID 让任务看似可达。
 */
export function getAssignableTaskIds(input: TaskAvailabilityInput): TaskId[] {
  const context = createTaskAssignmentContext(input)

  return TASK_IDS.filter((taskId) => {
    if (RETIRED_TASK_IDS.has(taskId)) return false
    const template = TASK_LIBRARY[taskId]
    if (template.oneOff && context.completedOneOff.has(taskId)) return false
    return meetsTaskAssignmentRequirementsInContext(taskId, context)
  })
}

function shuffleTaskIds(
  ids: readonly TaskId[],
  cursor: RandomCursor,
): { ids: TaskId[]; cursor: RandomCursor } {
  const shuffled = [...ids]
  let nextCursor = cursor
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selected = randomInteger(nextCursor, 0, index)
    nextCursor = selected.cursor
    ;[shuffled[index], shuffled[selected.value]] = [shuffled[selected.value], shuffled[index]]
  }
  return { ids: shuffled, cursor: nextCursor }
}

interface ReplacementSelectionInput {
  eligible: readonly TaskId[]
  retained: readonly TaskInstance[]
  recentTemplateIds: readonly TaskId[]
  seed: string
  sequence: number
  count: number
}

function chooseReplacementTemplates(input: ReplacementSelectionInput): TaskId[] {
  const recent = new Set(input.recentTemplateIds)
  const retainedIds = new Set(input.retained.map((entry) => entry.taskId))
  const usedGroups = new Set(input.retained.map((entry) => TASK_LIBRARY[entry.taskId].triggerGroup))
  let cursor = createRandomCursor(`${input.seed}:tasks:${input.sequence}`)
  const preferred = shuffleTaskIds(
    input.eligible.filter((taskId) => !recent.has(taskId)),
    cursor,
  )
  cursor = preferred.cursor
  const fallback = shuffleTaskIds(input.eligible, cursor)
  const replacements: TaskId[] = []

  for (const candidates of [preferred.ids, fallback.ids]) {
    for (const taskId of candidates) {
      const group = TASK_LIBRARY[taskId].triggerGroup
      if (retainedIds.has(taskId) || replacements.includes(taskId) || usedGroups.has(group)) {
        continue
      }
      replacements.push(taskId)
      usedGroups.add(group)
      if (replacements.length === input.count) return replacements
    }
  }

  throw new Error('当前任务库无法为任务板选择可达替补')
}

function chooseTemplates(input: TaskGenerationInput): TaskId[] {
  const eligible = getAssignableTaskIds(input)
  const recent = new Set(input.recentTemplateIds ?? [])
  let cursor = createRandomCursor(`${input.seed}:tasks:${input.sequence}`)
  const preferred = shuffleTaskIds(
    eligible.filter((id) => !recent.has(id)),
    cursor,
  )
  cursor = preferred.cursor
  const fallback = shuffleTaskIds(eligible, cursor)
  const selected: TaskId[] = []
  const usedGroups = new Set<TaskTriggerGroup>()

  // 最近六项只是“尽量不重复”：先取新模板，不足三组时才回退到完整任务池。
  for (const candidates of [preferred.ids, fallback.ids]) {
    for (const taskId of candidates) {
      const group = TASK_LIBRARY[taskId].triggerGroup
      if (selected.includes(taskId) || usedGroups.has(group)) continue
      selected.push(taskId)
      usedGroups.add(group)
      if (selected.length === 3) return selected
    }
  }

  throw new Error('当前任务库无法生成三个触发组互不重复的任务')
}

function createTaskInstance(
  taskId: TaskId,
  seed: string,
  sequence: number,
  slotIndex: number,
  now: number,
): TaskInstance {
  const template = TASK_LIBRARY[taskId]
  return {
    instanceId: `task-${sequence.toString(36)}-${slotIndex}-${hashSeed(`${seed}:${taskId}:${sequence}`).toString(36)}`,
    taskId,
    assignedAt: now,
    progress: 0,
    target: template.target,
    rewardApples: template.rewardApples,
    seenKeys: [],
  }
}

export function generateTaskBoard(input: TaskGenerationInput): GeneratedTaskBoard {
  const selected = chooseTemplates(input)
  const active = selected.map((taskId, index) =>
    createTaskInstance(taskId, input.seed, input.sequence, index, input.now),
  ) as [TaskInstance, TaskInstance, TaskInstance]

  return {
    board: {
      active,
      completedCount: input.completedCount ?? 0,
      recentTemplateIds: [...(input.recentTemplateIds ?? []), ...selected].slice(-6),
      oneOffCompleted: [...(input.oneOffCompleted ?? [])],
    },
    nextSequence: incrementSafeCounter(input.sequence),
  }
}

/** 旧存档仍可读取退役模板，但 V4 新任务板不再签发它。 */
export function hasRetiredTask(board: Pick<TaskBoard, 'active'>): boolean {
  return board.active.some((entry) => RETIRED_TASK_IDS.has(entry.taskId))
}

/**
 * 只替换旧板中的退役槽位，保留其他任务的进度与快照。
 * 调用方传入 random.sequences.tasks，并仅用 nextSequence 回写该序列。
 */
export function replaceRetiredTaskBoard(input: ReplaceRetiredTaskBoardInput): GeneratedTaskBoard {
  if (!hasRetiredTask(input.board)) {
    return { board: input.board, nextSequence: input.sequence }
  }

  const retiredSlots = input.board.active
    .map((entry, index) => (RETIRED_TASK_IDS.has(entry.taskId) ? index : -1))
    .filter((index) => index >= 0)
  const retained = input.board.active.filter((entry) => !RETIRED_TASK_IDS.has(entry.taskId))
  const generationInput: TaskGenerationInput = {
    seed: input.seed,
    sequence: input.sequence,
    now: input.now,
    catalog: input.catalog,
    collections: input.collections,
    recentTemplateIds: input.board.recentTemplateIds,
    oneOffCompleted: input.board.oneOffCompleted,
    completedCount: input.board.completedCount,
  }
  const eligible = getAssignableTaskIds(generationInput)
  const replacements = chooseReplacementTemplates({
    eligible,
    retained,
    recentTemplateIds: input.board.recentTemplateIds,
    seed: input.seed,
    sequence: input.sequence,
    count: retiredSlots.length,
  })

  const active = [...input.board.active] as [TaskInstance, TaskInstance, TaskInstance]
  retiredSlots.forEach((slotIndex, replacementIndex) => {
    active[slotIndex] = createTaskInstance(
      replacements[replacementIndex],
      input.seed,
      input.sequence,
      slotIndex,
      input.now,
    )
  })

  return {
    board: {
      ...input.board,
      active,
      recentTemplateIds: [...input.board.recentTemplateIds, ...replacements].slice(-6),
    },
    nextSequence: incrementSafeCounter(input.sequence),
  }
}

function canSafelyReconcileTaskBoard(board: TaskBoard, catalog: CollectionCatalog): boolean {
  const instanceIds = new Set<string>()
  const groups = new Set<TaskTriggerGroup>()
  for (const task of board.active) {
    const template = TASK_LIBRARY[task.taskId]
    const group = template.triggerGroup
    const reachability = validateTaskInstanceReachability(task, catalog)
    const completed = isTaskCompleted(task)
    const oneOffRecorded = board.oneOffCompleted.includes(task.taskId)
    if (
      instanceIds.has(task.instanceId) ||
      groups.has(group) ||
      !Number.isSafeInteger(task.progress) ||
      task.progress < 0 ||
      !Number.isSafeInteger(task.target) ||
      task.target <= 0 ||
      !Number.isSafeInteger(task.rewardApples) ||
      task.rewardApples < 0 ||
      task.progress > task.target ||
      task.seenKeys.length !== task.progress ||
      new Set(task.seenKeys).size !== task.seenKeys.length ||
      !reachability.ok ||
      (template.oneOff === true && completed !== oneOffRecorded)
    ) {
      return false
    }
    instanceIds.add(task.instanceId)
    groups.add(group)
  }
  const completed = board.active.every(isTaskCompleted)
  if (completed !== (board.completedAt !== null)) return false
  return (
    board.completedAt === null ||
    board.completedAt >= Math.max(...board.active.map((task) => task.assignedAt))
  )
}

/**
 * 存档准备或收藏移除后，只替换仍未完成、且当前已失去签发先决条件的槽位。
 * 已完成任务和仍可达任务保留原对象、进度与奖励快照；畸形任务板留给严格校验拒绝。
 */
export function reconcileTaskBoardAvailability(
  input: ReconcileTaskBoardAvailabilityInput,
): ReconciledTaskBoard {
  if (!canSafelyReconcileTaskBoard(input.board, input.catalog ?? EMPTY_CATALOG)) {
    return { board: input.board, nextSequence: input.sequence }
  }

  const context = createTaskAssignmentContext({
    catalog: input.catalog,
    collections: input.collections,
    oneOffCompleted: input.board.oneOffCompleted,
  })
  const replacementSlots = input.board.active
    .map((task, index) =>
      !isTaskCompleted(task) && !meetsTaskInstanceAssignmentRequirementsInContext(task, context)
        ? index
        : -1,
    )
    .filter((index) => index >= 0)
  if (replacementSlots.length === 0) {
    return { board: input.board, nextSequence: input.sequence }
  }

  const retained = input.board.active.filter((_, index) => !replacementSlots.includes(index))
  const replacements = chooseReplacementTemplates({
    eligible: getAssignableTaskIds({
      catalog: input.catalog,
      collections: input.collections,
      oneOffCompleted: input.board.oneOffCompleted,
    }),
    retained,
    recentTemplateIds: input.board.recentTemplateIds,
    seed: input.seed,
    sequence: input.sequence,
    count: replacementSlots.length,
  })
  const active = [...input.board.active] as [TaskInstance, TaskInstance, TaskInstance]
  replacementSlots.forEach((slotIndex, replacementIndex) => {
    active[slotIndex] = createTaskInstance(
      replacements[replacementIndex],
      input.seed,
      input.sequence,
      slotIndex,
      input.board.active[slotIndex].assignedAt,
    )
  })

  return {
    board: {
      ...input.board,
      active,
      recentTemplateIds: [...input.board.recentTemplateIds, ...replacements].slice(-6),
    },
    nextSequence: incrementSafeCounter(input.sequence),
  }
}

export function getTaskPresentation(taskId: TaskId): TaskPresentation {
  const task = TASK_LIBRARY[taskId]
  return { title: task.title, description: task.description }
}

export function isTaskCompleted(task: TaskInstance): boolean {
  return task.progress >= task.target
}

export function getTaskProgressLabel(task: TaskInstance): string {
  return isTaskCompleted(task) ? '已完成' : `${task.progress} / ${task.target}`
}

/**
 * 完成的任务板在游戏日推进时刷新。调用方只应在 companionDays 确实增加后调用；
 * 未全完成的任务板保留原引用，从而完整继承任务及各自进度。
 */
export function refreshCompletedTaskBoard(
  state: GameState,
  now: number,
  catalog: CollectionCatalog,
): GameState {
  if (state.tasks.completedAt === null || !state.tasks.active.every(isTaskCompleted)) return state

  const generated = generateTaskBoard({
    seed: state.random.seed,
    sequence: state.random.sequences.tasks,
    now,
    catalog,
    collections: state.collections,
    recentTemplateIds: state.tasks.recentTemplateIds,
    oneOffCompleted: state.tasks.oneOffCompleted,
    completedCount: state.tasks.completedCount,
  })

  return {
    ...state,
    tasks: { ...generated.board, completedAt: null },
    random: {
      ...state.random,
      sequences: { ...state.random.sequences, tasks: generated.nextSequence },
    },
  }
}

function roomAreaKey(event: TaskEvent): RoomArea | null {
  return event.type === 'room-visited' ? event.area : null
}

function musicInteractionKey(event: TaskEvent): string | null {
  if (event.type === 'piano-note-played') return `piano:${event.noteId}`
  if (event.type === 'record-player-opened' || event.type === 'collection-player-opened') {
    return `video:${event.bvid}`
  }
  return null
}

function progressKey(taskId: TaskId, event: TaskEvent): string | null {
  switch (taskId) {
    case 'greet-bingo':
      return event.type === 'pet-greeted' ? 'greeted' : null
    case 'open-backpack':
      return event.type === 'pet-menu-opened' ? 'opened' : null
    case 'room-stroll':
      return roomAreaKey(event)
    case 'piano-time':
      return event.type === 'piano-note-played' ? `piano:${event.noteId}` : null
    case 'record-time':
      return event.type === 'record-player-opened' ? `video:${event.bvid}` : null
    case 'two-melodies':
      return musicInteractionKey(event)
    case 'wardrobe-choice':
      return roomAreaKey(event) === 'wardrobe' ? 'wardrobe' : null
    case 'open-memories':
      return event.type === 'collection-wall-opened' ? 'wall' : null
    case 'revisit-two':
      return event.type === 'collection-viewed' ? event.collectionId : null
    case 'remember-postcard':
      return event.type === 'collection-viewed' && event.category === 'postcard'
        ? event.collectionId
        : null
    case 'remember-million':
      return event.type === 'collection-viewed' && event.category === 'million-shot'
        ? event.collectionId
        : null
    case 'remember-first':
      return event.type === 'collection-viewed' && event.category === 'site-first'
        ? event.collectionId
        : null
    case 'stage-test':
      return event.type === 'stage-test-opened' ? 'opened' : null
  }
}

export interface TaskEventApplication {
  state: GameState
  effect: Extract<import('../game/types').GameEffect, { type: 'task-progressed' }> | null
}

/** 同一领域事件只推进第一条匹配任务；游戏日推进后的换板由 reducer 统一完成。 */
export function applyTaskEvent(
  state: GameState,
  event: TaskEvent,
  now: number,
): TaskEventApplication {
  const canProgress = (task: TaskInstance) => {
    if (isTaskCompleted(task)) return false
    const key = progressKey(task.taskId, event)
    return key !== null && !task.seenKeys.includes(key)
  }
  // 衣架访问同时符合通用“房间走走”和专用造型任务；优先结算用户刚点开的专用任务。
  const wardrobeTaskIndex =
    event.type === 'room-visited' && event.area === 'wardrobe'
      ? state.tasks.active.findIndex(
          (task) => task.taskId === 'wardrobe-choice' && canProgress(task),
        )
      : -1
  const taskIndex =
    wardrobeTaskIndex >= 0 ? wardrobeTaskIndex : state.tasks.active.findIndex(canProgress)
  if (taskIndex < 0) return { state, effect: null }

  const task = state.tasks.active[taskIndex]
  const key = progressKey(task.taskId, event)
  if (key === null) return { state, effect: null }
  const nextTask: TaskInstance = {
    ...task,
    progress: Math.min(task.target, task.progress + 1),
    seenKeys: [...task.seenKeys, key],
  }
  const completed = isTaskCompleted(nextTask)
  const applesAwarded = completed
    ? Math.min(nextTask.rewardApples, MAX_APPLES - state.economy.apples)
    : 0
  const active = [...state.tasks.active] as [TaskInstance, TaskInstance, TaskInstance]
  active[taskIndex] = nextTask
  const completedCount = completed
    ? incrementSafeCounter(state.tasks.completedCount)
    : state.tasks.completedCount
  let oneOffCompleted = state.tasks.oneOffCompleted
  if (completed && TASK_LIBRARY[nextTask.taskId].oneOff) {
    oneOffCompleted = [...new Set([...oneOffCompleted, nextTask.taskId])]
  }

  const boardCompleted = active.every(isTaskCompleted)
  const nextTasks: TaskBoard = {
    ...state.tasks,
    active,
    completedCount,
    oneOffCompleted,
    completedAt: boardCompleted ? now : null,
  }

  return {
    state: {
      ...state,
      economy: { apples: state.economy.apples + applesAwarded },
      tasks: nextTasks,
      statistics: {
        ...state.statistics,
        applesEarned: saturatingAddSafeCounter(state.statistics.applesEarned, applesAwarded),
      },
    },
    effect: {
      type: 'task-progressed',
      instanceId: task.instanceId,
      taskId: task.taskId,
      progress: nextTask.progress,
      target: nextTask.target,
      completed,
      applesAwarded,
    },
  }
}
