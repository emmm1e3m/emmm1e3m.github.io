import {
  PIANO_NOTE_IDS,
  PIANO_OCTAVES as SUPPORTED_PIANO_OCTAVES,
  type PianoNoteId,
  type PianoOctave,
} from '../domain/game/constants'

const WHITE_INDEX_BY_PITCH = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6] as const
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10])

export type { PianoNoteId } from '../domain/game/constants'

/** 房间里的琴键从高音到低音排列。 */
export const PIANO_OCTAVES: readonly PianoOctave[] = [...SUPPORTED_PIANO_OCTAVES].reverse()

const WHITE_KEY_BINDINGS: Record<PianoOctave, readonly string[]> = {
  3: ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  4: ['a', 's', 'd', 'f', 'g', 'h', 'j'],
  5: ['q', 'w', 'e', 'r', 't', 'y', 'u'],
  6: ['1', '2', '3', '4', '5', '6', '7'],
}

export interface PianoNote {
  id: PianoNoteId
  midi: number
  frequency: number
  key: string | null
  black: boolean
  octave: PianoOctave
  whiteIndex?: number
  boundaryIndex?: number
}

/** C3 到 B6，四个完整八度，共 48 个半音；电脑键盘只映射白键。 */
export const PIANO_NOTES: readonly PianoNote[] = PIANO_NOTE_IDS.map((id, index) => {
  const midi = 48 + index
  const pitch = index % 12
  const octave = SUPPORTED_PIANO_OCTAVES[Math.floor(index / 12)]
  const whiteIndex = WHITE_INDEX_BY_PITCH[pitch]
  const black = BLACK_PITCHES.has(pitch)

  return {
    id,
    midi,
    frequency: 440 * 2 ** ((midi - 69) / 12),
    key: black ? null : WHITE_KEY_BINDINGS[octave][whiteIndex],
    black,
    octave,
    ...(black ? { boundaryIndex: whiteIndex } : { whiteIndex }),
  }
})
