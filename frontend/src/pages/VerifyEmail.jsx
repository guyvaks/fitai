import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Loader2, Fingerprint } from "lucide-react";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { isWebAuthnPlatformAvailable, runWebAuthnRegistration } from "../services/webauthn";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();

  // Register.jsx hands the email off via router state; a user who reloads
  // this page (losing that state) can still type it in manually below, or
  // arrive with ?email= if ever linked to directly.
  const [email, setEmail] = useState(location.state?.email || searchParams.get("email") || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // 'verify' -> 'webauthn-prompt' (only if the platform supports it) -> dashboard.
  const [step, setStep] = useState("verify");
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [webauthnBusy, setWebauthnBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isWebAuthnPlatformAvailable().then((available) => {
      if (!cancelled) setWebauthnSupported(available);
    });
    return () => { cancelled = true }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setResendMessage("");
    setLoading(true);
    try {
      const { data } = await authAPI.verifyEmail(email, code);
      await loginWithToken(data.access_token);
      // Session is now established, so a WebAuthn registration ceremony
      // (which needs an authenticated request to attach a credential to
      // this user) can run right here -- but only offer it if the platform
      // actually supports it, otherwise skip straight to the dashboard.
      if (webauthnSupported) {
        setStep("webauthn-prompt");
      } else {
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה באימות הקוד. נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  const handleEnableWebauthn = async () => {
    setWebauthnBusy(true);
    try {
      await runWebAuthnRegistration();
    } catch {
      // Never block dashboard access on this optional step -- a cancelled
      // or failed ceremony just means the user skips biometric login for
      // now, revisitable later in Settings.
    } finally {
      setWebauthnBusy(false);
      navigate("/dashboard");
    }
  };

  const handleResend = async () => {
    setError("");
    setResendMessage("");
    setResending(true);
    try {
      const { data } = await authAPI.resendVerification(email);
      setResendMessage(data.message);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בשליחת הקוד. נסה שוב.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 anim-rise">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <span className="w-11 h-11 rounded-2xl bg-volt flex items-center justify-center shadow-[0_0_28px_rgba(163,230,53,0.4)]">
              <Zap className="w-6 h-6 text-ink" fill="currentColor" strokeWidth={0} />
            </span>
            <h1 className="text-4xl font-extrabold text-text-hi tracking-tight" dir="ltr">
              Fit<span className="text-volt">AI</span>
            </h1>
          </div>
          <p className="text-text-mid">בדוק את המייל שלך</p>
        </div>

        {step === "webauthn-prompt" ? (
          <div className="card-glass p-8 anim-rise anim-d1 text-center">
            <Fingerprint className="w-10 h-10 text-volt mx-auto mb-3" />
            <h2 className="text-xl font-bold text-text-hi mb-2">הפעל כניסה עם Face ID / טביעת אצבע?</h2>
            <p className="text-text-mid text-sm mb-6">
              בפעם הבאה תוכל/י להיכנס בלי להקליד סיסמה. אפשר להפעיל את זה גם מאוחר יותר דרך ההגדרות.
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleEnableWebauthn}
                disabled={webauthnBusy}
                className="btn-volt w-full py-3 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
              >
                {webauthnBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                הפעל
              </button>
              <button
                type="button"
                onClick={() => navigate("/dashboard")}
                disabled={webauthnBusy}
                className="w-full py-3 text-sm rounded-elem border border-line text-text-mid hover:text-text-hi transition"
              >
                אולי מאוחר יותר
              </button>
            </div>
          </div>
        ) : (
        <div className="card-glass p-8 anim-rise anim-d1">
          <h2 className="text-xl font-bold text-text-hi mb-2">אימות כתובת מייל</h2>
          <p className="text-text-mid text-sm mb-6">
            שלחנו קוד אימות בן 6 ספרות לכתובת המייל שלך. הזן אותו כדי להשלים את ההרשמה.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
              {error}
            </div>
          )}
          {resendMessage && (
            <div className="mb-4 p-3 bg-volt-soft border border-volt/30 rounded-elem text-text-hi text-sm">
              {resendMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-text-mid text-sm mb-1.5">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-volt"
                placeholder="your@email.com"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-text-mid text-sm mb-1.5">קוד אימות</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                className="input-volt text-center tracking-[0.5em] text-lg font-bold"
                placeholder="000000"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "מאמת..." : "אמת קוד"}
            </button>
          </form>

          <p className="text-center text-text-mid text-sm mt-6">
            לא קיבלת קוד?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || !email}
              className="text-volt hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? "שולח..." : "שלח שוב"}
            </button>
          </p>

          <p className="text-center text-text-mid text-sm mt-2">
            <Link to="/login" className="text-volt hover:underline font-medium">
              חזרה להתחברות
            </Link>
          </p>
        </div>
        )}
      </div>
    </div>
  );
}
