// Spotify Authorization Code + PKCE flow — entirely client-side, no backend
// involvement needed (PKCE exists specifically so a public client/SPA can do
// the code exchange without a client secret). Personal-use feature only: see
// DESIGN.md §8 — Spotify's Development Mode caps this at 5 authorized users
// and there is no upgrade path for a solo project.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const SCOPES = 'streaming user-read-email user-read-private'
const REDIRECT_PATH = '/callback/spotify'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

const KEYS = {
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at',
  codeVerifier: 'spotify_code_verifier',
  authState: 'spotify_auth_state',
}

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return base64UrlEncode(bytes.buffer).slice(0, length)
}

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
}

function getRedirectUri() {
  return `${window.location.origin}${REDIRECT_PATH}`
}

function storeTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem(KEYS.accessToken, access_token)
  // Spotify's PKCE flow rotates refresh tokens but doesn't always return a
  // new one on every refresh -- keep the previous one when absent.
  if (refresh_token) localStorage.setItem(KEYS.refreshToken, refresh_token)
  localStorage.setItem(KEYS.expiresAt, String(Date.now() + expires_in * 1000))
}

export function isConnected() {
  return !!localStorage.getItem(KEYS.accessToken)
}

export function disconnect() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
}

// Kicks off the redirect to Spotify's authorize page. Verifier/state live in
// sessionStorage (not localStorage) since they're single-use and only need
// to survive the redirect round-trip, not persist across tabs/sessions.
export async function startAuth() {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured')
  const verifier = randomString(64)
  const state = randomString(32)
  const challenge = base64UrlEncode(await sha256(verifier))
  sessionStorage.setItem(KEYS.codeVerifier, verifier)
  sessionStorage.setItem(KEYS.authState, state)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleCallback(searchParams) {
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const authError = searchParams.get('error')

  const expectedState = sessionStorage.getItem(KEYS.authState)
  const verifier = sessionStorage.getItem(KEYS.codeVerifier)
  sessionStorage.removeItem(KEYS.authState)
  sessionStorage.removeItem(KEYS.codeVerifier)

  if (authError) throw new Error('החיבור ל-Spotify בוטל')
  if (!code || !state || state !== expectedState) throw new Error('תגובת אימות Spotify לא תקינה')
  if (!verifier) throw new Error('פג תוקף תהליך החיבור — נסה שוב')

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error('קבלת אישור מ-Spotify נכשלה')
  storeTokens(await res.json())
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(KEYS.refreshToken)
  if (!refreshToken) return null
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  })
  if (!res.ok) {
    disconnect()
    return null
  }
  const data = await res.json()
  storeTokens(data)
  return data.access_token
}

// Used as the Web Playback SDK's getOAuthToken callback -- returns a token
// guaranteed valid for at least another minute, refreshing first if not.
export async function getValidAccessToken() {
  const token = localStorage.getItem(KEYS.accessToken)
  const expiresAt = Number(localStorage.getItem(KEYS.expiresAt) || 0)
  if (token && Date.now() < expiresAt - 60_000) return token
  return refreshAccessToken()
}
