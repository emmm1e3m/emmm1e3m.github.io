import { useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '@/components/useModalFocus'
import type { PomodoroBackgroundRef } from '@/domain'
import { PhotoCompositionPreview } from '@/features/wardrobe/PhotoCompositionPreview'

import { samePomodoroBackgroundRef } from './realityViewModel'
import type { PomodoroBackgroundOption } from './types'

interface PostcardPickerProps {
  options: readonly PomodoroBackgroundOption[]
  selected: PomodoroBackgroundRef | null
  onChange: (background: PomodoroBackgroundRef | null) => void
  disabled?: boolean
}

interface PostcardPickerDialogProps {
  options: readonly PomodoroBackgroundOption[]
  selected: PomodoroBackgroundRef | null
  onSelect: (background: PomodoroBackgroundRef | null) => void
  onCancel: () => void
  returnFocus: () => HTMLElement | null
}

function PostcardPickerDialog({
  options,
  selected,
  onSelect,
  onCancel,
  returnFocus,
}: PostcardPickerDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(true, onCancel, {
    initialFocus: cancelRef,
    returnFocus,
  })

  return createPortal(
    <div className="reality-postcard-dialog-backdrop" data-modal-backdrop>
      <section
        ref={dialogRef}
        className="reality-postcard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="reality-postcard-dialog__header">
          <div>
            <span className="reality-eyebrow">陪伴背景</span>
            <h2 id={titleId}>选择这一轮的风景</h2>
            <p id={descriptionId}>明信片与保存的奇迹合拍都可以成为背景，单击一张即可确定。</p>
          </div>
          <span className="reality-unlocked-count">可选背景 {options.length}</span>
        </header>

        <div className="reality-postcard-dialog__wall" role="radiogroup" aria-label="苹果钟背景">
          <label className="reality-postcard-tile reality-postcard-tile--plain">
            <input
              type="radio"
              name={titleId}
              checked={selected === null}
              onChange={() => onSelect(null)}
              onClick={() => {
                if (selected === null) onSelect(null)
              }}
            />
            <span aria-hidden="true">白纸</span>
            <strong>默认纸张</strong>
          </label>
          {options.map((option) => (
            <label
              key={`${option.kind}:${option.id}`}
              className={`reality-postcard-tile reality-postcard-tile--${option.kind}`}
            >
              <input
                type="radio"
                name={titleId}
                checked={samePomodoroBackgroundRef(option.ref, selected)}
                onChange={() => onSelect(option.ref)}
                onClick={() => {
                  if (samePomodoroBackgroundRef(option.ref, selected)) onSelect(option.ref)
                }}
              />
              {option.kind === 'wardrobe-photo' ? (
                <PhotoCompositionPreview
                  photo={option.photo}
                  postcard={option.thumbnailPostcard}
                  className="reality-postcard-option__photo"
                  mode="contain"
                  decorative
                />
              ) : option.thumbnailUrl ? (
                <img
                  src={option.thumbnailUrl}
                  alt={option.alt ?? ''}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="reality-postcard-option__placeholder" aria-hidden="true">
                  明信片
                </span>
              )}
              <strong>{option.title}</strong>
            </label>
          ))}
        </div>

        <div className="reality-postcard-dialog__actions">
          <button
            ref={cancelRef}
            className="reality-secondary-button"
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function PostcardPicker({
  options,
  selected,
  onChange,
  disabled = false,
}: PostcardPickerProps) {
  const headingId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const selectedOption =
    options.find((option) => samePomodoroBackgroundRef(option.ref, selected)) ?? null

  function openPicker() {
    setOpen(true)
  }

  function closePicker() {
    setOpen(false)
  }

  function selectBackground(background: PomodoroBackgroundRef | null) {
    onChange(background)
    setOpen(false)
  }

  return (
    <section className="reality-work-card reality-postcard-picker" aria-labelledby={headingId}>
      <div className="reality-work-card__heading">
        <div>
          <span className="reality-card-index">03</span>
          <h3 id={headingId}>陪伴背景</h3>
        </div>
        <span className="reality-unlocked-count">可选背景 {options.length}</span>
      </div>

      <div
        className="reality-postcard-picker__preview"
        data-background-id={
          selectedOption
            ? `${selectedOption.kind === 'postcard' ? '' : 'wardrobe-photo:'}${selectedOption.id}`
            : 'plain'
        }
        style={
          {
            '--postcard-preview-width': selectedOption?.aspectRatio
              ? `${Math.round(168 * selectedOption.aspectRatio)}px`
              : '42%',
          } as CSSProperties
        }
      >
        {selectedOption?.kind === 'wardrobe-photo' ? (
          <PhotoCompositionPreview
            photo={selectedOption.photo}
            postcard={selectedOption.fullPostcard ?? selectedOption.thumbnailPostcard}
            className="reality-postcard-picker__photo"
            mode="contain"
            decorative
          />
        ) : selectedOption?.thumbnailUrl ? (
          <img
            src={selectedOption.fullUrl ?? selectedOption.thumbnailUrl}
            alt={selectedOption.alt ?? selectedOption.title}
          />
        ) : (
          <span aria-hidden="true">白纸</span>
        )}
        <p>
          <strong>{selectedOption?.title ?? '默认纸张'}</strong>
          <span>{selectedOption?.description ?? '留一张安静的纸，和饼狗一起开始。'}</span>
        </p>
      </div>

      <button
        ref={triggerRef}
        className="reality-secondary-button reality-postcard-picker__trigger"
        type="button"
        disabled={disabled}
        onClick={openPicker}
      >
        选择陪伴背景
      </button>

      {open && (
        <PostcardPickerDialog
          options={options}
          selected={selected}
          onSelect={selectBackground}
          onCancel={closePicker}
          returnFocus={() => triggerRef.current}
        />
      )}
    </section>
  )
}
