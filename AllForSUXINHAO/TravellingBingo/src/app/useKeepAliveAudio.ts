import { useCallback, useEffect, useRef, useState } from 'react'

export type KeepAliveAudioStatus =
  'idle' | 'starting' | 'running' | 'suspended' | 'unavailable' | 'error'

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
 * 低音量 10Hz 保活音频。首次创建和 resume 只能由调用方在明确用户手势中触发；
 * 节点在 App 生命周期内复用，关闭开关只 suspend，不重复创建振荡器。
 */
export function useKeepAliveAudio(factory?: KeepAliveAudioFactory) {
  const [initialFactory] = useState<KeepAliveAudioFactory | null>(() =>
    factory ? factory : browserAudioFactory(),
  )
  const factoryRef = useRef<KeepAliveAudioFactory | null>(initialFactory)
  const nodesRef = useRef<KeepAliveAudioNodes | null>(null)
  const enabledRef = useRef(false)
  const userDisabledRef = useRef(false)
  const mountedRef = useRef(true)
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<KeepAliveAudioStatus>(() =>
    initialFactory ? 'idle' : 'unavailable',
  )

  useEffect(() => {
    factoryRef.current = factory ?? browserAudioFactory()
    if (!factoryRef.current && !nodesRef.current) setStatus('unavailable')
  }, [factory])

  const syncStatus = useCallback((context: AudioContext) => {
    if (!mountedRef.current) return
    if (!enabledRef.current) {
      setStatus('suspended')
      return
    }
    setStatus(context.state === 'running' ? 'running' : 'suspended')
  }, [])

  const enable = useCallback(async () => {
    userDisabledRef.current = false
    enabledRef.current = true
    setEnabled(true)
    setStatus('starting')

    try {
      let nodes = nodesRef.current
      if (!nodes) {
        const createContext = factoryRef.current
        if (!createContext) {
          enabledRef.current = false
          setEnabled(false)
          setStatus('unavailable')
          return
        }

        const context = createContext()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.frequency.setValueAtTime(10, context.currentTime)
        gain.gain.setValueAtTime(0.01, context.currentTime)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start()
        context.onstatechange = () => syncStatus(context)
        nodes = { context, gain, oscillator }
        nodesRef.current = nodes
      }

      nodes.gain.gain.setValueAtTime(0.01, nodes.context.currentTime)
      await nodes.context.resume()
      syncStatus(nodes.context)
    } catch {
      if (!mountedRef.current) return
      enabledRef.current = false
      setEnabled(false)
      setStatus('error')
    }
  }, [syncStatus])

  const disable = useCallback(async () => {
    userDisabledRef.current = true
    enabledRef.current = false
    setEnabled(false)
    const nodes = nodesRef.current
    if (!nodes) {
      setStatus(factoryRef.current ? 'suspended' : 'unavailable')
      return
    }

    nodes.gain.gain.setValueAtTime(0, nodes.context.currentTime)
    try {
      await nodes.context.suspend()
      syncStatus(nodes.context)
    } catch {
      if (mountedRef.current) setStatus('error')
    }
  }, [syncStatus])

  const activateFromJourneyGesture = useCallback(() => {
    if (nodesRef.current || userDisabledRef.current) return
    void enable()
  }, [enable])

  const toggle = useCallback(() => {
    void (enabledRef.current ? disable() : enable())
  }, [disable, enable])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const nodes = nodesRef.current
      nodesRef.current = null
      if (!nodes) return
      nodes.context.onstatechange = null
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

  return {
    enabled,
    status,
    activateFromJourneyGesture,
    toggle,
  }
}
