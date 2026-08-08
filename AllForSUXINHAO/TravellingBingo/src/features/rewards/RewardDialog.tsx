import { MascotSprite } from '@/components/MascotSprite'
import { useModalFocus } from '@/components/useModalFocus'
import type { ContentCatalog } from '@/content'
import type { ClaimSummary } from '@/domain'
import { categoryLabel } from '@/features/album/categoryLabel'
import { CollectiblePicture } from '@/features/album/CollectiblePicture'
import { FRIEND_NAMES } from '@/features/game/gameCopy'

function rewardHeading(reward: ClaimSummary, category?: string) {
  if (reward.kind === 'trend') {
    return category === 'site-first' ? '全站第一！' : '很遗憾没能拿到全站第一'
  }
  if (reward.kind === 'stream') {
    return category === 'million-shot' ? '把这一刻好好珍藏' : '今天的陪伴也算数'
  }
  return category === 'postcard' ? '旅途中遇见一份风景' : '今天也走了很远'
}

interface RewardDialogProps {
  reward: ClaimSummary
  catalog: ContentCatalog
  onDismiss: () => void
}

export function RewardDialog({ reward, catalog, onDismiss }: RewardDialogProps) {
  const rewardItem = reward.collection ? catalog.byId[reward.collection.id] : undefined
  const dialogRef = useModalFocus<HTMLElement>(true, onDismiss)

  return (
    <div className="modal-backdrop reward-backdrop" role="presentation">
      <article
        ref={dialogRef}
        className="reward-card reward-card--v2"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-title"
        tabIndex={-1}
      >
        <span className="reward-spark reward-spark--left" aria-hidden="true">
          ✦
        </span>
        <span className="reward-spark reward-spark--right" aria-hidden="true">
          ✦
        </span>
        <MascotSprite pose="celebrate" className="reward-mascot" />
        <span className="paper-tag">活动完成</span>
        <h2 id="reward-title">{rewardHeading(reward, rewardItem?.category)}</h2>

        {rewardItem ? (
          <div className="reward-collectible">
            <CollectiblePicture item={rewardItem} />
            <div>
              <strong>{rewardItem.title}</strong>
              <span>
                {categoryLabel(rewardItem.category)}
                {reward.collection?.duplicate ? ' · 再次遇见' : ' · 新收藏'}
              </span>
            </div>
          </div>
        ) : reward.kind === 'trend' ? (
          <p className="reward-empty">别着急，饼狗会陪你准备下一次冲刺。</p>
        ) : (
          <p className="reward-empty">认真度过的时间，也被饼狗记住了。</p>
        )}

        {reward.friendEventId && (
          <p className="friend-note">
            路上遇见了 {FRIEND_NAMES[reward.friendEventId] ?? '一位朋友'}。
          </p>
        )}
        <button
          className="paper-button paper-button--primary paper-button--large"
          type="button"
          onClick={onDismiss}
        >
          {rewardItem ? '收好这份回忆' : '回到房间'}
        </button>
      </article>
    </div>
  )
}
