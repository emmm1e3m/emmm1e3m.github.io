import { useRef } from 'react'

import { useModalFocus } from '@/components/useModalFocus'

import { CURRENT_UPDATE_NOTICE } from './noticeData'
import './update-notice.css'

interface UpdateNoticeCardProps {
  onOpen: () => void
}

export function UpdateNoticeCard({ onOpen }: UpdateNoticeCardProps) {
  const notice = CURRENT_UPDATE_NOTICE

  return (
    <button
      className="landing-cache update-notice-card"
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <span className="update-notice-card__copy">
        <strong>更新公告 · {notice.title}</strong>
        <span>{notice.summary}</span>
        <span className="update-notice-card__warning">{notice.warning}</span>
      </span>
      <time dateTime={notice.publishedDate}>{notice.publishedLabel}</time>
    </button>
  )
}

interface UpdateNoticeDialogProps {
  open: boolean
  onClose: () => void
}

export function UpdateNoticeDialog({ open, onClose }: UpdateNoticeDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalFocus<HTMLElement>(open, onClose, { initialFocus: closeRef })

  if (!open) return null

  const notice = CURRENT_UPDATE_NOTICE

  return (
    <div
      className="modal-backdrop update-notice-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <article
        ref={dialogRef}
        className="update-notice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-notice-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="update-notice-dialog__topline">
          <span className="paper-tag">更新公告</span>
          <time dateTime={notice.publishedDate}>{notice.publishedLabel}</time>
        </div>
        <h2 id="update-notice-title">{notice.title}</h2>
        <p className="update-notice-dialog__summary">{notice.summary}</p>
        <p className="update-notice-dialog__warning" role="note">
          <strong>请留意</strong>
          <span>{notice.warning}</span>
        </p>
        <ul className="update-notice-dialog__list">
          {notice.entries.map((entry) => (
            <li key={entry.title}>
              <strong>{entry.title}</strong>
              <span>{entry.detail}</span>
            </li>
          ))}
        </ul>
        <button
          ref={closeRef}
          className="paper-button paper-button--primary"
          type="button"
          onClick={onClose}
        >
          收好啦
        </button>
      </article>
    </div>
  )
}
