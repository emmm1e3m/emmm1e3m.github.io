import { useState, type ChangeEvent, type FormEvent } from 'react'

import { publicAsset } from '@/app/assets'
import { AppleAmount } from '@/components/AppleAmount'
import { MascotSprite } from '@/components/MascotSprite'
import { useModalFocus } from '@/components/useModalFocus'
import { isValidDisplayName, MAX_DISPLAY_NAME_LENGTH } from '@/domain'
import { UpdateNoticeCard, UpdateNoticeDialog } from '@/features/update-notice/UpdateNotice'

import './title.css'

export interface ImportPreview {
  fileName: string
  exportedAt: number
  gameVersion: string
  apples: number
  collectionCount: number
  activityLabel: string
  debug: boolean
  displayName: string
  companionDays: number
}

export interface CachedSavePreview {
  updatedAt: number
  gameVersion: string
  apples: number
  collectionCount: number
  activityLabel: string
  debug: boolean
  displayName: string
  companionDays: number
}

export type UpdateCheckStatus = 'idle' | 'checking' | 'checked' | 'unsupported' | 'error'

interface TitleScreenProps {
  loading: boolean
  available: boolean
  error: string | null
  importPreview: ImportPreview | null
  cachedPreview: CachedSavePreview | null
  debugUnlocked: boolean
  onStart: (displayName: string) => void
  onContinueCached: () => void
  onFile: (file: File) => void
  onConfirmImport: () => void
  onCancelImport: () => void
  onRetryCatalog: () => void
  onTitleActivate: () => void
  updateCheckStatus: UpdateCheckStatus
  onCheckForUpdates: () => void
}

function formatExportTime(value: number) {
  const date = new Date(value)
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) =>
    index === 0 ? String(part) : String(part).padStart(2, '0'),
  )
  const time = [date.getHours(), date.getMinutes()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
  return `${parts.join('.')} ${time}`
}

