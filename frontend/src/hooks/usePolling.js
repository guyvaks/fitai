import { useEffect, useRef } from 'react'

export function usePolling(fn, interval = 3000, active = true) {
  const savedFn = useRef(fn)
  useEffect(() => { savedFn.current = fn }, [fn])

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => savedFn.current(), interval)
    return () => clearInterval(id)
  }, [interval, active])
}
