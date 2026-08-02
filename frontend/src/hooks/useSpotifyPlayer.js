import { useEffect, useRef, useState, useCallback } from 'react'
import { getValidAccessToken, isConnected } from '../services/spotifyAuth'

// The SDK script + its onSpotifyWebPlaybackSDKReady global callback are
// shared browser-wide state -- load once and reuse across remounts (e.g.
// LiveWorkout unmounting/remounting on navigation) instead of re-injecting
// the script tag every time.
let sdkLoadPromise = null
function loadSpotifySdk() {
  if (window.Spotify) return Promise.resolve()
  if (sdkLoadPromise) return sdkLoadPromise
  sdkLoadPromise = new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => reject(new Error('טעינת נגן Spotify נכשלה'))
    document.body.appendChild(script)
  })
  return sdkLoadPromise
}

// Wraps the Spotify Web Playback SDK as a React hook. Only initializes a
// player if the user has already completed the OAuth flow (isConnected());
// LiveWorkout.jsx is responsible for showing a "connect" prompt otherwise.
export function useSpotifyPlayer() {
  const [ready, setReady] = useState(false)
  const [track, setTrack] = useState(null)
  const [isPaused, setIsPaused] = useState(true)
  const [error, setError] = useState(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!isConnected()) return
    let cancelled = false

    loadSpotifySdk()
      .then(() => {
        if (cancelled) return
        const player = new window.Spotify.Player({
          name: 'FitAI — אימון חי',
          getOAuthToken: cb => getValidAccessToken().then(token => cb(token)),
          volume: 0.7,
        })
        playerRef.current = player

        player.addListener('ready', () => setReady(true))
        player.addListener('not_ready', () => setReady(false))
        player.addListener('player_state_changed', state => {
          if (!state) return
          setIsPaused(state.paused)
          const current = state.track_window?.current_track
          setTrack(current ? {
            name: current.name,
            artists: current.artists.map(a => a.name).join(', '),
            image: current.album?.images?.[0]?.url,
          } : null)
        })
        player.addListener('initialization_error', ({ message }) => setError(message))
        player.addListener('authentication_error', () => setError('אימות Spotify נכשל — התחבר שוב'))
        player.addListener('account_error', () => setError('נדרש חשבון Spotify Premium להשמעה'))
        player.addListener('playback_error', ({ message }) => setError(message))

        player.connect()
      })
      .catch(e => setError(e.message))

    return () => {
      cancelled = true
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [])

  const togglePlay = useCallback(() => playerRef.current?.togglePlay(), [])
  const nextTrack = useCallback(() => playerRef.current?.nextTrack(), [])
  const previousTrack = useCallback(() => playerRef.current?.previousTrack(), [])

  return { ready, track, isPaused, error, togglePlay, nextTrack, previousTrack }
}
