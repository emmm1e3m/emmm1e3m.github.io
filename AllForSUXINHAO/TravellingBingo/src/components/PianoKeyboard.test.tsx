import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PianoKeyboard } from './PianoKeyboard'

interface FakeOscillator {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

let initialState: AudioContextState
let resumeAudio: () => Promise<void>
let contexts: FakeAudioContext[]

class FakeAudioContext {
  state = initialState
  currentTime = 0
  destination = {} as AudioDestinationNode
  oscillators: FakeOscillator[] = []

  constructor() {
    contexts.push(this)
  }

  resume = vi.fn(() => resumeAudio())
  close = vi.fn(async () => undefined)
  createOscillator = vi.fn(() => {
    const fake = {
      start: vi.fn(),
      stop: vi.fn(),
    }
    this.oscillators.push(fake)
    return {
      type: 'triangle',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: fake.start,
      stop: fake.stop,
    } as unknown as OscillatorNode
  })

  createGain() {
    return {
      context: this,
      gain: {
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    } as unknown as GainNode
  }
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

  it('提供 C4 到 B5 的 24 个琴键，并在真实发声后报告音符', async () => {
    const onNote = vi.fn()

    const { unmount } = render(<PianoKeyboard onNote={onNote} />)
    expect(screen.getAllByRole('button')).toHaveLength(24)
    expect(screen.getByRole('button', { name: /C4/u })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /B5/u })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('C4'))
    fireEvent.keyUp(window, { key: 'z' })

    const context = contexts[0]
    expect(context.oscillators[0]?.stop).toHaveBeenCalledOnce()
    unmount()

    // 即使 keyup 已把 voice 从映射中移除，组件仍必须关闭自己创建的上下文。
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
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('C4'))
    const context = contexts[0]
    const firstOscillator = context.oscillators[0]

    screen.getByTestId('piano-host').setAttribute('inert', '')
    fireEvent.keyDown(window, { key: 'x' })
    expect(context.createOscillator).toHaveBeenCalledTimes(1)
    expect(onNote).toHaveBeenCalledTimes(1)

    fireEvent.keyUp(window, { key: 'z' })
    expect(firstOscillator?.stop).toHaveBeenCalledOnce()
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
