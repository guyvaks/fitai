import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authAPI } from "../services/api";
import { isConditionalMediationAvailable, isWebAuthnPlatformAvailable } from "../services/webauthn";
import { Zap, Loader2, Fingerprint, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login, loginWithToken } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const conditionalAttempted = useRef(false);

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

  // Shared by the explicit biometric button and the conditional-autofill
  // attempt below -- both end with "we have a signed assertion + the
  // challenge token it answers, turn that into a session." Deliberately
  // never sends a username: the assertion's credential ID is what the
  // backend resolves the account from (standard discoverable-credential
  // pattern), so there's nothing to type first either way.
  const completeWebauthnLogin = async (assertion, challengeToken) => {
    const { data } = await authAPI.webauthnLoginVerify(undefined, challengeToken, assertion);
    await loginWithToken(data.access_token);
    navigate("/dashboard");
  };

  useEffect(() => {
    let cancelled = false;
    isWebAuthnPlatformAvailable().then((available) => {
      if (!cancelled) setWebauthnSupported(available);
    });
    return () => { cancelled = true }
  }, []);

  // Conditional UI (autofill-style) discoverable-credential login: arms the
  // username field's native autofill dropdown with a passkey suggestion as
  // soon as the page loads -- no click, no typed username. This is the
  // "proactive" half of the fix; the explicit button below is the fallback
  // for browsers that support platform authenticators but not conditional
  // mediation. Fires at most once per mount; a resolved or rejected attempt
  // (browser doesn't actually support it despite the capability check, user
  // picked a password-manager entry instead, etc.) is never retried --
  // falling through to typing a username/password normally is always fine.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (conditionalAttempted.current) return;
      if (!(await isConditionalMediationAvailable())) return;
      conditionalAttempted.current = true;
      try {
        const { startAuthentication } = await import("@simplewebauthn/browser");
        const { data: optionsData } = await authAPI.webauthnLoginOptions();
        const assertion = await startAuthentication({
          optionsJSON: optionsData.options,
          useBrowserAutofill: true,
        });
        if (cancelled) return;
        await completeWebauthnLogin(assertion, optionsData.challenge_token);
      } catch {
        // No explicit "not available after all" signal from the API here --
        // any failure just means conditional login didn't happen this time.
      }
    })();
    return () => { cancelled = true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setError("");
    setNeedsVerification(false);
    setWebauthnLoading(true);
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      // If a username happens to already be typed, pass it along purely as
      // an optional narrowing hint (the browser then only offers that
      // account's credential) -- but it's never required: omitted, the
      // authenticator surfaces whichever resident credential fits this
      // site, and completeWebauthnLogin resolves the account from the
      // assertion itself either way.
      const { data: optionsData } = await authAPI.webauthnLoginOptions(username.trim() || undefined);
      const assertion = await startAuthentication({ optionsJSON: optionsData.options });
      await completeWebauthnLogin(assertion, optionsData.challenge_token);
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

          {/* Biometric login is offered first and stands entirely on its
              own -- it must never require the username field below to be
              filled in first, that would defeat the point of "skip manual
              identification." */}
          {webauthnSupported && (
            <button
              type="button"
              onClick={handleWebauthnLogin}
              disabled={loading || webauthnLoading}
              className="btn-volt w-full py-3 mb-4 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {webauthnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              כניסה עם Face ID / טביעת אצבע
            </button>
          )}

          {webauthnSupported && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-line" />
              <span className="text-text-low text-xs">או</span>
              <div className="flex-1 h-px bg-line" />
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
                // "webauthn" alongside "username" is what lets a browser
                // that supports conditional mediation attach the passkey
                // autofill suggestion to this specific field.
                autoComplete="username webauthn"
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input-volt"
                  // .input-volt's own `padding` shorthand (index.css) wins over a
                  // pr-10 utility class at equal specificity/source order, so the
                  // toggle button's reserved space has to be forced via inline
                  // style instead of relying on the utility-class cascade -- same
                  // pattern as UsernameField.jsx's status icon.
                  style={{ paddingRight: "2.5rem" }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-mid hover:text-text-hi transition"
                  aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
