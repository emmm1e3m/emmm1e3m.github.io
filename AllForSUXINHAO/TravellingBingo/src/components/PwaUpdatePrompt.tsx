import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  return (
    <aside className="pwa-prompt" role="status" aria-live="polite">
      <strong>{needRefresh ? '铲铲饼屋有新版本' : '离线背包准备好啦'}</strong>
      <span>{needRefresh ? '更新后会重新打开当前页面。' : '断网也能继续打开游戏和缩略收藏。'}</span>
      <div>
        {needRefresh && (
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            立即更新
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOfflineReady(false)
            setNeedRefresh(false)
          }}
        >
          知道啦
        </button>
      </div>
    </aside>
  )
}
