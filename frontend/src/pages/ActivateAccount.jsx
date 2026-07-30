import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { authAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import UsernameField from "../components/UsernameField";

// Migration bridge for existing accounts that predate username-based login
// (username IS NULL). NOT the main /login route -- this is the one place
// besides forgot-access that still accepts email, and only for accounts
// that haven't chosen a username yet. Two phases in one page (local state,
// not two routes): email+password proves account ownership and returns a
// short-lived activation token; that token + a chosen username completes
// the migration and returns a real session in the same flow, no forced
// re-login. Once a username is set, phase 1 permanently stops accepting
// this account (self-closing door, enforced server-side).
export default function ActivateAccount() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [step, setStep] = useState("credentials"); // 'credentials' | 'username'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [activationToken, setActivationToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authAPI.activateAccount(email, password);
      setActivationToken(data.activation_token);
      setStep("username");
    } catch (err) {
      // Deliberately generic (matches the backend's own indistinguishable
      // message for unknown email / wrong password / already-migrated).
      setError(err.response?.data?.detail || "שגיאה בהפעלת החשבון. נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authAPI.activateSetUsername(activationToken, username);
      await loginWithToken(data.access_token);
      navigate("/dashboard");
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 410) {
        setError("החשבון כבר הופעל. נסה להתחבר עם שם המשתמש שבחרת.");
      } else {
        setError(detail || "שגיאה בשמירת שם המשתמש. נסה שוב.");
      }
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
          <p className="text-text-mid">הפעלת חשבון קיים</p>
        </div>

        <div className="card-glass p-8 anim-rise anim-d1">
          {step === "credentials" ? (
            <>
              <h2 className="text-xl font-bold text-text-hi mb-2">הפעלת חשבון</h2>
              <p className="text-text-mid text-sm mb-6">
                החשבון שלך עדיין לא כולל שם משתמש. הזן את האימייל והסיסמה שהיו לך כדי לבחור שם משתמש
                ולהמשיך.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCredentialsSubmit} className="space-y-4">
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
                  <label className="block text-text-mid text-sm mb-1.5">סיסמה</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="input-volt"
                    placeholder="••••••••"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "בודק..." : "המשך"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-text-hi mb-2">בחר/י שם משתמש</h2>
              <p className="text-text-mid text-sm mb-6">
                זה יהיה שם המשתמש שאיתו תיכנס/י מעכשיו במקום אימייל.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                <UsernameField value={username} onChange={setUsername} />
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "שומר..." : "סיום והפעלה"}
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
