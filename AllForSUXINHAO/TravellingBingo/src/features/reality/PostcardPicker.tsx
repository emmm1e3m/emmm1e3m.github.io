import { useId } from 'react'

import type { PostcardBackgroundOption } from './types'

interface PostcardPickerProps {
  options: readonly PostcardBackgroundOption[]
  selectedId: string | null
  onChange: (postcardId: string | null) => void
}

export function PostcardPicker({ options, selectedId, onChange }: PostcardPickerProps) {
  const headingId = useId()
  const selected = options.find((option) => option.id === selectedId) ?? null

  return (
    <section className="reality-work-card reality-postcard-picker" aria-labelledby={headingId}>
      <div className="reality-work-card__heading">
        <div>
          <span className="reality-card-index">03</span>
          <h3 id={headingId}>选择陪伴明信片</h3>
        </div>
        <span className="reality-unlocked-count">已解锁 {options.length}</span>
      </div>

      <div
        className="reality-postcard-picker__preview"
        data-background-id={selected?.id ?? 'plain'}
      >
        {selected?.thumbnailUrl ? (
          <img
            src={selected.fullUrl ?? selected.thumbnailUrl}
            alt={selected.alt ?? selected.title}
          />
        ) : (
          <span aria-hidden="true">白纸</span>
        )}
        <p>
          <strong>{selected?.title ?? '默认纸张'}</strong>
          <span>{selected?.description ?? '留一张安静的纸，和饼狗一起开始。'}</span>
        </p>
      </div>

      <div className="reality-postcard-wall" role="radiogroup" aria-label="苹果钟明信片">
        <label className="reality-postcard-tile reality-postcard-tile--plain">
          <input
            type="radio"
            name={headingId}
            checked={selectedId === null}
            onChange={() => onChange(null)}
          />
          <span aria-hidden="true">白纸</span>
          <strong>默认纸张</strong>
        </label>
        {options.map((option) => (
          <label key={option.id} className="reality-postcard-tile">
            <input
              type="radio"
              name={headingId}
              checked={option.id === selectedId}
              onChange={() => onChange(option.id)}
            />
            {option.thumbnailUrl ? (
              <img src={option.thumbnailUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="reality-postcard-option__placeholder" aria-hidden="true">
                明信片
              </span>
            )}
            <strong>{option.title}</strong>
          </label>
        ))}
      </div>
    </section>
  )
}
