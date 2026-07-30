import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";
import { authAPI } from "../services/api";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה באיפוס הסיסמה. נסה שוב.");
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
          <p className="text-text-mid">בחירת סיסמה חדשה</p>
        </div>

        <div className="card-glass p-8 anim-rise anim-d1">
          <h2 className="text-xl font-bold text-text-hi mb-6">איפוס סיסמה</h2>

          {!token ? (
            <div className="p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
              קישור האיפוס אינו תקין. בקש קישור חדש דרך{" "}
              <Link to="/forgot-access" className="underline font-medium">
                שכחתי סיסמה
              </Link>
              .
            </div>
          ) : success ? (
            <div className="p-3 bg-volt-soft border border-volt/30 rounded-elem text-text-hi text-sm">
              הסיסמה עודכנה בהצלחה. מעביר אותך להתחברות...
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
                  {error}
                  {error === "קישור האיפוס אינו תקין או שפג תוקפו" && (
                    <>
                      {" "}
                      בקש{" "}
                      <Link to="/forgot-access" className="underline font-medium">
                        קישור חדש
                      </Link>
                      .
                    </>
                  )}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-text-mid text-sm mb-1.5">סיסמה חדשה</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="input-volt"
                    placeholder="לפחות 6 תווים"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-text-mid text-sm mb-1.5">אימות סיסמה</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="input-volt"
                    placeholder="הקלד שוב את הסיסמה"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "מעדכן..." : "עדכן סיסמה"}
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
