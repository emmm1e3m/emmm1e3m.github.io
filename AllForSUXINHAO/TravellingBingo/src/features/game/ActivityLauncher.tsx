import { useEffect, useId, useRef, useState } from 'react'

import {
  getLuckyAppleAvailability,
  interestForActivity,
  type ActivityKind,
  type CollectionCatalog,
  type GameAction,
  type GameState,
  type ItemId,
} from '@/domain'

import { ACTIVITY_COPY, ITEM_COPY } from './gameCopy'

const ACTIVITY_SCENE_LABEL: Record<ActivityKind, string> = {
  travel: '门口计划',
  stream: '电脑计划',
  trend: '电脑计划',
  music: '音乐计划',
  rest: '休息计划',
}

function readPetPreferences(game: GameState) {
  return game.pet
}

interface ActivityLauncherProps {
  kind: ActivityKind
  game: GameState
  catalog: CollectionCatalog
  onAction: (action: GameAction) => void
  onNeedSupplies: () => void
  onNeedRest: () => void
}

interface LuckyAppleSelection {
  game: GameState
  catalog: CollectionCatalog
  kind: ActivityKind
  supplyId: ItemId | null
}

export function ActivityLauncher({
  kind,
  game,
  catalog,
  onAction,
  onNeedSupplies,
  onNeedRest,
}: ActivityLauncherProps) {
  const copy = ACTIVITY_COPY[kind]
  const [travelSupply, setTravelSupply] = useState<ItemId>('travel-basic')
  const [confirming, setConfirming] = useState(false)
  const [luckySelection, setLuckySelection] = useState<LuckyAppleSelection | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const launchButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const hadConfirmationRef = useRef(false)
  const luckyNoteId = useId()
  const supply = kind === 'travel' ? travelSupply : copy.supply
  const available = supply === null ? 1 : game.inventory[supply]
  const pet = readPetPreferences(game)
  const interest = interestForActivity(kind)
  const wanted = interest === null || (pet.preferences[interest] && !pet.tired)
  const canStart = game.activeActivity === null && available > 0
  const luckyAvailability = getLuckyAppleAvailability(game, kind, catalog, supply ?? undefined)
  const hasLuckyApple = game.inventory['lucky-apple'] > 0
  const canChooseLuckyApple = luckyAvailability.canUse && hasLuckyApple
  const useLuckyApple =
    canChooseLuckyApple &&
    luckySelection?.game === game &&
    luckySelection.catalog === catalog &&
    luckySelection.kind === kind &&
    luckySelection.supplyId === supply
  const luckyNote = luckyAvailability.canUse
    ? hasLuckyApple
      ? null
      : '冰箱里暂时没有幸运苹果，补充好再来商量吧。'
    : luckyAvailability.reason === 'category-complete'
      ? '这一类回忆已经收齐啦，把幸运苹果留给下一次惊喜吧。'
      : luckyAvailability.reason === 'friend-result-guaranteed'
        ? '这份便当已经把朋友稳稳约来啦，幸运苹果留给下一次吧。'
        : '这次的回忆已经稳稳在路上了，幸运苹果先留在冰箱里吧。'

  useEffect(() => {
    if (confirming) {
      hadConfirmationRef.current = true
      cancelButtonRef.current?.focus({ preventScroll: true })
      return
    }

    if (!hadConfirmationRef.current) return
    hadConfirmationRef.current = false

    const launchButton = launchButtonRef.current
    if (launchButton && !launchButton.disabled) {
      launchButton.focus({ preventScroll: true })
      return
    }

    cardRef.current?.focus({ preventScroll: true })
  }, [confirming])

  function startActivity() {
    if (!canStart) return
    onAction({
      type: 'activity/start',
      kind,
      now: Date.now(),
      ...(supply === null ? {} : { supplyId: supply }),
      useLuckyApple,
    })
    setConfirming(false)
  }

  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      className={`activity-card activity-card--${kind} ${!wanted ? 'is-reluctant' : ''}`}
      data-interest={wanted ? 'willing' : 'reluctant'}
    >
      <div className="activity-card__copy">
        <span className="eyebrow">{ACTIVITY_SCENE_LABEL[kind]}</span>
        <h3>{copy.name}</h3>
        <p>{copy.note}</p>
      </div>

      {kind === 'travel' && (
        <fieldset className="choice-group">
          <legend>带哪一份便当</legend>
          {(['travel-basic', 'travel-apple'] as const).map((itemId) => (
            <label key={itemId} className={travelSupply === itemId ? 'is-selected' : ''}>
              <input
                type="radio"
                name="travel-supply"
                value={itemId}
                checked={travelSupply === itemId}
                onChange={() => setTravelSupply(itemId)}
              />
              <strong>{ITEM_COPY[itemId].name}</strong>
              <small>还有 {game.inventory[itemId]} 份</small>
            </label>
          ))}
        </fieldset>
      )}

      {kind !== 'music' && kind !== 'rest' && (
        <>
          <button
            type="button"
            className="soft-toggle"
            aria-pressed={useLuckyApple}
            aria-describedby={luckyNote ? luckyNoteId : undefined}
            disabled={!canChooseLuckyApple}
            onClick={() =>
              setLuckySelection((selection) =>
                selection?.game === game &&
                selection.catalog === catalog &&
                selection.kind === kind &&
                selection.supplyId === supply
                  ? null
                  : { game, catalog, kind, supplyId: supply },
              )
            }
          >
            {useLuckyApple
              ? '已经带上幸运苹果'
              : `带上幸运苹果 · 还有 ${game.inventory['lucky-apple']} 份`}
          </button>
          {luckyNote && (
            <p className="lucky-apple-note" id={luckyNoteId} role="note">
              {luckyNote}
            </p>
          )}
        </>
      )}

      {!wanted && (
        <div className="activity-refusal" role="note">
          <strong>{pet.tired ? '饼狗有点累了' : copy.refuse}</strong>
          <span>按钮仍然可以按；如果它摇摇头，就陪它去床边休息。</span>
          <button type="button" onClick={onNeedRest}>
            去床铺休息
          </button>
        </div>
      )}

      {available < 1 && supply !== null ? (
        <button className="paper-button" type="button" onClick={onNeedSupplies}>
          为冰箱补充{ITEM_COPY[supply].name}
        </button>
      ) : confirming ? (
        <div className="activity-confirm" role="group" aria-label={`确认${copy.name}`}>
          <p>
            {supply ? `带上${ITEM_COPY[supply].name}，` : ''}
            和饼狗一起开始这段时间吗？
          </p>
          <div className="button-row">
            <button
              className="paper-button paper-button--primary"
              type="button"
              onClick={startActivity}
            >
              确认开始
            </button>
            <button
              ref={cancelButtonRef}
              className="paper-button"
              type="button"
              onClick={() => setConfirming(false)}
            >
              再想想
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={launchButtonRef}
          className={`paper-button paper-button--primary ${!wanted ? 'is-reluctant' : ''}`}
          type="button"
          disabled={!canStart}
          onClick={() => setConfirming(true)}
        >
          {game.activeActivity
            ? '现在有一件事正在进行'
            : wanted
              ? `准备${copy.name}`
              : `问问饼狗要不要${copy.name}`}
        </button>
      )}
    </article>
  )
}
