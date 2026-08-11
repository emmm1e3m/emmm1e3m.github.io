import { isValidLocalDateKey } from '@/domain'

export const STREAM_PLAYER_MESSAGE_TYPE = 'travelling-bingo:stream-player'
export const STREAM_PLAYER_MESSAGE_VERSION = 1
export const STREAM_PLAYER_HISTORY_KEY = 'travelling-bingo:stream-player-history:v1'

export type StreamPlayerOutcome = 'completed' | 'stopped'
export type StoredStreamSessionOutcome = StreamPlayerOutcome | 'running'

export interface StoredStreamSession {
  readonly sessionId: string
  readonly startedAt: number
  readonly endedAt: number
  readonly roundsCompleted: number
  readonly outcome: StoredStreamSessionOutcome
}

interface StreamPlayerMessageBase {
  readonly type: typeof STREAM_PLAYER_MESSAGE_TYPE
  readonly version: typeof STREAM_PLAYER_MESSAGE_VERSION
  readonly sessionId: string
}

export type StreamPlayerEvent =
  | (StreamPlayerMessageBase & {
      readonly event: 'started'
      readonly dateKey: string
    })
  | (StreamPlayerMessageBase & {
      readonly event: 'ended'
      readonly outcome: StreamPlayerOutcome
    })

export type StreamPlayerCommand = StreamPlayerMessageBase & { readonly event: 'stop' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isFiniteTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  )
}

function hasValidBase(value: Record<string, unknown>) {
  return (
    value.type === STREAM_PLAYER_MESSAGE_TYPE &&
    value.version === STREAM_PLAYER_MESSAGE_VERSION &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0
  )
}

export function parseStreamPlayerEvent(value: unknown): StreamPlayerEvent | null {
  if (!isRecord(value) || !hasValidBase(value)) return null

  if (
    value.event === 'started' &&
    typeof value.dateKey === 'string' &&
    isValidLocalDateKey(value.dateKey)
  ) {
    return value as unknown as StreamPlayerEvent
  }

  if (value.event === 'ended' && (value.outcome === 'completed' || value.outcome === 'stopped')) {
    return value as unknown as StreamPlayerEvent
  }

  return null
}

export function createStreamPlayerStopCommand(sessionId: string): StreamPlayerCommand {
  return {
    type: STREAM_PLAYER_MESSAGE_TYPE,
    version: STREAM_PLAYER_MESSAGE_VERSION,
    sessionId,
    event: 'stop',
  }
}

export function parseStoredStreamHistory(value: string | null): StoredStreamSession[] {
  if (value === null) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is StoredStreamSession => {
        if (!isRecord(item)) return false
        return (
          typeof item.sessionId === 'string' &&
          item.sessionId.length > 0 &&
          isFiniteTimestamp(item.startedAt) &&
          isFiniteTimestamp(item.endedAt) &&
          item.endedAt >= item.startedAt &&
          isSafeNonNegativeInteger(item.roundsCompleted) &&
          (item.outcome === 'completed' || item.outcome === 'stopped' || item.outcome === 'running')
        )
      })
      .slice(0, 10)
  } catch {
    return []
  }
}

export function storeStreamSession(
  session: StoredStreamSession,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
) {
  let target = storage
  if (target === undefined) {
    try {
      target = globalThis.localStorage
    } catch {
      return false
    }
  }

  let existing: StoredStreamSession[]
  try {
    existing = parseStoredStreamHistory(target.getItem(STREAM_PLAYER_HISTORY_KEY)).filter(
      (item) => item.sessionId !== session.sessionId,
    )
  } catch {
    return false
  }

  try {
    target.setItem(STREAM_PLAYER_HISTORY_KEY, JSON.stringify([session, ...existing].slice(0, 10)))
    return true
  } catch {
    return false
  }
}
