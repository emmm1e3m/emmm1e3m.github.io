import { useRef } from 'react'

import { publicAsset } from '@/app/assets'
import { MascotSprite } from '@/components/MascotSprite'
import { useModalFocus } from '@/components/useModalFocus'
import type { ContentCatalog } from '@/content'
import type { ClaimSummary } from '@/domain'
import { categoryLabel } from '@/features/album/categoryLabel'
import { CollectiblePicture } from '@/features/album/CollectiblePicture'
import { ITEM_COPY } from '@/features/game/gameCopy'

import './RewardDialog.css'

function rewardHeading(reward: ClaimSummary, category?: string, friendName?: string) {
  if (reward.kind === 'trend') {
    return category === 'site-first' ? '全站第一！' : '很遗憾没能拿到全站第一'
  }
  if (reward.kind === 'stream') {
    return category === 'million-shot' ? '把这一刻好好珍藏' : '今天的陪伴也算数'
  }
  if (reward.kind === 'music') {
    return friendName ? `${friendName}循着音乐来啦` : '房间里留住了一段旋律'
  }
  if (reward.kind === 'rest') return '饼狗睡醒啦'
  if (friendName) return `路上遇见了${friendName}`
  return category === 'postcard' ? '旅途中遇见一份风景' : '今天也走了很远'
}

interface RewardDialogProps {
  reward: ClaimSummary
  catalog: ContentCatalog
  onDismiss: () => void
}

export function RewardDialog({ reward, catalog, onDismiss }: RewardDialogProps) {
  const rewardItem = reward.collection ? catalog.byId[reward.collection.id] : undefined
  const friend = reward.friendId ? catalog.friendById[reward.friendId] : undefined
  const dismissButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(true, onDismiss, {
    initialFocus: dismissButtonRef,
  })

  return (
    <div className="modal-backdrop reward-backdrop reward-backdrop--v4" role="presentation">
      <article
        ref={dialogRef}
        className="reward-card reward-card--v2 reward-card--v3 reward-card--v4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-title"
        tabIndex={-1}
      >
        <MascotSprite pose="celebrate" className="reward-mascot" />
        {rewardItem?.category !== 'postcard' && <span className="paper-tag">Bingo 完成</span>}
        <h2 id="reward-title">{rewardHeading(reward, rewardItem?.category, friend?.name)}</h2>

        {rewardItem && (
          <div className="reward-collectible">
            <div
              className={`reward-collectible__media reward-collectible__media--${rewardItem.category}`}
            >
              <CollectiblePicture item={rewardItem} />
            </div>
            <div>
              <strong>{rewardItem.title}</strong>
              <span>
                {categoryLabel(rewardItem.category)}
                {reward.collection?.duplicate ? ' · 再次遇见' : ' · 新收藏'}
              </span>
            </div>
          </div>
        )}

        {friend && (
          <div className="reward-friend">
            <div className="reward-friend__media">
              <img
                src={publicAsset(friend.image.path)}
                alt={friend.alt}
                width={friend.image.width}
                height={friend.image.height}
              />
            </div>
            <div>
              <strong>{friend.name}</strong>
              <span>{friend.description}</span>
              {reward.giftItemId && <small>送来一份{ITEM_COPY[reward.giftItemId].name}</small>}
              {reward.giftApples > 0 && (
                <small className="numeric-copy">还送来 {reward.giftApples}🍎</small>
              )}
            </div>
          </div>
        )}

        {!rewardItem && !friend && reward.kind === 'trend' && (
          <p className="reward-empty">别着急，饼狗会陪你准备下一次冲刺。</p>
        )}
        {!rewardItem && !friend && reward.kind !== 'trend' && reward.apples.total === 0 && (
          <p className="reward-empty">认真度过的时间，也被饼狗记住了。</p>
        )}
        {!friend && reward.apples.total > 0 && (
          <p className="reward-apples numeric-copy" aria-label={`得到 ${reward.apples.total}🍎`}>
            {reward.apples.total}🍎
          </p>
        )}

        <button
          ref={dismissButtonRef}
          className="paper-button paper-button--primary"
          type="button"
          onClick={onDismiss}
        >
          {rewardItem ? '收好这份回忆' : '回到房间'}
        </button>
      </article>
    </div>
  )
}
