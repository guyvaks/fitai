import { useState } from "react";
import { Link } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { authAPI } from "../services/api";

// Combined "forgot username / forgot password" entry point -- one field,
// one generic message, no branching UI. The backend's forgot-access email
// (if the account exists) always includes both the username reminder and
// the password-reset link, so there's nothing for this screen to ask beyond
// the email address. Renamed from ForgotPassword.jsx.
export default function ForgotAccess() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authAPI.forgotAccess(email);
      // Always show the same generic outcome regardless of whether the
      // email exists -- the backend already returns one message either
      // way, but the request itself could also fail (rate limit, network),
      // which we do want to surface distinctly, below.
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בשליחת הבקשה. נסה שוב.");
    } finally {
      setLoading(false);
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
          <p className="text-text-mid">שחזור גישה</p>
        </div>

        <div className="card-glass p-8 anim-rise anim-d1">
          <h2 className="text-xl font-bold text-text-hi mb-6">שכחתי שם משתמש / סיסמה</h2>

          {submitted ? (
            <div className="p-3 bg-volt-soft border border-volt/30 rounded-elem text-text-hi text-sm">
              אם קיים חשבון עם כתובת זו, נשלח אליו אימייל עם שם המשתמש וקישור לאיפוס הסיסמה. בדוק את
              תיבת הדואר שלך.
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
                  {error}
                </div>
              )}
              <p className="text-text-mid text-sm mb-4">
                הזן את כתובת האימייל שלך ונשלח אליך תזכורת לשם המשתמש וקישור לאיפוס הסיסמה.
              </p>
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
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "שולח..." : "שלח"}
                </button>
              </form>
            </>
          )}

          <p className="text-center text-text-mid text-sm mt-6">
            <Link to="/login" className="text-volt hover:underline font-medium">
              חזרה להתחברות
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
