import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import './PianoKeyboard.css'
import { PIANO_NOTES, PIANO_OCTAVES, type PianoNote, type PianoNoteId } from './pianoNotes'

interface ActiveVoice {
  oscillators: OscillatorNode[]
  envelope: GainNode
}

interface PianoKeyboardProps {
  disabled?: boolean
  onNote?: (noteId: PianoNoteId) => void
}

type AudioContextConstructor = new () => AudioContext

const PIANO_HARMONICS = [
  { multiplier: 1, level: 0.72, type: 'triangle' },
  { multiplier: 2, level: 0.2, type: 'sine' },
  { multiplier: 3, level: 0.08, type: 'sine' },
] as const satisfies readonly {
  multiplier: number
  level: number
  type: OscillatorType
}[]

/** 相比原音量整体提高二分之一。 */
const PIANO_ATTACK_GAIN = 0.33
const PIANO_DECAY_GAIN = 0.1125

function audioContextConstructor(): AudioContextConstructor | undefined {
  const audioGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor
  }
  return globalThis.AudioContext ?? audioGlobal.webkitAudioContext
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

function isKeyboardAvailable(root: HTMLElement | null) {
  if (!root?.isConnected || root.closest('[inert], [hidden], [aria-hidden="true"]')) return false

  for (let element: HTMLElement | null = root; element; element = element.parentElement) {
    const style = globalThis.getComputedStyle(element)
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse'
    ) {
      return false
    }
  }

  return true
}

