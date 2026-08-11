import {
  STREAM_PLAYER_MESSAGE_TYPE,
  STREAM_PLAYER_MESSAGE_VERSION,
  type StreamPlayerCommand,
  type StreamPlayerEvent,
} from '@/features/reality/stream/popupProtocol'

export {
  STREAM_PLAYER_MESSAGE_TYPE,
  STREAM_PLAYER_MESSAGE_VERSION,
  type StreamPlayerCommand,
  type StreamPlayerEvent,
} from '@/features/reality/stream/popupProtocol'

export type StreamPlayerEventPayload =
  | { readonly event: 'started' }
  | {
      readonly event: 'ended'
      readonly outcome: 'completed' | 'stopped'
    }

export function createStreamPlayerEvent(
  sessionId: string,
  event: StreamPlayerEventPayload,
): StreamPlayerEvent {
  return {
    type: STREAM_PLAYER_MESSAGE_TYPE,
    version: STREAM_PLAYER_MESSAGE_VERSION,
    sessionId,
    ...event,
  } as StreamPlayerEvent
}

export function isStreamPlayerStopCommand(
  value: unknown,
  sessionId: string,
): value is StreamPlayerCommand {
  if (typeof value !== 'object' || value === null) return false
  const command = value as Partial<StreamPlayerCommand>
  return (
    command.type === STREAM_PLAYER_MESSAGE_TYPE &&
    command.version === STREAM_PLAYER_MESSAGE_VERSION &&
    command.sessionId === sessionId &&
    command.event === 'stop'
  )
}
