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
      <output data-testid="enabled">{String(audio.enabled)}</output>
      <output data-testid="status">{audio.status}</output>
      <button type="button" onClick={audio.activateFromJourneyGesture}>
        开始旅程
      </button>
      <button type="button" onClick={audio.toggle}>
        切换保活音频
      </button>
    </main>
  )
}

describe('App 保活音频', () => {
  it('只在旅程手势中创建一次 10Hz/0.01 节点并在开关间复用', async () => {
    const audio = createAudioHarness()
    render(<Harness factory={audio.factory} />)

    expect(screen.getByTestId('status')).toHaveTextContent('idle')
    expect(audio.factory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('running'))
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.oscillator.frequency.value).toBe(10)
    expect(audio.gain.gain.value).toBe(0.01)
    expect(audio.oscillator.start).toHaveBeenCalledOnce()
    expect(audio.context.resume).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.context.resume).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '切换保活音频' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('suspended'))
    expect(screen.getByTestId('enabled')).toHaveTextContent('false')
    expect(audio.gain.gain.value).toBe(0)
    expect(audio.context.suspend).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))
    expect(audio.context.resume).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '切换保活音频' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('running'))
    expect(audio.factory).toHaveBeenCalledOnce()
    expect(audio.context.resume).toHaveBeenCalledTimes(2)
  })

  it('卸载时停止并断开节点，关闭同一个 AudioContext', async () => {
    const audio = createAudioHarness()
    const { unmount } = render(<Harness factory={audio.factory} />)
    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('running'))

    unmount()

    expect(audio.oscillator.stop).toHaveBeenCalledOnce()
    expect(audio.oscillator.disconnect).toHaveBeenCalledOnce()
    expect(audio.gain.disconnect).toHaveBeenCalledOnce()
    expect(audio.context.close).toHaveBeenCalledOnce()
  })

  it('创建失败只报告 error，不把异常抛到游戏流程', async () => {
    const factory = vi.fn(() => {
      throw new Error('blocked')
    })
    render(<Harness factory={factory} />)

    fireEvent.click(screen.getByRole('button', { name: '开始旅程' }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
    expect(screen.getByTestId('enabled')).toHaveTextContent('false')
  })
})
