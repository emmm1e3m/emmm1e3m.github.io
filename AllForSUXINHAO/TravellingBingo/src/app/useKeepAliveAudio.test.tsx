import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { useKeepAliveAudio, type KeepAliveAudioFactory } from './useKeepAliveAudio'

function createAudioHarness() {
  const frequency = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => {
      frequency.value = value
    }),
  }
  const oscillator = {
    frequency,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const gainParam = {
    value: 0,
    setValueAtTime: vi.fn((value: number) => {
      gainParam.value = value
    }),
  }
  const gain = {
    gain: gainParam,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    destination: {},
    onstatechange: null as (() => void) | null,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn(async () => {
      context.state = 'running'
      context.onstatechange?.()
    }),
    suspend: vi.fn(async () => {
      context.state = 'suspended'
      context.onstatechange?.()
    }),
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
  }
  const factory = vi.fn(() => context as unknown as AudioContext)
  return { context, factory, gain, oscillator }
}

function Harness({ factory }: { factory: KeepAliveAudioFactory }) {
  const audio = useKeepAliveAudio(factory)
  return (
    <main>
      <button type="button" onClick={audio.activateFromJourneyGesture}>
        开始旅程
      </button>
    </main>
  )
}

describe('App 保活音频', () => {
  it('只在旅程手势中创建 10Hz/0.01 节点并始终复用同一实例', async () => {
    const audio = createAudioHarness()
    render(<Harness factory={audio.factory} />)

    expect(audio.factory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))

    await waitFor(() => expect(audio.context.resume).toHaveBeenCalledOnce())
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.oscillator.frequency.value).toBe(10)
    expect(audio.gain.gain.value).toBe(0.01)
    expect(audio.oscillator.start).toHaveBeenCalledOnce()
    expect(audio.context.resume).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))
    expect(audio.factory).toHaveBeenCalledOnce()
    await waitFor(() => expect(audio.context.resume).toHaveBeenCalledTimes(2))
    expect(audio.context.suspend).not.toHaveBeenCalled()
  })

  it('卸载时停止并断开节点，关闭同一个 AudioContext', async () => {
    const audio = createAudioHarness()
    const { unmount } = render(<Harness factory={audio.factory} />)
    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))
    await waitFor(() => expect(audio.context.resume).toHaveBeenCalledOnce())

    unmount()

    expect(audio.oscillator.stop).toHaveBeenCalledOnce()
    expect(audio.oscillator.disconnect).toHaveBeenCalledOnce()
    expect(audio.gain.disconnect).toHaveBeenCalledOnce()
    expect(audio.context.close).toHaveBeenCalledOnce()
  })

  it('创建失败不会把异常抛到游戏流程', async () => {
    const factory = vi.fn(() => {
      throw new Error('blocked')
    })
    render(<Harness factory={factory} />)

    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))

    await waitFor(() => expect(factory).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: '开始旅程' })).toBeEnabled()
  })
})
