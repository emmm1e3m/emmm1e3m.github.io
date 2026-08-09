import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PianoKeyboard } from './PianoKeyboard'
import { PIANO_NOTES } from './pianoNotes'

interface FakeOscillator {
  type: OscillatorType
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface FakeGain {
  context: FakeAudioContext
  gain: {
    cancelScheduledValues: ReturnType<typeof vi.fn>
    setTargetAtTime: ReturnType<typeof vi.fn>
    setValueAtTime: ReturnType<typeof vi.fn>
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
}

let initialState: AudioContextState
let resumeAudio: () => Promise<void>
let contexts: FakeAudioContext[]

class FakeAudioContext {
  state = initialState
  currentTime = 0
  destination = {} as AudioDestinationNode
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []

  constructor() {
    contexts.push(this)
  }

  resume = vi.fn(() => resumeAudio())
  close = vi.fn(async () => undefined)
  createOscillator = vi.fn(() => {
    const oscillator: FakeOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    this.oscillators.push(oscillator)
    return oscillator as unknown as OscillatorNode
  })
  createGain = vi.fn(() => {
    const gain: FakeGain = {
      context: this,
      gain: {
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
    this.gains.push(gain)
    return gain as unknown as GainNode
  })
}

describe('PianoKeyboard', () => {
  const originalAudioContext = globalThis.AudioContext

  beforeEach(() => {
    initialState = 'running'
    resumeAudio = async () => undefined
    contexts = []
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    })
  })

  it('从高到低渲染四个完整八度和 48 个琴键', () => {
    render(<PianoKeyboard />)

    expect(screen.getAllByRole('button')).toHaveLength(48)
    const octaveGroups = screen.getAllByRole('group')
    expect(octaveGroups).toHaveLength(4)
    expect(octaveGroups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'C6 到 B6 琴键',
      'C5 到 B5 琴键',
      'C4 到 B4 琴键',
      'C3 到 B3 琴键',
    ])
    for (const group of octaveGroups) expect(within(group).getAllByRole('button')).toHaveLength(12)

    expect(screen.getByRole('button', { name: 'C6，键盘 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B6，键盘 7' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'C5，键盘 Q' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'C4，键盘 A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'C3，键盘 Z' })).toBeInTheDocument()
  })

  it('只给 28 个白键分配唯一电脑按键，黑键没有键盘映射', () => {
    const onNote = vi.fn()
    const { container } = render(<PianoKeyboard onNote={onNote} />)
    const whiteNotes = PIANO_NOTES.filter((note) => !note.black)
    const blackNotes = PIANO_NOTES.filter((note) => note.black)

    expect(whiteNotes).toHaveLength(28)
    expect(blackNotes).toHaveLength(20)
    expect(whiteNotes.every((note) => note.key !== null)).toBe(true)
    expect(new Set(whiteNotes.map((note) => note.key))).toHaveLength(28)
    expect(blackNotes.every((note) => note.key === null)).toBe(true)
    expect(container.querySelectorAll('.piano-key[aria-label*="键盘"]')).toHaveLength(28)
    expect(screen.getByRole('button', { name: 'C#5' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '8' })
    expect(contexts).toHaveLength(0)
    expect(onNote).not.toHaveBeenCalled()
  })

  it('把每排黑键放在相邻白键的正确边界上', () => {
    for (const octave of [3, 4, 5, 6] as const) {
      const boundaries = PIANO_NOTES.filter((note) => note.octave === octave && note.black).map(
        (note) => note.boundaryIndex,
      )
      expect(boundaries).toEqual([1, 2, 4, 5, 6])
    }
  })

  it('显示指定曲谱提示，且不出现以八度数量描述组件的元文案', () => {
    render(<PianoKeyboard />)

    expect(
      screen.getByText('C6 B5 G5 E5 G5 C6 B5 G5 E5 G5 E5，C6 B5 G5 E5 G5 C6 D6 C6 D6 E6 E6'),
    ).toBeInTheDocument()
    expect(screen.queryByText('饼狗的小钢琴')).not.toBeInTheDocument()
    expect(screen.queryByText(/[两三四]八度/u)).not.toBeInTheDocument()
  })

  it('琴体和四排琴键都裁切溢出，不产生横向或纵向滚动条', () => {
    const { container } = render(<PianoKeyboard />)
    const clippedElements = container.querySelectorAll(
      '.piano, .piano__rows, .piano__row, .piano__keys',
    )

    expect(clippedElements.length).toBeGreaterThan(0)
    for (const element of clippedElements) {
      const style = globalThis.getComputedStyle(element)
      expect(style.overflowX || style.overflow).toBe('hidden')
      expect(style.overflowY || style.overflow).toBe('hidden')
    }
  })

  it('用三组泛音和短起音衰减包络发声，并在 keyup 后停止全部音源', async () => {
    const onNote = vi.fn()
    const { unmount } = render(<PianoKeyboard onNote={onNote} />)

    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('C3'))

    const context = contexts[0]
    const c3 = PIANO_NOTES.find((note) => note.id === 'C3')
    expect(context.oscillators).toHaveLength(3)
    expect(context.oscillators.map((oscillator) => oscillator.type)).toEqual([
      'triangle',
      'sine',
      'sine',
    ])
    expect(context.oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(c3?.frequency, 0)
    expect(context.oscillators[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(
      (c3?.frequency ?? 0) * 2,
      0,
    )
    expect(context.oscillators[2]?.frequency.setValueAtTime).toHaveBeenCalledWith(
      (c3?.frequency ?? 0) * 3,
      0,
    )
    expect(context.gains).toHaveLength(4)

    const envelope = context.gains[0]
    expect(envelope?.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 0)
    expect(envelope?.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.33, 0.008)
    expect(envelope?.gain.exponentialRampToValueAtTime).toHaveBeenNthCalledWith(2, 0.1125, 0.09)
    expect(envelope?.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 0.09, 0.32)
    expect(
      context.gains.slice(1).map((gain) => gain.gain.setValueAtTime.mock.calls[0]?.[0]),
    ).toEqual([0.72, 0.2, 0.08])

    fireEvent.keyUp(window, { key: 'z' })
    for (const oscillator of context.oscillators) expect(oscillator.stop).toHaveBeenCalledOnce()
    expect(envelope?.gain.cancelScheduledValues).toHaveBeenCalledOnce()
    unmount()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('卸载时停止仍在发声的全部泛音并关闭音频上下文', async () => {
    const { unmount } = render(<PianoKeyboard />)
    fireEvent.keyDown(window, { key: 'q' })
    await waitFor(() => expect(contexts[0]?.oscillators).toHaveLength(3))

    const context = contexts[0]
    unmount()

    for (const oscillator of context.oscillators) expect(oscillator.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('在 resume 等待期间卸载后不再创建 oscillator 或报告音符', async () => {
    initialState = 'suspended'
    let resolveResume: (() => void) | undefined
    resumeAudio = () =>
      new Promise<void>((resolve) => {
        resolveResume = resolve
      })
    const onNote = vi.fn()

    const { unmount } = render(<PianoKeyboard onNote={onNote} />)
    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(contexts[0]?.resume).toHaveBeenCalledOnce())

    const context = contexts[0]
    unmount()
    expect(context.close).toHaveBeenCalledOnce()

    await act(async () => {
      resolveResume?.()
      await Promise.resolve()
    })

    expect(context.createOscillator).not.toHaveBeenCalled()
    expect(context.createGain).not.toHaveBeenCalled()
    expect(onNote).not.toHaveBeenCalled()
  })

  it('进入 inert 区域后全局按键不再发新音，但 keyup 仍停止旧音', async () => {
    const onNote = vi.fn()
    const { unmount } = render(
      <div data-testid="piano-host">
        <PianoKeyboard onNote={onNote} />
      </div>,
    )

    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('C3'))
    const context = contexts[0]

    screen.getByTestId('piano-host').setAttribute('inert', '')
    fireEvent.keyDown(window, { key: 'x' })
    expect(context.createOscillator).toHaveBeenCalledTimes(3)
    expect(onNote).toHaveBeenCalledTimes(1)

    fireEvent.keyUp(window, { key: 'z' })
    for (const oscillator of context.oscillators) expect(oscillator.stop).toHaveBeenCalledOnce()
    unmount()
  })

  it('resume 等待期间进入 inert 区域后不再完成发声', async () => {
    initialState = 'suspended'
    let resolveResume: (() => void) | undefined
    resumeAudio = () =>
      new Promise<void>((resolve) => {
        resolveResume = resolve
      })
    const onNote = vi.fn()
    const { unmount } = render(
      <div data-testid="pending-piano-host">
        <PianoKeyboard onNote={onNote} />
      </div>,
    )

    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(contexts[0]?.resume).toHaveBeenCalledOnce())
    screen.getByTestId('pending-piano-host').setAttribute('inert', '')

    await act(async () => {
      resolveResume?.()
      await Promise.resolve()
    })

    expect(contexts[0]?.createOscillator).not.toHaveBeenCalled()
    expect(onNote).not.toHaveBeenCalled()
    unmount()
  })

  it('琴体隐藏或断开文档后忽略全局按键', () => {
    const onNote = vi.fn()
    const { container, unmount } = render(
      <div data-testid="piano-host">
        <PianoKeyboard onNote={onNote} />
      </div>,
    )
    const host = screen.getByTestId('piano-host')

    host.hidden = true
    fireEvent.keyDown(window, { key: 'z' })
    expect(contexts).toHaveLength(0)

    host.hidden = false
    container.remove()
    fireEvent.keyDown(window, { key: 'z' })
    expect(contexts).toHaveLength(0)
    expect(onNote).not.toHaveBeenCalled()

    unmount()
  })
})
