import { useState, type ChangeEvent, type FormEvent } from 'react'

import { publicAsset } from '@/app/assets'
import { MascotSprite } from '@/components/MascotSprite'
import { isValidDisplayName, MAX_DISPLAY_NAME_LENGTH } from '@/domain'

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

interface TitleScreenProps {
  loading: boolean
  available: boolean
  error: string | null
  importPreview: ImportPreview | null
  debugUnlocked: boolean
  onStart: (displayName: string) => void
  onFile: (file: File) => void
  onConfirmImport: () => void
  onCancelImport: () => void
  onRetryCatalog: () => void
  onTitleActivate: () => void
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
  debugUnlocked,
  onStart,
  onFile,
  onConfirmImport,
  onCancelImport,
  onRetryCatalog,
  onTitleActivate,
}: TitleScreenProps) {
  const [displayName, setDisplayName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const normalizedName = displayName.trim()
  const validName = isValidDisplayName(normalizedName)

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
            <span>TRAVELLING BINGO</span>
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

          {importPreview ? (
            <section className="landing-import" aria-label="存档摘要">
              <div className="landing-import__topline">
                <span className="landing-tag">找到回家的路</span>
                {importPreview.debug && <span className="landing-secret">门牌已亮</span>}
              </div>
              <strong className="landing-import__filename">{importPreview.fileName}</strong>
              <dl>
                <div>
                  <dt>饼狗的称呼</dt>
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
                  <dt>背包里的🍎</dt>
                  <dd className="numeric-copy">{importPreview.apples}🍎</dd>
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
                  onClick={onConfirmImport}
                >
                  进入这次旅程
                </button>
                <button
                  className="landing-button landing-button--quiet"
                  type="button"
                  onClick={onCancelImport}
                >
                  换一个文件
                </button>
              </div>
            </section>
          ) : (
            <form className="landing-new-game" onSubmit={startJourney} noValidate>
              <label className="landing-name-field">
                <span>想让饼狗怎么称呼你？</span>
                <input
                  type="text"
                  value={displayName}
                  autoComplete="nickname"
                  placeholder="输入你的称呼"
                  aria-describedby="display-name-hint"
                  aria-invalid={nameTouched && !validName}
                  onChange={(event) => {
                    setDisplayName(event.currentTarget.value)
                    setNameTouched(true)
                  }}
                />
              </label>
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
                  {loading ? '正在准备饼屋…' : available ? '开始新旅程' : '收藏目录暂不可用'}
                </button>
                <label
                  className="landing-button landing-button--quiet"
                  aria-disabled={loading || !available}
                >
                  读取 .bingo 存档
                  <input
                    className="visually-hidden"
                    type="file"
                    accept=".bingo,application/octet-stream,application/json"
                    disabled={loading || !available}
                    onChange={handleFile}
                  />
                </label>
              </div>
            </form>
          )}

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
                sizes="(max-width: 620px) 306px, (max-width: 980px) 500px, min(40vw, 560px)"
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
    </main>
  )
}
