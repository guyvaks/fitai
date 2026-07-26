import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Zap, Loader2 } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בהתחברות. נסה שוב.");
    } finally {
      setLoading(false);
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-text-mid text-sm">סיסמה</label>
                <Link to="/forgot-password" className="text-volt hover:underline text-sm font-medium">
                  שכחתי סיסמה
                </Link>
              </div>
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
              {loading ? "מתחבר..." : "התחבר"}
            </button>
          </form>

          <p className="text-center text-text-mid text-sm mt-6">
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
