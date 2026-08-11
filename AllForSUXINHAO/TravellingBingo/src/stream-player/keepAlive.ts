function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

/** 生成一秒几乎无声的本地 WAV，不依赖任何跨站资源。 */
function createQuietWav() {
  const sampleRate = 8_000
  const sampleCount = sampleRate
  const bytesPerSample = 2
  const dataLength = sampleCount * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataLength, true)
  for (let index = 0; index < sampleCount; index += 1) {
    view.setInt16(44 + index * bytesPerSample, index % 2 === 0 ? 1 : -1, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function startKeepAliveAudio() {
  if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return () => {}

  const source = URL.createObjectURL(createQuietWav())
  const audio = new Audio(source)
  audio.loop = true
  audio.volume = 0.01
  audio.preload = 'auto'
  let disposed = false

  const removeRetry = () => document.removeEventListener('pointerdown', attemptPlay)
  const attemptPlay = () => {
    if (disposed) return
    const playback = audio.play()
    if (playback === undefined) return
    void playback.then(removeRetry).catch(() => undefined)
  }

  document.addEventListener('pointerdown', attemptPlay)
  attemptPlay()

  return () => {
    disposed = true
    removeRetry()
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    URL.revokeObjectURL(source)
  }
}
