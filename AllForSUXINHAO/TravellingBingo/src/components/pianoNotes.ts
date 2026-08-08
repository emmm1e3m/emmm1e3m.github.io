const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
const KEY_BINDINGS = [
  'z',
  's',
  'x',
  'd',
  'c',
  'v',
  'g',
  'b',
  'h',
  'n',
  'j',
  'm',
  'q',
  '2',
  'w',
  '3',
  'e',
  'r',
  '5',
  't',
  '6',
  'y',
  '7',
  'u',
] as const

export interface PianoNote {
  id: string
  midi: number
  frequency: number
  key: string
  black: boolean
  whiteIndex?: number
  boundaryIndex?: number
}

/** C4 到 B5，严格两个完整八度，共 24 个半音。 */
export const PIANO_NOTES: readonly PianoNote[] = Array.from({ length: 24 }, (_, index) => {
  const midi = 60 + index
  const pitch = index % 12
  const octave = 4 + Math.floor(index / 12)
  const whiteBeforePitch = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6][pitch]
  const black = [1, 3, 6, 8, 10].includes(pitch)
  const octaveWhiteOffset = Math.floor(index / 12) * 7
  const whiteIndex = octaveWhiteOffset + whiteBeforePitch
  return {
    id: `${NOTE_NAMES[pitch]}${octave}`,
    midi,
    frequency: 440 * 2 ** ((midi - 69) / 12),
    key: KEY_BINDINGS[index],
    black,
    ...(black ? { boundaryIndex: whiteIndex + 1 } : { whiteIndex }),
  }
})
