import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Zap, Loader2 } from "lucide-react";

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, fullName);
      navigate("/dashboard");
    } catch (err) {
      const msg = err.response?.data?.detail;
      if (msg === "Email already registered") {
        setError("האימייל הזה כבר רשום במערכת");
      } else {
        setError("שגיאה בהרשמה. נסה שוב.");
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
          <p className="text-text-mid">הצטרף למסע שלך לכושר ובריאות</p>
        </div>

        <div className="card-glass p-8 anim-rise anim-d1">
          <h2 className="text-xl font-bold text-text-hi mb-6">הצטרף עכשיו</h2>

          {error && (
            <div className="mb-4 p-3 bg-coral-soft border border-coral/30 rounded-elem text-coral text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-text-mid text-sm mb-1.5">שם מלא</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="input-volt"
                placeholder="ישראל ישראלי"
              />
            </div>
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
                minLength={6}
                className="input-volt"
                placeholder="לפחות 6 תווים"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-volt w-full py-3 mt-2 text-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "נרשם..." : "הצטרף עכשיו"}
            </button>
          </form>

          <p className="text-center text-text-mid text-sm mt-6">
            כבר יש לי חשבון?{" "}
            <Link to="/login" className="text-volt hover:underline font-medium">
              התחבר
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
