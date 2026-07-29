import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { isWebAuthnPlatformAvailable } from "../services/webauthn";
import { Zap, Loader2, Fingerprint } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithToken } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [webauthnSupported, setWebauthnSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isWebAuthnPlatformAvailable().then((available) => {
      if (!cancelled) setWebauthnSupported(available);
    });
    return () => { cancelled = true }
  }, []);

  const handleAuthError = (err) => {
    const detail = err.response?.data?.detail;
    // The unverified-email case is a structured {error_type, message, email}
    // object (distinct from the plain-string wrong-credentials error) so it
    // can be routed to the verify screen instead of just displayed. `email`
    // is included by the backend (safe -- only reachable post-password-check)
    // so this screen doesn't need to ask the user to retype it.
    if (detail && typeof detail === "object" && detail.error_type === "EMAIL_NOT_VERIFIED") {
      setError(detail.message);
      setNeedsVerification(true);
      setVerificationEmail(detail.email || "");
    } else {
      setError((typeof detail === "string" && detail) || "שגיאה בהתחברות. נסה שוב.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleWebauthnLogin = async () => {
    if (!username.trim()) {
      setError("הזן שם משתמש כדי להיכנס עם Face ID / טביעת אצבע");
      return;
    }
    setError("");
    setNeedsVerification(false);
    setWebauthnLoading(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const { data: optionsData } = await authAPI.webauthnLoginOptions(username);
      const assertion = await startAuthentication({ optionsJSON: optionsData.options });
      const { data } = await authAPI.webauthnLoginVerify(username, optionsData.challenge_token, assertion);
      await loginWithToken(data.access_token);
      navigate("/dashboard");
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        // User cancelled the biometric prompt -- not a real error, just quietly stop.
      } else {
        handleAuthError(err);
      }
    } finally {
      setWebauthnLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8 anim-rise">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <span className="w-11 h-11 rounded-2xl bg-volt flex items-center justify-center shadow-[0_0_28px_rgba(163,230,53,0.4)]">
              <Zap className="w-6 h-6 text-ink" fill="currentColor" strokeWidth={0} />
            </span>
            <h1 className="text-4xl font-extrabold text-text-hi tracking-tight" dir="ltr">
              Fit<span className="text-volt">AI</span>
            </h1>
          </div>
          <p className="text-text-mid">המאמן החכם שלך לכושר ותזונה</p>
        </div>

        {/* Card */}
        <div className="card-glass p-8 anim-rise anim-d1">
          <h2 className="text-xl font-bold text-text-hi mb-6">התחברות</h2>

          {error && (
            <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
              {error}
              {needsVerification && (
                <>
                  {" "}
                  <Link
                    to="/verify-email"
                    state={{ email: verificationEmail }}
                    className="underline font-medium"
                  >
                    לאימות המייל
                  </Link>
                  .
                </>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-text-mid text-sm mb-1.5">שם משתמש</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="input-volt"
                placeholder="שם משתמש"
                autoComplete="username"
                dir="auto"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-text-mid text-sm">סיסמה</label>
                <Link to="/forgot-access" className="text-volt hover:underline text-sm font-medium">
                  שכחתי שם משתמש / סיסמה
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-volt"
                placeholder="••••••••"
                autoComplete="current-password"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loading || webauthnLoading}
              className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "מתחבר..." : "התחבר"}
            </button>
          </form>

          {webauthnSupported && (
            <button
              type="button"
              onClick={handleWebauthnLogin}
              disabled={loading || webauthnLoading}
              className="w-full py-3 mt-3 text-sm rounded-elem border border-line text-text-mid hover:text-text-hi hover:bg-white/6 transition flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {webauthnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              כניסה עם Face ID / טביעת אצבע
            </button>
          )}

          <p className="text-center text-text-mid text-sm mt-6">
            עדיין לא בחרת שם משתמש?{" "}
            <Link to="/activate-account" className="text-volt hover:underline font-medium">
              הפעל את החשבון
            </Link>
          </p>

          <p className="text-center text-text-mid text-sm mt-2">
            אין לך חשבון?{" "}
            <Link to="/register" className="text-volt hover:underline font-medium">
              הצטרף עכשיו
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
