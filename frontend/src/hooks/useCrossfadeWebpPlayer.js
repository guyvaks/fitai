import { useEffect, useRef, useState } from 'react'

// Reusable player for FitAI's animated-exercise webp files (7 frames, 4 key
// poses + a return path -- see the media audit). A hard cut between frames
// reads as choppy given how few unique poses there are; this instead
// continuously cross-fades from each frame into the next across that
// frame's full (speed-scaled) hold time, decoded once up front so playback
// is a pure per-rAF-tick canvas draw -- no per-frame decode calls, no
// setTimeout drift, ties to the browser's actual refresh rate.
//
// Deliberately not a "true" motion interpolation: a cross-fade between two
// static poses is a dissolve, not biomechanically accurate in-between
// motion. Real optical-flow interpolation was considered and rejected for
// this content -- it needs small per-frame displacement to work well, and
// large-motion exercises (Thruster, Deadlift, jumps) are exactly where that
// assumption breaks hardest, so it would fail worst on the cases that need
// help most. No skeletal/joint data exists in these assets either, so a
// pose-aware interpolation isn't available without a full asset
// regeneration project (out of scope here).
//
// Instead: (1) ease each cross-fade (smoothstep) instead of linear alpha,
// and (2) measure how visually different each pair of consecutive frames
// actually is (cheap downsampled pixel-diff, computed once at decode time,
// not per playback frame) and stretch that specific transition's duration
// proportionally. Large-motion transitions (Thruster, Deadlift, jumps) get
// more time to dissolve; small-motion ones (an isolation curl, a plank
// hold) stay at the baseline speed -- instead of a single fixed multiplier
// treating every exercise's motion as equally large.
//
// speed: multiplier applied to each frame's authored duration (3 = 3x
// slower than the source file's native 1400ms/loop) before the amplitude
// stretch is applied on top. Intentionally a single fixed constant passed
// by the caller, not a user-facing control.
const AMPLITUDE_SAMPLE_SIZE = 40 // px, small+cheap -- just needs a change signal, not fidelity
// Calibrated against real measured diffs at this sample size, not guessed:
// Plank (near-static hold) ~1.5k-20k, Bicep Curl (isolation) ~42k-58k,
// Thruster/single-leg RDL (full-body, large ROM) ~80k-130k.
const AMPLITUDE_MIN = 20_000 // diff sum below this: no stretch (near-static holds)
const AMPLITUDE_MAX = 120_000 // diff sum at/above this: full stretch (large compound movements)
const MAX_STRETCH = 1.0 // up to +100% duration at AMPLITUDE_MAX

function easeInOut(t) {
  return t * t * (3 - 2 * t) // smoothstep
}

function pixelDiff(ctx, bitmapA, bitmapB, size) {
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(bitmapA, 0, 0, size, size)
  const a = ctx.getImageData(0, 0, size, size).data
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(bitmapB, 0, 0, size, size)
  const b = ctx.getImageData(0, 0, size, size).data
  let sum = 0
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
  }
  return sum
}

function amplitudeStretchFactor(diff) {
  const clamped = Math.max(AMPLITUDE_MIN, Math.min(AMPLITUDE_MAX, diff))
  const frac = (clamped - AMPLITUDE_MIN) / (AMPLITUDE_MAX - AMPLITUDE_MIN)
  return 1 + MAX_STRETCH * frac
}

export function useCrossfadeWebpPlayer(canvasRef, src, { playing = true, speed = 1 } = {}) {
  const [state, setState] = useState({ ready: false, error: null })
  const playingRef = useRef(playing)
  playingRef.current = playing

  useEffect(() => {
    if (!('ImageDecoder' in window)) {
      setState({ ready: false, error: 'unsupported' })
      return
    }

    let cancelled = false
    let rafId = null
    let bitmaps = []

    async function run() {
      const res = await fetch(src)
      const buf = await res.arrayBuffer()
      if (cancelled) return

      const decoder = new window.ImageDecoder({ data: buf, type: 'image/webp' })
      await decoder.tracks.ready
      if (cancelled) { decoder.close(); return }
      const frameCount = decoder.tracks.selectedTrack.frameCount

      const frames = []
      for (let i = 0; i < frameCount; i++) {
        const { image } = await decoder.decode({ frameIndex: i })
        if (cancelled) { image.close(); decoder.close(); return }
        const bitmap = await createImageBitmap(image)
        const durationMs = (image.duration ?? 150000) / 1000 // authored, unscaled
        image.close()
        frames.push({ bitmap, durationMs })
      }
      decoder.close()
      bitmaps = frames.map(f => f.bitmap)
      if (cancelled) { bitmaps.forEach(b => b.close()); return }

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      canvas.width = frames[0].bitmap.width
      canvas.height = frames[0].bitmap.height

      // Per-transition amplitude -> stretch factor, computed once here (not
      // in the playback loop). ampCanvas is a tiny offscreen scratch buffer,
      // reused across all 7 comparisons.
      const ampCanvas = document.createElement('canvas')
      ampCanvas.width = AMPLITUDE_SAMPLE_SIZE
      ampCanvas.height = AMPLITUDE_SAMPLE_SIZE
      const ampCtx = ampCanvas.getContext('2d', { willReadFrequently: true })

      for (let i = 0; i < frames.length; i++) {
        const next = frames[(i + 1) % frames.length]
        const diff = pixelDiff(ampCtx, frames[i].bitmap, next.bitmap, AMPLITUDE_SAMPLE_SIZE)
        frames[i].effectiveDurationMs = frames[i].durationMs * speed * amplitudeStretchFactor(diff)
      }

      const cumulative = [0]
      for (const f of frames) cumulative.push(cumulative[cumulative.length - 1] + f.effectiveDurationMs)
      const totalLoopMs = cumulative[cumulative.length - 1]

      let elapsed = 0
      let lastTs = null

      const tick = (ts) => {
        if (cancelled) return
        if (lastTs == null) lastTs = ts
        const dt = ts - lastTs
        lastTs = ts

        if (playingRef.current) {
          elapsed = (elapsed + dt) % totalLoopMs
        }

        let i = frames.length - 1
        for (let k = 0; k < frames.length; k++) {
          if (elapsed >= cumulative[k] && elapsed < cumulative[k + 1]) { i = k; break }
        }
        const t = easeInOut((elapsed - cumulative[i]) / frames[i].effectiveDurationMs)
        const next = (i + 1) % frames.length

        ctx.globalAlpha = 1 - t
        ctx.drawImage(frames[i].bitmap, 0, 0)
        ctx.globalAlpha = t
        ctx.drawImage(frames[next].bitmap, 0, 0)
        ctx.globalAlpha = 1

        rafId = requestAnimationFrame(tick)
      }

      setState({ ready: true, error: null })
      rafId = requestAnimationFrame(tick)
    }

    run().catch(err => { if (!cancelled) setState({ ready: false, error: String(err) }) })

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      bitmaps.forEach(b => b.close?.())
    }
  }, [src, canvasRef, speed])

  return state
}
