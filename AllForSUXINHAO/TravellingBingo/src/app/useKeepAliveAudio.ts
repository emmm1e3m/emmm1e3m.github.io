import { useCallback, useEffect, useRef, useState } from 'react'

export type KeepAliveAudioFactory = () => AudioContext

interface KeepAliveAudioNodes {
  context: AudioContext
  gain: GainNode
  oscillator: OscillatorNode
}

function browserAudioFactory(): KeepAliveAudioFactory | null {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
  }
  const AudioContextConstructor = scope.AudioContext ?? scope.webkitAudioContext
  return AudioContextConstructor ? () => new AudioContextConstructor() : null
}

/**
 * 低音量 10Hz 保活音频。首次创建和 resume 只能由调用方在明确用户手势中触发，
 * 节点会在 App 生命周期内保持开启并复用。
 */
export function useKeepAliveAudio(factory?: KeepAliveAudioFactory) {
  const [initialFactory] = useState<KeepAliveAudioFactory | null>(() =>
    factory ? factory : browserAudioFactory(),
  )
  const factoryRef = useRef<KeepAliveAudioFactory | null>(initialFactory)
  const nodesRef = useRef<KeepAliveAudioNodes | null>(null)
  const activationPendingRef = useRef(false)

  useEffect(() => {
    factoryRef.current = factory ?? browserAudioFactory()
  }, [factory])

  const activateFromJourneyGesture = useCallback(async () => {
    if (activationPendingRef.current) return
    activationPendingRef.current = true
    try {
      let nodes = nodesRef.current
      if (!nodes) {
        const createContext = factoryRef.current
        if (!createContext) return

        const context = createContext()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.setValueAtTime(10, context.currentTime)
        gain.gain.setValueAtTime(0.01, context.currentTime)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        nodes = { context, gain, oscillator }
        nodesRef.current = nodes
      }

      nodes.gain.gain.setValueAtTime(0.01, nodes.context.currentTime)
      await nodes.context.resume()
    } catch {
      // 浏览器拒绝后台音频时不阻断存档入口；下次明确手势会继续尝试。
    } finally {
      activationPendingRef.current = false
    }
  }, [])

  useEffect(() => {
    return () => {
      const nodes = nodesRef.current
      nodesRef.current = null
      if (!nodes) return
      try {
        nodes.oscillator.stop()
      } catch {
        // 已停止的节点无需再次处理。
      }
      nodes.oscillator.disconnect()
      nodes.gain.disconnect()
      void nodes.context.close().catch(() => undefined)
    }
  }, [])

  return { activateFromJourneyGesture }
}
