const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const WHITE_INDEX_BY_PITCH = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6] as const
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10])

export const PIANO_OCTAVES = [4, 5, 6] as const

type PianoOctave = (typeof PIANO_OCTAVES)[number]
type PianoNoteName = (typeof NOTE_NAMES)[number]

export type PianoNoteId = `${PianoNoteName}${PianoOctave}`

const WHITE_KEY_BINDINGS: Record<PianoOctave, readonly string[]> = {
  4: ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
  5: ['a', 's', 'd', 'f', 'g', 'h', 'j'],
  6: ['q', 'w', 'e', 'r', 't', 'y', 'u'],
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

/** C4 到 B6，三个完整八度，共 36 个半音；电脑键盘只映射白键。 */
export const PIANO_NOTES: readonly PianoNote[] = Array.from({ length: 36 }, (_, index) => {
  const midi = 60 + index
  const pitch = index % 12
  const octave = (4 + Math.floor(index / 12)) as PianoOctave
  const whiteIndex = WHITE_INDEX_BY_PITCH[pitch]
  const black = BLACK_PITCHES.has(pitch)

  return {
    id: `${NOTE_NAMES[pitch]}${octave}` as PianoNoteId,
    midi,
    frequency: 440 * 2 ** ((midi - 69) / 12),
    key: black ? null : WHITE_KEY_BINDINGS[octave][whiteIndex],
    black,
    octave,
    ...(black ? { boundaryIndex: whiteIndex } : { whiteIndex }),
  }
})
