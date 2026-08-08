import { MAX_APPLES } from '../game/constants'
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
} from '../game/types'
import { createRandomCursor, hashSeed, randomInteger, type RandomCursor } from '../rewards/prng'

export interface TaskPresentation {
  title: string
  description: string
}

export interface TaskTemplate extends TaskPresentation {
  id: TaskId
  triggerGroup: TaskTriggerGroup
  target: number
  rewardApples: number
  oneOff?: boolean
}

export const TASK_LIBRARY: Readonly<Record<TaskId, TaskTemplate>> = {
  'greet-bingo': {
    id: 'greet-bingo',
    triggerGroup: 'pet',
    title: '和饼狗打个招呼',
    description: '点一点饼狗',
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
  },
  'revisit-two': {
    id: 'revisit-two',
    triggerGroup: 'collection',
    title: '重温两份回忆',
    description: '查看两份不同的收藏',
    target: 2,
    rewardApples: 2,
  },
  'remember-postcard': {
    id: 'remember-postcard',
    triggerGroup: 'collection',
    title: '重看一张明信片',
    description: '查看一份明信片收藏',
    target: 1,
    rewardApples: 1,
  },
  'remember-million': {
    id: 'remember-million',
    triggerGroup: 'collection',
    title: '重看一次百万瞬间',
    description: '查看一份百万直拍收藏',
    target: 1,
    rewardApples: 1,
  },
  'remember-first': {
    id: 'remember-first',
    triggerGroup: 'collection',
    title: '重看全站第一',
    description: '查看一份全站第一收藏',
    target: 1,
    rewardApples: 2,
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

const EMPTY_CATALOG: CollectionCatalog = {
  postcard: [],
  'million-shot': [],
  'site-first': [],
  siteFirstChronology: [],
}

interface TaskGenerationInput {
  seed: string
  sequence: number
  now: number
  catalog?: CollectionCatalog
  collections?: Readonly<Record<string, unknown>>
  recentTemplateIds?: readonly TaskId[]
  oneOffCompleted?: readonly TaskId[]
  completedCount?: number
}

export interface GeneratedTaskBoard {
  board: TaskBoard
  nextSequence: number
}

function categoryHasCollection(
  category: CollectibleCategory,
  catalog: CollectionCatalog,
  owned: ReadonlySet<string>,
): boolean {
  return catalog[category].some((id) => owned.has(id))
}

function eligibleTaskIds(input: TaskGenerationInput): TaskId[] {
  const catalog = input.catalog ?? EMPTY_CATALOG
  const owned = new Set(Object.keys(input.collections ?? {}))
  const completedOneOff = new Set(input.oneOffCompleted ?? [])
  const hasAnyCollection = owned.size > 0

  return TASK_IDS.filter((taskId) => {
    if (TASK_LIBRARY[taskId].oneOff && completedOneOff.has(taskId)) return false
    if (taskId === 'open-memories') return hasAnyCollection
    if (taskId === 'revisit-two') return owned.size >= 2
    if (taskId === 'remember-postcard') {
      return categoryHasCollection('postcard', catalog, owned)
    }
    if (taskId === 'remember-million') {
      return categoryHasCollection('million-shot', catalog, owned)
    }
    if (taskId === 'remember-first') {
      return categoryHasCollection('site-first', catalog, owned)
    }
    return true
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

function chooseTemplates(input: TaskGenerationInput): TaskId[] {
  const eligible = eligibleTaskIds(input)
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

export function generateTaskBoard(input: TaskGenerationInput): GeneratedTaskBoard {
  const selected = chooseTemplates(input)
  const active = selected.map((taskId, index): TaskInstance => {
    const template = TASK_LIBRARY[taskId]
    return {
      instanceId: `task-${input.sequence.toString(36)}-${index}-${hashSeed(`${input.seed}:${taskId}:${input.sequence}`).toString(36)}`,
      taskId,
      assignedAt: input.now,
      progress: 0,
      target: template.target,
      rewardApples: template.rewardApples,
      seenKeys: [],
    }
  }) as [TaskInstance, TaskInstance, TaskInstance]

  return {
    board: {
      active,
      completedCount: input.completedCount ?? 0,
      recentTemplateIds: [...(input.recentTemplateIds ?? []), ...selected].slice(-6),
      oneOffCompleted: [...(input.oneOffCompleted ?? [])],
    },
    nextSequence: input.sequence + 1,
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

/**
 * 同一领域事件只检查到第一条可推进任务；整板刷新后立即返回，旧事件不会落到新板。
 */
export function applyTaskEvent(
  state: GameState,
  event: TaskEvent,
  now: number,
  catalog: CollectionCatalog,
): TaskEventApplication {
  const taskIndex = state.tasks.active.findIndex((task) => {
    if (isTaskCompleted(task)) return false
    const key = progressKey(task.taskId, event)
    return key !== null && !task.seenKeys.includes(key)
  })
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
  const completedCount = state.tasks.completedCount + (completed ? 1 : 0)
  let oneOffCompleted = state.tasks.oneOffCompleted
  if (completed && TASK_LIBRARY[nextTask.taskId].oneOff) {
    oneOffCompleted = [...new Set([...oneOffCompleted, nextTask.taskId])]
  }

  const boardCompleted = active.every(isTaskCompleted)
  let nextTasks: TaskBoard = {
    ...state.tasks,
    active,
    completedCount,
    oneOffCompleted,
  }
  let nextTaskSequence = state.random.sequences.tasks
  if (boardCompleted) {
    const generated = generateTaskBoard({
      seed: state.random.seed,
      sequence: state.random.sequences.tasks,
      now,
      catalog,
      collections: state.collections,
      recentTemplateIds: state.tasks.recentTemplateIds,
      oneOffCompleted,
      completedCount,
    })
    nextTasks = generated.board
    nextTaskSequence = generated.nextSequence
  }

  return {
    state: {
      ...state,
      economy: { apples: state.economy.apples + applesAwarded },
      tasks: nextTasks,
      statistics: {
        ...state.statistics,
        applesEarned: state.statistics.applesEarned + applesAwarded,
      },
      random: {
        ...state.random,
        sequences: { ...state.random.sequences, tasks: nextTaskSequence },
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
      boardRefreshed: boardCompleted,
    },
  }
}
