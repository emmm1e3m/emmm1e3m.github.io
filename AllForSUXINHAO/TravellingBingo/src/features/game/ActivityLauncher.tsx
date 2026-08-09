import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import {
  getLuckyAppleAvailability,
  getVitalityMagicAvailability,
  interestForActivity,
  type ActivityKind,
  type CollectionCatalog,
  type GameAction,
  type GameState,
} from '@/domain'

import { ACTIVITY_COPY, ITEM_COPY } from './gameCopy'

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
  /** 房间灰态热点发出的一次性“立即说明意愿”请求。 */
  vitalityPromptRequestToken?: number | null
  onVitalityPromptRequestHandled?: (token: number) => void
}

interface LuckyAppleSelection {
  game: GameState
  catalog: CollectionCatalog
  kind: ActivityKind
  supplyId: ActivitySupplyId | null
}

interface RefusalNotice {
  game: GameState
  kind: ActivityKind
  attempt: number
  source: 'launcher' | 'hotspot'
}

type ActivityStartAction = Extract<GameAction, { type: 'activity/start' }>
type ActivitySupplyId = NonNullable<ActivityStartAction['supplyId']>
type ConfirmationKind = 'activity' | 'vitality'

export function ActivityLauncher({
  kind,
  game,
  catalog,
  onAction,
  onNeedSupplies,
  onNeedRest,
  vitalityPromptRequestToken,
  onVitalityPromptRequestHandled,
}: ActivityLauncherProps) {
  const copy = ACTIVITY_COPY[kind]
  const [travelSupply, setTravelSupply] = useState<ActivitySupplyId>('travel-basic')
  const [confirmation, setConfirmation] = useState<ConfirmationKind | null>(null)
  const [refusalNotice, setRefusalNotice] = useState<RefusalNotice | null>(null)
  const [luckySelection, setLuckySelection] = useState<LuckyAppleSelection | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const launchButtonRef = useRef<HTMLButtonElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const hadConfirmationRef = useRef(false)
  const handledVitalityPromptRef = useRef<number | null>(null)
  const luckyNoteId = useId()
  const refusalNoteId = useId()
  const supply = (kind === 'travel' ? travelSupply : copy.supply) as ActivitySupplyId | null
  const available = supply === null ? 1 : game.inventory[supply]
  const pet = readPetPreferences(game)
  const interest = interestForActivity(kind)
  const wanted = interest === null || (pet.preferences[interest] && !pet.tired)
  const canPrepare = game.activeActivity === null && available > 0
  const canStart = canPrepare && wanted
  const vitalityAvailability = getVitalityMagicAvailability(game)
  const canOfferVitality = !wanted && interest !== null && vitalityAvailability.canUse
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
    if (confirmation !== null) {
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
  }, [confirmation])

  useEffect(() => {
    const token = vitalityPromptRequestToken
    if (token === null || token === undefined || handledVitalityPromptRef.current === token) return

    const frame = globalThis.requestAnimationFrame(() => {
      handledVitalityPromptRef.current = token
      if (!wanted && interest !== null) {
        if (canOfferVitality) {
          setConfirmation('vitality')
        } else {
          setConfirmation(null)
          setRefusalNotice((notice) => ({
            game,
            kind,
            attempt: notice?.game === game && notice.kind === kind ? notice.attempt + 1 : 1,
            source: 'hotspot',
          }))
        }
      }
      onVitalityPromptRequestHandled?.(token)
    })
    return () => globalThis.cancelAnimationFrame(frame)
  }, [
    canOfferVitality,
    game,
    interest,
    kind,
    onVitalityPromptRequestHandled,
    vitalityPromptRequestToken,
    wanted,
  ])

  useEffect(() => {
    if (
      refusalNotice?.source !== 'hotspot' ||
      refusalNotice.game !== game ||
      refusalNotice.kind !== kind
    ) {
      return
    }
    cardRef.current?.focus({ preventScroll: true })
  }, [game, kind, refusalNotice])

  function closeConfirmation() {
    setConfirmation(null)
  }

  function handleConfirmationKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    closeConfirmation()
  }

  function handleLaunchAttempt() {
    if (!canPrepare) return
    if (wanted) {
      setConfirmation('activity')
      return
    }

    if (canOfferVitality) {
      setConfirmation('vitality')
      return
    }

    // 使用递增 key 让连续尝试也能重新播报同一句角色提示。
    setRefusalNotice((notice) => ({
      game,
      kind,
      attempt: notice?.game === game && notice.kind === kind ? notice.attempt + 1 : 1,
      source: 'launcher',
    }))
  }

  function useVitalityMagic() {
    if (!canOfferVitality) {
      closeConfirmation()
      return
    }
    onAction({ type: 'magic/vitality-use', now: Date.now() })
    closeConfirmation()
  }

  function startActivity() {
    if (!canStart) {
      closeConfirmation()
      return
    }
    onAction({
      type: 'activity/start',
      kind,
      now: Date.now(),
      ...(supply === null ? {} : { supplyId: supply }),
      useLuckyApple,
    })
    closeConfirmation()
  }

  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      className={`activity-card activity-card--${kind} ${!wanted ? 'is-reluctant' : ''}`}
      data-interest={wanted ? 'willing' : 'reluctant'}
    >
      <div className="activity-card__copy">
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
        <div className="activity-refusal" id={refusalNoteId} role="note">
          <strong>{pet.tired ? '饼狗有点累了' : copy.refuse}</strong>
          <span>
            {canOfferVitality
              ? '冰箱里有活力魔法，可以先问问要不要使用。'
              : '可以先陪它休息，醒来后再问问。'}
          </span>
          {refusalNotice?.game === game && refusalNotice.kind === kind && !canOfferVitality && (
            <p className="activity-refusal-alert" key={refusalNotice.attempt} role="alert">
              {pet.tired ? '饼狗现在有点累' : copy.refuse}，可以休息后再问问。
            </p>
          )}
          <button type="button" onClick={onNeedRest}>
            去床铺休息
          </button>
        </div>
      )}

      {available < 1 && supply !== null ? (
        <button className="paper-button" type="button" onClick={onNeedSupplies}>
          补充{ITEM_COPY[supply].name}
        </button>
      ) : confirmation === 'vitality' ? (
        <div
          className="activity-confirm activity-confirm--vitality"
          role="group"
          aria-label="确认使用活力魔法"
          onKeyDown={handleConfirmationKeyDown}
        >
          <p>使用一瓶活力魔法后，饼狗会重新有精神。要现在使用吗？</p>
          <div className="button-row">
            <button
              className="paper-button paper-button--primary"
              type="button"
              onClick={useVitalityMagic}
            >
              使用活力魔法
            </button>
            <button
              ref={cancelButtonRef}
              className="paper-button"
              type="button"
              onClick={closeConfirmation}
            >
              先不使用
            </button>
          </div>
        </div>
      ) : confirmation === 'activity' ? (
        <div
          className="activity-confirm"
          role="group"
          aria-label={`确认${copy.name}`}
          onKeyDown={handleConfirmationKeyDown}
        >
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
              onClick={closeConfirmation}
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
          disabled={!canPrepare}
          aria-describedby={!wanted ? refusalNoteId : undefined}
          onClick={handleLaunchAttempt}
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
