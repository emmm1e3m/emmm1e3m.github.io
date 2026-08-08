import { useId, useState } from 'react'

import {
  getLuckyAppleAvailability,
  type ActivityKind,
  type CollectionCatalog,
  type GameAction,
  type GameState,
  type ItemId,
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
}

interface LuckyAppleSelection {
  game: GameState
  catalog: CollectionCatalog
  kind: ActivityKind
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
  const [luckySelection, setLuckySelection] = useState<LuckyAppleSelection | null>(null)
  const luckyNoteId = useId()
  const supply = kind === 'travel' ? travelSupply : copy.supply
  const available = game.inventory[supply]
  const pet = readPetPreferences(game)
  const wanted = pet.preferences[kind] && !pet.tired
  const canStart = game.activeActivity === null && available > 0 && wanted
  const luckyAvailability = getLuckyAppleAvailability(game, kind, catalog)
  const hasLuckyApple = game.inventory['lucky-apple'] > 0
  const canChooseLuckyApple = luckyAvailability.canUse && hasLuckyApple
  const useLuckyApple =
    canChooseLuckyApple &&
    luckySelection?.game === game &&
    luckySelection.catalog === catalog &&
    luckySelection.kind === kind
  const luckyNote = luckyAvailability.canUse
    ? hasLuckyApple
      ? null
      : '冰箱里暂时没有幸运苹果，补充好再来商量吧。'
    : luckyAvailability.reason === 'category-complete'
      ? '这一类回忆已经收齐啦，把幸运苹果留给下一次惊喜吧。'
      : '这次的回忆已经稳稳在路上了，幸运苹果先留在冰箱里吧。'

  function startActivity() {
    if (!canStart) return
    onAction({
      type: 'activity/start',
      kind,
      now: Date.now(),
      supplyId: supply,
      useLuckyApple,
    })
  }

  return (
    <article className={`activity-card activity-card--${kind}`}>
      <div className="activity-card__copy">
        <span className="eyebrow">{kind === 'travel' ? '门口计划' : '电脑计划'}</span>
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

      <button
        type="button"
        className="soft-toggle"
        aria-pressed={useLuckyApple}
        aria-describedby={luckyNote ? luckyNoteId : undefined}
        disabled={!canChooseLuckyApple}
        onClick={() =>
          setLuckySelection((selection) =>
            selection?.game === game && selection.catalog === catalog && selection.kind === kind
              ? null
              : { game, catalog, kind },
          )
        }
      >
        {useLuckyApple
          ? '已经带上幸运苹果'
          : `带上幸运苹果 · 还有 ${game.inventory['lucky-apple']} 个`}
      </button>
      {luckyNote && (
        <p className="lucky-apple-note" id={luckyNoteId} role="note">
          {luckyNote}
        </p>
      )}

      {!wanted ? (
        <div className="activity-refusal" role="note">
          <strong>{pet.tired ? '饼狗有点累了' : copy.refuse}</strong>
          <span>睡一觉后，它会重新想想今天想做什么。</span>
          <button type="button" onClick={onNeedRest}>
            去床铺休息
          </button>
        </div>
      ) : available < 1 ? (
        <button className="paper-button" type="button" onClick={onNeedSupplies}>
          去冰箱补充{ITEM_COPY[supply].name}
        </button>
      ) : (
        <button
          className="paper-button paper-button--primary"
          type="button"
          disabled={!canStart}
          onClick={startActivity}
        >
          {game.activeActivity ? '等饼狗忙完这一件事' : `开始${copy.name}`}
        </button>
      )}
    </article>
  )
}
