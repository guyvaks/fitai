import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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
      const msg = err.response?.data?.detail;
      if (msg === "Incorrect email or password") {
        setError("אימייל או סיסמה שגויים");
      } else {
        setError("שגיאה בהתחברות. נסה שוב.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-accent-blue mb-2">FitAI</h1>
          <p className="text-dark-text-muted">המאמן החכם שלך לכושר ותזונה</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-light-border rounded-card p-8 shadow-lg">
          <h2 className="text-xl font-semibold text-dark-text mb-6">התחברות</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-dark-text-muted text-sm mb-1">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white border border-light-border rounded-lg px-4 py-3 text-dark-text placeholder-dark-text-muted focus:outline-none focus:border-accent-blue transition-colors"
                placeholder="your@email.com"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-dark-text-muted text-sm mb-1">סיסמה</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-white border border-light-border rounded-lg px-4 py-3 text-dark-text placeholder-dark-text-muted focus:outline-none focus:border-accent-blue transition-colors"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors mt-2 shadow-sm"
            >
              {loading ? "מתחבר..." : "התחבר"}
            </button>
          </form>

          <p className="text-center text-dark-text-muted text-sm mt-6">
            אין לך חשבון?{" "}
            <Link to="/register" className="text-accent-blue hover:underline">
              הצטרף עכשיו
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
