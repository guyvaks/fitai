import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";

function ResetPasswordModal({ user, onClose, onSuccess }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 4) { setError("סיסמה חייבת להכיל לפחות 4 תווים"); return; }
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/api/v1/admin/users/${user.id}/reset-password`, { new_password: password });
      onSuccess();
      onClose();
    } catch {
      setError("שגיאה בעדכון הסיסמה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-slate-700 rounded-elem p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-text-main font-bold text-lg mb-1">🔑 איפוס סיסמה</h2>
        <p className="text-text-muted text-sm mb-4">{user.full_name} ({user.email})</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="סיסמה חדשה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full bg-background border border-slate-600 rounded-elem px-3 py-2 text-text-main text-sm focus:outline-none focus:border-primary"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text-main transition-colors">
              בטל
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-primary text-white rounded-elem hover:opacity-90 disabled:opacity-50 transition-opacity">
              {loading ? "מעדכן..." : "אשר"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const fetchUsers = () => {
    setLoading(true);
    api.get("/api/v1/admin/users")
      .then(({ data }) => setUsers(data))
      .catch(() => setError("אין גישה או שגיאת שרת"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async (u) => {
    if (!window.confirm(`למחוק את המשתמש "${u.full_name}" (${u.email})?\nפעולה זו אינה ניתנת לביטול.`)) return;
    setActionLoading(u.id);
    try {
      await api.delete(`/api/v1/admin/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch {
      alert("שגיאה במחיקת המשתמש");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAdmin = async (u) => {
    const action = u.is_admin ? "הסרת" : "הענקת";
    if (!window.confirm(`${action} הרשאות אדמין למשתמש "${u.full_name}"?`)) return;
    setActionLoading(u.id);
    try {
      const { data } = await api.patch(`/api/v1/admin/users/${u.id}/toggle-admin`);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_admin: data.is_admin } : x));
    } catch {
      alert("שגיאה בעדכון הרשאות");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="p-6 text-text-muted">טוען...</div>;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-text-main mb-6">ניהול משתמשים 👑</h1>
      <div className="bg-surface rounded-elem border border-slate-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700 text-text-muted">
            <tr>
              <th className="px-4 py-3 text-right">שם</th>
              <th className="px-4 py-3 text-right">אימייל</th>
              <th className="px-4 py-3 text-right">הצטרף</th>
              <th className="px-4 py-3 text-center">אדמין</th>
              <th className="px-4 py-3 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id;
              const busy = actionLoading === u.id;
              return (
                <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                  <td className="px-4 py-3 text-text-main font-medium">
                    {u.full_name}
                    {isMe && <span className="mr-2 text-xs text-primary">(אני)</span>}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {new Date(u.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_admin ? <span className="text-yellow-400">👑</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        onClick={() => setResetTarget(u)}
                        disabled={busy}
                        className="text-xs px-2 py-1 rounded border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        🔑 סיסמה
                      </button>
                      <button
                        onClick={() => handleToggleAdmin(u)}
                        disabled={busy || isMe}
                        className="text-xs px-2 py-1 rounded border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {u.is_admin ? "הסר 👑" : "אדמין 👑"}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={busy || isMe}
                        className="text-xs px-2 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {busy ? "..." : "מחק 🗑️"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-text-muted text-xs">{users.length} משתמשים סה"כ</p>

      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSuccess={() => alert(`סיסמה עודכנה בהצלחה עבור ${resetTarget.full_name}`)}
        />
      )}
    </div>
  );
}
