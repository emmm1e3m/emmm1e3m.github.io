import { useEffect } from 'react'

const MOBILE_PRIMARY_INPUT_QUERY = '(hover: none) and (pointer: coarse)'

/**
 * 移动主输入设备在游戏运行且页面可见时请求屏幕常亮。浏览器不支持或拒绝
 * 请求时保持静默，不影响游戏本身。
 */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (
      !enabled ||
      typeof globalThis.matchMedia !== 'function' ||
      !globalThis.matchMedia(MOBILE_PRIMARY_INPUT_QUERY).matches ||
      !('wakeLock' in globalThis.navigator)
    ) {
      return
    }

    let active = true
    let requestPending = false
    let sentinel: WakeLockSentinel | null = null

    const release = async () => {
      const current = sentinel
      sentinel = null
      if (!current || current.released) return
      await current.release().catch(() => undefined)
    }

    const request = async () => {
      if (
        !active ||
        requestPending ||
        sentinel !== null ||
        globalThis.document.visibilityState !== 'visible'
      ) {
        return
      }

      requestPending = true
      try {
        const acquired = await globalThis.navigator.wakeLock.request('screen')
        if (!active || globalThis.document.visibilityState !== 'visible') {
          if (!acquired.released) await acquired.release().catch(() => undefined)
          return
        }
        sentinel = acquired
      } catch {
        // 常亮权限被拒绝时继续正常运行游戏。
      } finally {
        requestPending = false
      }
    }

    const handleVisibilityChange = () => {
      if (globalThis.document.visibilityState === 'visible') {
        void request()
      } else {
        void release()
      }
    }

    void request()
    globalThis.document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      active = false
      globalThis.document.removeEventListener('visibilitychange', handleVisibilityChange)
      void release()
    }
  }, [enabled])
}