export function PianoKeyboard({ disabled = false, onNote }: PianoKeyboardProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const voicesRef = useRef(new Map<string, ActiveVoice>())
  const requestedRef = useRef(new Set<string>())
  const pointersRef = useRef(new Map<number, string>())
  const pulseTimersRef = useRef(new Map<string, ReturnType<typeof globalThis.setTimeout>>())
  const mountedRef = useRef(false)
  const disposedRef = useRef(false)
  const lifecycleVersionRef = useRef(0)
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set())
  const [audioError, setAudioError] = useState(false)

  const stopNote = useCallback((noteId: string) => {
    requestedRef.current.delete(noteId)
    const voice = voicesRef.current.get(noteId)
    if (!voice) return
    voicesRef.current.delete(noteId)
    const now = voice.envelope.context.currentTime
    voice.envelope.gain.cancelScheduledValues(now)
    voice.envelope.gain.setTargetAtTime(0.0001, now, 0.025)
    for (const oscillator of voice.oscillators) oscillator.stop(now + 0.12)
    if (!mountedRef.current || disposedRef.current) return
    setPressed((current) => {
      const next = new Set(current)
      next.delete(noteId)
      return next
    })
  }, [])

  const startNote = useCallback(
    async (note: PianoNote) => {
      if (
        disabled ||
        !isKeyboardAvailable(rootRef.current) ||
        !mountedRef.current ||
        disposedRef.current ||
        requestedRef.current.has(note.id) ||
        voicesRef.current.has(note.id)
      ) {
        return
      }

      const lifecycleVersion = lifecycleVersionRef.current
      const isCurrentLifecycle = () =>
        mountedRef.current &&
        !disposedRef.current &&
        lifecycleVersionRef.current === lifecycleVersion

      requestedRef.current.add(note.id)
      try {
        const Context = audioContextConstructor()
        if (!Context) throw new Error('AudioContext unavailable')
        const context = contextRef.current ?? new Context()
        contextRef.current = context
        if (context.state === 'suspended') {
          await context.resume()
          if (!isCurrentLifecycle()) return
        }
        if (
          !isCurrentLifecycle() ||
          !isKeyboardAvailable(rootRef.current) ||
          contextRef.current !== context ||
          !requestedRef.current.has(note.id) ||
          voicesRef.current.has(note.id)
        ) {
          return
        }

        const now = context.currentTime
        const envelope = context.createGain()
        envelope.gain.setValueAtTime(0.0001, now)
        envelope.gain.exponentialRampToValueAtTime(PIANO_ATTACK_GAIN, now + 0.008)
        envelope.gain.exponentialRampToValueAtTime(PIANO_DECAY_GAIN, now + 0.09)
        envelope.gain.setTargetAtTime(0.0001, now + 0.09, 0.32)
        envelope.connect(context.destination)

        const oscillators = PIANO_HARMONICS.map(({ multiplier, level, type }) => {
          const oscillator = context.createOscillator()
          const harmonicGain = context.createGain()
          oscillator.type = type
          oscillator.frequency.setValueAtTime(note.frequency * multiplier, now)
          harmonicGain.gain.setValueAtTime(level, now)
          oscillator.connect(harmonicGain)
          harmonicGain.connect(envelope)
          oscillator.start(now)
          return oscillator
        })

        voicesRef.current.set(note.id, { oscillators, envelope })
        setPressed((current) => new Set(current).add(note.id))
        setAudioError(false)
        onNote?.(note.id)
      } catch {
        requestedRef.current.delete(note.id)
        if (isCurrentLifecycle()) setAudioError(true)
      }
    },
    [disabled, onNote],
  )

  const pulseNote = useCallback(
    (note: PianoNote) => {
      void startNote(note)
      const previous = pulseTimersRef.current.get(note.id)
      if (previous !== undefined) globalThis.clearTimeout(previous)
      pulseTimersRef.current.set(
        note.id,
        globalThis.setTimeout(() => {
          pulseTimersRef.current.delete(note.id)
          stopNote(note.id)
        }, 220),
      )
    },
    [startNote, stopNote],
  )

  useEffect(() => {
    mountedRef.current = true
    disposedRef.current = false
    const pulseTimers = pulseTimersRef.current
    const voices = voicesRef.current
    const requested = requestedRef.current
    const pointers = pointersRef.current

    return () => {
      mountedRef.current = false
      disposedRef.current = true
      lifecycleVersionRef.current += 1

      for (const timer of pulseTimers.values()) globalThis.clearTimeout(timer)
      pulseTimers.clear()
      requested.clear()
      pointers.clear()

      for (const voice of voices.values()) {
        for (const oscillator of voice.oscillators) {
          try {
            oscillator.stop()
          } catch {
            // 已停止的音源无需再次处理。
          }
        }
      }
      voices.clear()

      const context = contextRef.current
      contextRef.current = null
      if (context) {
        try {
          void context.close().catch(() => undefined)
        } catch {
          // 已关闭的音频上下文无需再次处理。
        }
      }
    }
  }, [])

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (disabled || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
      if (isTypingTarget(event.target)) return
      if (!isKeyboardAvailable(rootRef.current)) return
      const note = PIANO_NOTES.find((candidate) => candidate.key === event.key.toLowerCase())
      if (!note) return
      event.preventDefault()
      void startNote(note)
    }

    function keyUp(event: KeyboardEvent) {
      const note = PIANO_NOTES.find((candidate) => candidate.key === event.key.toLowerCase())
      if (!note) return
      event.preventDefault()
      stopNote(note.id)
    }

    globalThis.addEventListener('keydown', keyDown)
    globalThis.addEventListener('keyup', keyUp)
    return () => {
      globalThis.removeEventListener('keydown', keyDown)
      globalThis.removeEventListener('keyup', keyUp)
    }
  }, [disabled, startNote, stopNote])

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>, note: PianoNote) {
    if (disabled || !isKeyboardAvailable(rootRef.current)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, note.id)
    void startNote(note)
  }

  function pointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const noteId = pointersRef.current.get(event.pointerId)
    if (!noteId) return
    pointersRef.current.delete(event.pointerId)
    stopNote(noteId)
  }

  return (
    <section ref={rootRef} className="piano" aria-labelledby="piano-title">
      <div className="piano__heading">
        <h3 id="piano-title">和饼狗弹一小段</h3>
        <small>电脑键盘只对应白键</small>
      </div>
      <p className="piano__hint">
        试着从 C6 B5 G5 E5 G5 C6 B5 G5 E5 G5 E5，C6 B5 G5 E5 G5 C6 D6 C6 D6 E6 E6 开始~
      </p>
      <div className="piano__rows">
        {PIANO_OCTAVES.map((octave) => {
          const octaveNotes = PIANO_NOTES.filter((note) => note.octave === octave)
          const whiteNotes = octaveNotes.filter((note) => !note.black)
          const blackNotes = octaveNotes.filter((note) => note.black)
          const firstKey = whiteNotes[0]!.key!.toUpperCase()
          const lastKey = whiteNotes[whiteNotes.length - 1]!.key!.toUpperCase()
          return (
            <div className="piano__row" data-octave={octave} key={octave}>
              <div className="piano__row-label" aria-hidden="true">
                <span>
                  C{octave}–B{octave}
                </span>
                <small>
                  {firstKey}–{lastKey}
                </small>
              </div>
              <div
                className="piano__keys"
                role="group"
                aria-label={`C${octave} 到 B${octave} 琴键`}
              >
                {whiteNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`piano-key piano-key--white ${pressed.has(note.id) ? 'is-pressed' : ''}`}
                    style={{ '--white-index': note.whiteIndex } as React.CSSProperties}
                    aria-label={`${note.id}，键盘 ${note.key?.toUpperCase()}`}
                    aria-pressed={pressed.has(note.id)}
                    disabled={disabled}
                    onPointerDown={(event) => pointerDown(event, note)}
                    onPointerUp={pointerEnd}
                    onPointerCancel={pointerEnd}
                    onLostPointerCapture={pointerEnd}
                    onClick={(event) => {
                      if (event.detail === 0) pulseNote(note)
                    }}
                  >
                    <span>{note.id}</span>
                    <small>{note.key?.toUpperCase()}</small>
                  </button>
                ))}
                {blackNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`piano-key piano-key--black ${pressed.has(note.id) ? 'is-pressed' : ''}`}
                    style={{ '--boundary-index': note.boundaryIndex } as React.CSSProperties}
                    aria-label={note.id}
                    aria-pressed={pressed.has(note.id)}
                    disabled={disabled}
                    onPointerDown={(event) => pointerDown(event, note)}
                    onPointerUp={pointerEnd}
                    onPointerCancel={pointerEnd}
                    onLostPointerCapture={pointerEnd}
                    onClick={(event) => {
                      if (event.detail === 0) pulseNote(note)
                    }}
                  >
                    <span>{note.id}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {audioError && (
        <p className="piano__error" role="status">
          电子琴暂时没有声音，请检查浏览器的声音权限。
        </p>
      )}
    </section>
  )
}