export function TitleScreen({
  loading,
  available,
  error,
  importPreview,
  cachedPreview,
  debugUnlocked,
  onStart,
  onContinueCached,
  onFile,
  onConfirmImport,
  onCancelImport,
  onRetryCatalog,
  onTitleActivate,
  updateCheckStatus,
  onCheckForUpdates,
}: TitleScreenProps) {
  const [displayName, setDisplayName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [newJourneyOpen, setNewJourneyOpen] = useState(false)
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(false)
  const normalizedName = displayName.trim()
  const validName = isValidDisplayName(normalizedName)
  const newJourneyDialogRef = useModalFocus<HTMLFormElement>(
    newJourneyOpen,
    () => {
      if (!loading) setNewJourneyOpen(false)
    },
    { initialFocus: '#new-journey-display-name' },
  )

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (file) onFile(file)
    event.currentTarget.value = ''
  }

  function startJourney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNameTouched(true)
    if (loading || !available || !validName) return
    onStart(normalizedName)
  }

  return (
    <main className="title-page title-landing">
      <div className="landing-glow" aria-hidden="true" />
      <section className="landing-shell" aria-labelledby="game-title">
        <div className="landing-copy">
          <div className="landing-overline">
            <span>TRAVELLING BINGO · v0.10.1</span>
            {debugUnlocked && (
              <span className="landing-secret" role="status">
                门牌已亮
              </span>
            )}
          </div>

          <h1 className="landing-heading" id="game-title" aria-label="旅行饼狗">
            <button
              className="landing-logo"
              type="button"
              onClick={onTitleActivate}
              aria-label="旅行饼狗，连续激活五次可打开隐藏门牌"
            >
              旅行饼狗
            </button>
          </h1>

          <p className="landing-intro">和饼狗一起，从铲铲饼屋出发</p>

          <nav className="landing-social-links" aria-label="微博主页">
            <a
              href="https://www.weibo.com/u/7878664767"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="打开微博主页 7878664767"
            >
              <img
                src={publicAsset('assets/links/weibo-7878664767.jpg')}
                alt="微博用户 7878664767 的头像"
                width="180"
                height="180"
              />
            </a>
            <a
              href="https://weibo.com/7760819929"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="打开微博主页 7760819929"
            >
              <img
                src={publicAsset('assets/links/weibo-7760819929.jpg')}
                alt="微博用户 7760819929 的头像"
                width="180"
                height="180"
              />
            </a>
          </nav>

          <UpdateNoticeCard onOpen={() => setUpdateNoticeOpen(true)} />

          {importPreview && (
            <section className="landing-import" aria-label="存档摘要">
              <div className="landing-import__topline">
                <span className="landing-tag">找到回家的路</span>
                {importPreview.debug && <span className="landing-secret">门牌已亮</span>}
              </div>
              <strong className="landing-import__filename">{importPreview.fileName}</strong>
              <dl>
                <div>
                  <dt>你的称呼</dt>
                  <dd>{importPreview.displayName}</dd>
                </div>
                <div>
                  <dt>一起走过</dt>
                  <dd>
                    {importPreview.companionDays === 0
                      ? '今天刚见面'
                      : `${importPreview.companionDays} 天`}
                  </dd>
                </div>
                <div>
                  <dt>出发时间</dt>
                  <dd className="numeric-copy">{formatExportTime(importPreview.exportedAt)}</dd>
                </div>
                <div>
                  <dt>游戏版本</dt>
                  <dd className="numeric-copy">{importPreview.gameVersion}</dd>
                </div>
                <div>
                  <dt>背包里的🍎</dt>
                  <dd className="numeric-copy">
                    <AppleAmount value={importPreview.apples} />
                  </dd>
                </div>
                <div>
                  <dt>收藏</dt>
                  <dd>{importPreview.collectionCount} 件</dd>
                </div>
                <div>
                  <dt>现在</dt>
                  <dd>{importPreview.activityLabel}</dd>
                </div>
              </dl>
              <div className="landing-actions">
                <button
                  className="landing-button landing-button--primary"
                  type="button"
                  disabled={loading}
                  onClick={onConfirmImport}
                >
                  进入这次旅程
                </button>
                <button
                  className="landing-button landing-button--quiet"
                  type="button"
                  disabled={loading}
                  onClick={onCancelImport}
                >
                  换一个文件
                </button>
              </div>
            </section>
          )}

          <section className="landing-cache" aria-label="缓存存档摘要">
            {cachedPreview ? (
              <>
                <div>
                  <strong>{cachedPreview.displayName}</strong>
                  <span>
                    {cachedPreview.companionDays === 0
                      ? '今天刚见面'
                      : `一起走过 ${cachedPreview.companionDays} 天`}
                  </span>
                </div>
                <span className="numeric-copy">
                  <AppleAmount value={cachedPreview.apples} /> · {cachedPreview.collectionCount}{' '}
                  件收藏 · {formatExportTime(cachedPreview.updatedAt)}
                </span>
              </>
            ) : (
              <span>这个浏览器里还没有缓存存档</span>
            )}
          </section>

          <div className={`landing-new-game ${cachedPreview ? '' : 'landing-new-game--three'}`}>
            <nav className="landing-actions landing-actions--entries" aria-label="存档入口">
              {cachedPreview && (
                <button
                  className="landing-button landing-button--primary"
                  type="button"
                  disabled={loading || !available}
                  onClick={onContinueCached}
                >
                  继续
                </button>
              )}
              <button
                className={`landing-button ${cachedPreview ? 'landing-button--quiet' : 'landing-button--primary'}`}
                type="button"
                disabled={loading || !available}
                onClick={() => {
                  setNameTouched(false)
                  setNewJourneyOpen(true)
                }}
              >
                全新旅程
              </button>
              <label
                className="landing-button landing-button--quiet"
                aria-disabled={loading || !available}
              >
                本地存档
                <input
                  className="visually-hidden"
                  aria-label="本地存档"
                  type="file"
                  accept=".bingo,application/octet-stream,application/json"
                  disabled={loading || !available}
                  onChange={handleFile}
                />
              </label>
            </nav>
            <section className="landing-update" aria-label="检查游戏更新">
              <button
                className="landing-button landing-button--quiet landing-update__button"
                type="button"
                disabled={updateCheckStatus === 'checking'}
                onClick={onCheckForUpdates}
              >
                {updateCheckStatus === 'checking' ? '正在检查更新…' : '检查更新'}
              </button>
            </section>
          </div>

          {error && (
            <p className="landing-error" role="alert">
              {error}
            </p>
          )}
          {!available && !loading && error && (
            <button className="landing-retry" type="button" onClick={onRetryCatalog}>
              重新整理收藏目录
            </button>
          )}
        </div>

        <figure className="landing-scene" aria-label="铲铲饼屋预览">
          <div className="landing-scene__header" aria-hidden="true">
            <span className="landing-scene__label">铲铲饼屋</span>
            <span className="landing-scene__bingo">Bingo!</span>
          </div>
          <div className="landing-scene__frame">
            <picture>
              <source
                srcSet={`${publicAsset('assets/game/chan-chan-house-v2-768.webp')} 768w, ${publicAsset('assets/game/chan-chan-house-v2-1098.webp')} 1098w`}
                sizes="(max-width: 620px) 306px, (max-width: 1120px) 500px, min(40vw, 560px)"
              />
              <img
                src={publicAsset('assets/game/chan-chan-house-v2-1098.webp')}
                alt="阳光下温暖的两层铲铲饼屋"
                width="1098"
                height="1433"
                fetchPriority="high"
              />
            </picture>
          </div>
          <figcaption>苹果香飘到了门口，今天也很适合出发。</figcaption>
          <MascotSprite pose="idle" className="landing-mascot" />
        </figure>
      </section>

      {newJourneyOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!loading) setNewJourneyOpen(false)
          }}
        >
          <form
            ref={newJourneyDialogRef}
            className="small-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-journey-title"
            tabIndex={-1}
            noValidate
            onSubmit={startJourney}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="landing-tag">全新旅程</span>
            <h2 id="new-journey-title">开启一段全新的旅程</h2>
            <p>
              {cachedPreview
                ? '开始前会先下载当前浏览器缓存中的存档，下载完成后才会创建全新旅程。'
                : '先告诉饼狗该如何称呼你，再一起从铲铲饼屋出发。'}
            </p>
            <div className="landing-name-field">
              <input
                id="new-journey-display-name"
                type="text"
                value={displayName}
                autoComplete="nickname"
                placeholder="如何称呼你？"
                aria-label="如何称呼你？"
                aria-describedby="display-name-hint"
                aria-invalid={nameTouched && !validName}
                onChange={(event) => {
                  setDisplayName(event.currentTarget.value)
                  setNameTouched(true)
                }}
              />
            </div>
            <p
              className={`landing-name-hint ${nameTouched && !validName ? 'is-error' : ''}`}
              id="display-name-hint"
            >
              {nameTouched && !validName
                ? `请输入 1 到 ${MAX_DISPLAY_NAME_LENGTH} 个字符的称呼`
                : `最多 ${MAX_DISPLAY_NAME_LENGTH} 个字符，之后也会写进存档`}
            </p>
            <div className="landing-actions">
              <button
                className="landing-button landing-button--primary"
                type="submit"
                disabled={loading || !available}
              >
                {loading ? '正在准备饼屋…' : cachedPreview ? '下载存档并开始' : '开始全新旅程'}
              </button>
              <button
                className="landing-button landing-button--quiet"
                type="button"
                disabled={loading}
                onClick={() => setNewJourneyOpen(false)}
              >
                先不开始
              </button>
            </div>
          </form>
        </div>
      )}
      <UpdateNoticeDialog open={updateNoticeOpen} onClose={() => setUpdateNoticeOpen(false)} />
    </main>
  )
}
