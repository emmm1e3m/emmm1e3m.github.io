import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

import './PwaUpdatePrompt.css'

export type InstallPwaUpdate = () => Promise<void>

interface PwaUpdatePromptProps {
  onNeedReload: () => void
  onUpdateAvailable: () => void
  onRequestUpdate: (installUpdate: InstallPwaUpdate) => void
}

export function PwaUpdatePrompt({
  onNeedReload,
  onUpdateAvailable,
  onRequestUpdate,
}: PwaUpdatePromptProps) {
  const onNeedReloadRef = useRef(onNeedReload)
  const onUpdateAvailableRef = useRef(onUpdateAvailable)
  const serviceWorkerHasControl = useRef(false)
  const backupRequestedForRefresh = useRef(false)
  useEffect(() => {
    onNeedReloadRef.current = onNeedReload
  }, [onNeedReload])
  useEffect(() => {
    onUpdateAvailableRef.current = onUpdateAvailable
  }, [onUpdateAvailable])

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // 覆盖库的默认 location.reload，跨标签接管也必须先经过 App 的存档保护。
    onNeedReload: () => {
      serviceWorkerHasControl.current = true
      onNeedReloadRef.current()
    },
  })

  useEffect(() => {
    if (!needRefresh) {
      backupRequestedForRefresh.current = false
      return
    }
    if (backupRequestedForRefresh.current) return
    backupRequestedForRefresh.current = true
    onUpdateAvailableRef.current()
  }, [needRefresh])

  if (!offlineReady && !needRefresh) return null

  const title = needRefresh ? '饼屋换上新布置啦' : '离线行囊收拾好啦'
  const description = needRefresh
    ? '打开新布置前会自动备份，饼狗会在原地等你。'
    : '暂时没有网络，也能继续陪饼狗待在家里。'

  function dismiss() {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <aside
      className="pwa-prompt pwa-update-prompt"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby="pwa-update-title"
      aria-describedby="pwa-update-description"
    >
      <div className="pwa-update-prompt__copy">
        <strong id="pwa-update-title">{title}</strong>
        <span id="pwa-update-description">{description}</span>
      </div>
      <div className="pwa-update-prompt__actions">
        {needRefresh && (
          <button
            className="pwa-update-prompt__primary"
            type="button"
            onClick={() => {
              if (serviceWorkerHasControl.current) {
                onNeedReloadRef.current()
                return
              }
              onRequestUpdate(() => updateServiceWorker(true))
            }}
          >
            看看新布置
          </button>
        )}
        <button type="button" onClick={dismiss}>
          {needRefresh ? '晚点再看' : '收好啦'}
        </button>
      </div>
    </aside>
  )
}
