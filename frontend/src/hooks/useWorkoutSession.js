import { useState, useCallback, useEffect, useRef } from 'react'
import api from '../services/api'

export function useWorkoutSession() {
  const [session, setSession] = useState(null)
  const [exercises, setExercises] = useState([])
  const [currentExerciseIdx, setCurrentExerciseIdx] = useState(0)
  const [currentSetIdx, setCurrentSetIdx] = useState(0)
  const [restTimer, setRestTimer] = useState(0)
  const [restActive, setRestActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef(null)

  // Start rest timer
  const startRestTimer = useCallback((seconds) => {
    setRestTimer(seconds)
    setRestActive(true)
  }, [])

  useEffect(() => {
    if (restActive && restTimer > 0) {
      timerRef.current = setTimeout(() => setRestTimer(t => t - 1), 1000)
    } else if (restActive && restTimer === 0) {
      setRestActive(false)
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

  const completeSet = useCallback(async (sessionId, exerciseIdx, setIdx, weightKg, reps, restSeconds, exerciseName) => {
    setSaving(true)
    try {
      const { data } = await api.patch(`/api/v1/workouts/sessions/${sessionId}/set-complete`, {
        exercise_index: exerciseIdx,
        set_index: setIdx,
        weight_kg: weightKg,
        reps: reps,
        exercise_name: exerciseName,
      })
      setSession(data)
      startRestTimer(restSeconds)
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
