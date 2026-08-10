import { useId, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { useModalFocus } from '@/components/useModalFocus'

import type { PostcardBackgroundOption } from './types'

interface PostcardPickerProps {
  options: readonly PostcardBackgroundOption[]
  selectedId: string | null
  onChange: (postcardId: string | null) => void
  disabled?: boolean
}

interface PostcardPickerDialogProps {
  options: readonly PostcardBackgroundOption[]
  selectedId: string | null
  onSelect: (postcardId: string | null) => void
  onCancel: () => void
  returnFocus: () => HTMLElement | null
}

function PostcardPickerDialog({
  options,
  selectedId,
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
            <span className="reality-eyebrow">陪伴明信片</span>
            <h2 id={titleId}>选择这一轮的风景</h2>
            <p id={descriptionId}>选择一张即可确定，专注开始时会在全屏完整显示这张明信片。</p>
          </div>
          <span className="reality-unlocked-count">已解锁 {options.length}</span>
        </header>

        <div className="reality-postcard-dialog__wall" role="radiogroup" aria-label="苹果钟明信片">
          <label className="reality-postcard-tile reality-postcard-tile--plain">
            <input
              type="radio"
              name={titleId}
              checked={selectedId === null}
              onChange={() => onSelect(null)}
              onClick={() => {
                if (selectedId === null) onSelect(null)
              }}
            />
            <span aria-hidden="true">白纸</span>
            <strong>默认纸张</strong>
          </label>
          {options.map((option) => (
            <label key={option.id} className="reality-postcard-tile">
              <input
                type="radio"
                name={titleId}
                checked={option.id === selectedId}
                onChange={() => onSelect(option.id)}
                onClick={() => {
                  if (option.id === selectedId) onSelect(option.id)
                }}
              />
              {option.thumbnailUrl ? (
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
  selectedId,
  onChange,
  disabled = false,
}: PostcardPickerProps) {
  const headingId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.id === selectedId) ?? null

  function openPicker() {
    setOpen(true)
  }

  function closePicker() {
    setOpen(false)
  }

  function selectPostcard(postcardId: string | null) {
    onChange(postcardId)
    setOpen(false)
  }

  return (
    <section className="reality-work-card reality-postcard-picker" aria-labelledby={headingId}>
      <div className="reality-work-card__heading">
        <div>
          <span className="reality-card-index">03</span>
          <h3 id={headingId}>陪伴明信片</h3>
        </div>
        <span className="reality-unlocked-count">已解锁 {options.length}</span>
      </div>

      <div
        className="reality-postcard-picker__preview"
        data-background-id={selected?.id ?? 'plain'}
        style={
          {
            '--postcard-preview-width': selected?.aspectRatio
              ? `${Math.round(168 * selected.aspectRatio)}px`
              : '42%',
          } as CSSProperties
        }
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

      <button
        ref={triggerRef}
        className="reality-secondary-button reality-postcard-picker__trigger"
        type="button"
        disabled={disabled}
        onClick={openPicker}
      >
        选择陪伴明信片
      </button>

      {open && (
        <PostcardPickerDialog
          options={options}
          selectedId={selectedId}
          onSelect={selectPostcard}
          onCancel={closePicker}
          returnFocus={() => triggerRef.current}
        />
      )}
    </section>
  )
}
