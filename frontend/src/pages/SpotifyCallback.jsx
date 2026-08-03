import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Music } from 'lucide-react'
import { handleCallback } from '../services/spotifyAuth'

// Landing page for Spotify's OAuth redirect -- exchanges the ?code= for
// tokens (PKCE, no backend involved) and bounces back into the live-workout
// screen. Not wrapped in the app's Layout/ProtectedRoute: it's a brief
// pass-through, not a real screen, and doesn't need FitAI's own auth context.
export default function SpotifyCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState(null)

  useEffect(() => {
    handleCallback(searchParams)
      .then(() => navigate('/live-workout', { replace: true }))
      .catch(e => setError(e.message || 'החיבור ל-Spotify נכשל'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-background px-6 text-center" dir="rtl">
      {error ? (
        <>
          <Music className="w-8 h-8 text-coral" />
          <p className="text-text-hi font-bold">{error}</p>
          <button
            onClick={() => navigate('/live-workout', { replace: true })}
            className="btn-volt btn-pill px-6 py-2.5 text-sm"
          >
            חזרה לאימון
          </button>
        </>
      ) : (
        <>
          <Loader2 className="w-6 h-6 animate-spin text-volt" />
          <p className="text-text-mid text-sm">מתחבר ל-Spotify...</p>
        </>
      )}
    </div>
  )
}
