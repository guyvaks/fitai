import { useState, useCallback, useEffect, useRef } from 'react'
import api from '../services/api'

// Two-tone completion chime, generated via Web Audio rather than a shipped
// audio file -- no asset to source/host. Browsers apply the device's
// silent/mute state to Web Audio output the same as any other audio source,
// so no special handling is needed for that.
function playRestEndChime(audioCtx) {
  const duration = 0.15
  const now = audioCtx.currentTime
  ;[880, 1108].forEach((freq, i) => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, now + i * duration)
    gain.gain.exponentialRampToValueAtTime(0.3, now + i * duration + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * duration + duration)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(now + i * duration)
    osc.stop(now + i * duration + duration)
  })
}

export function useWorkoutSession() {
  const [session, setSession] = useState(null)
  const [exercises, setExercises] = useState([])
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0)
  const [currentSetIdx, setCurrentSetIdx] = useState(0)
  const [restTimer, setRestTimer] = useState(0)
  const [restActive, setRestActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef(null)
  const audioCtxRef = useRef(null)

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      audioCtxRef.current = new AudioContextClass()
    }
    return audioCtxRef.current
  }

  useEffect(() => {
    return () => { audioCtxRef.current?.close().catch(() => {}) }
  }, [])

  // Start rest timer
  const startRestTimer = useCallback((seconds) => {
    // Resume/unlock the audio context here, inside the click handler chain
    // that triggers this (completeSet <- a button's onClick), so the
    // completion chime -- which fires later, asynchronously, once the
    // countdown reaches zero -- is allowed to play under browsers' autoplay
    // policies (audio contexts otherwise need a user-gesture call stack).
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    setRestTimer(seconds)
    setRestActive(true)
  }, [])

  useEffect(() => {
    if (restActive && restTimer > 0) {
      timerRef.current = setTimeout(() => setRestTimer(t => t - 1), 1000)
    } else if (restActive && restTimer === 0) {
      // Natural completion only -- skipRest() flips restActive/restTimer to
      // false/0 together in one batched update, so this branch never runs
      // for a manual skip, only when the countdown actually reaches zero.
      setRestActive(false)
      playRestEndChime(getAudioContext())
    }
    return () => clearTimeout(timerRef.current)
  }, [restActive, restTimer])

  const skipRest = useCallback(() => {
    setRestTimer(0)
    setRestActive(false)
  }, [])

  const addTime = useCallback((seconds) => {
    setRestTimer(t => t + seconds)
  }, [])

  const completeSet = useCallback(async (sessionId, exerciseIdx, setIdx, weightKg, reps, restSeconds, exerciseName, setType = 'normal', autoStartRest = true) => {
    setSaving(true)
    try {
      const { data } = await api.patch(`/api/v1/workouts/sessions/${sessionId}/set-complete`, {
        exercise_index: exerciseIdx,
        set_index: setIdx,
        weight_kg: weightKg,
        reps: reps,
        exercise_name: exerciseName,
        set_type: setType,
      })
      setSession(data)
      if (autoStartRest) startRestTimer(restSeconds)
    } finally {
      setSaving(false)
    }
  }, [startRestTimer])

  const startSession = useCallback(async (dayOfWeek) => {
    const { data } = await api.post(`/api/v1/workouts/sessions/start?day_of_week=${dayOfWeek}`)
    setSession(data)
    return data
  }, [])

  const completeSession = useCallback(async (sessionId) => {
    await api.post(`/api/v1/workouts/sessions/${sessionId}/complete`)
    setSession(null)
  }, [])

  return {
    session, exercises, setExercises,
    currentExerciseIdx, setCurrentExerciseIdx,
    currentSetIdx, setCurrentSetIdx,
    restTimer, restActive,
    saving,
    startRestTimer, skipRest, addTime,
    completeSet, startSession, completeSession,
  }
}
