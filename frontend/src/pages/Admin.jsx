import { useEffect, useState } from "react";
import api from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { KeyRound, Crown, Trash2, Loader2 } from "lucide-react";

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-2 border border-line-strong rounded-card p-6 w-full max-w-sm mx-4 shadow-2xl anim-rise" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-text-hi font-bold text-lg mb-1 flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber" /> איפוס סיסמה</h2>
        <p className="text-text-mid text-sm mb-4">{user.full_name} (<span dir="ltr">{user.email}</span>)</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="סיסמה חדשה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="input-volt"
          />
          {error && <p className="text-coral text-xs">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-mid hover:text-text-hi transition-colors">
              בטל
            </button>
            <button type="submit" disabled={loading} className="btn-volt px-4 py-2 text-sm flex items-center gap-1.5">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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

  if (loading) return (
    <div className="p-6 text-text-mid card-glass flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...
    </div>
  );
  if (error) return <div className="p-6 text-coral card-glass" style={{ borderColor: "rgba(251,113,133,0.4)" }}>{error}</div>;

  const ActionButtons = ({ u, isMe, busy, horizontal = false }) => (
    <div className={horizontal ? "flex items-stretch gap-2" : "flex flex-col items-stretch gap-1"}>
      <button
        onClick={() => setResetTarget(u)}
        disabled={busy}
        className={`text-xs px-2 rounded-lg border border-cyan/30 text-cyan hover:bg-cyan-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        <KeyRound className="w-3 h-3" /> סיסמה
      </button>
      <button
        onClick={() => handleToggleAdmin(u)}
        disabled={busy || isMe}
        className={`text-xs px-2 rounded-lg border border-amber/30 text-amber hover:bg-amber-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        {u.is_admin ? "הסר" : "אדמין"} <Crown className="w-3 h-3" />
      </button>
      <button
        onClick={() => handleDelete(u)}
        disabled={busy || isMe}
        className={`text-xs px-2 rounded-lg border border-coral/30 text-coral hover:bg-coral-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        {busy ? "..." : <>מחק <Trash2 className="w-3 h-3" /></>}
      </button>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-extrabold text-text-hi tracking-tight mb-6 flex items-center gap-2 anim-rise">
        ניהול משתמשים <Crown className="w-6 h-6 text-amber" />
      </h1>

      {/* Mobile: card list (actions always visible) */}
      <div className="md:hidden space-y-3 anim-rise anim-d1">
        {users.map((u) => {
          const isMe = u.id === me?.id;
          const busy = actionLoading === u.id;
          return (
            <div key={u.id} className="card-glass p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-text-hi font-medium truncate">
                    {u.full_name}
                    {isMe && <span className="mr-2 text-xs text-volt">(אני)</span>}
                  </p>
                  <p className="text-text-mid text-xs truncate" dir="ltr">{u.email}</p>
                  <p className="text-text-low text-xs mt-0.5" dir="ltr">
                    {new Date(u.created_at).toLocaleDateString("he-IL")}
                  </p>
                </div>
                {u.is_admin && (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 bg-amber-soft text-amber text-xs px-2 py-0.5 rounded-full font-medium">
                    <Crown className="w-3 h-3" /> אדמין
                  </span>
                )}
              </div>
              <ActionButtons u={u} isMe={isMe} busy={busy} horizontal />
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card-glass overflow-x-auto anim-rise anim-d1">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-text-mid">
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
                <tr key={u.id} className="border-b border-line/50 hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-text-hi font-medium">
                    {u.full_name}
                    {isMe && <span className="mr-2 text-xs text-volt">(אני)</span>}
                  </td>
                  <td className="px-4 py-3 text-text-mid" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3 text-text-mid" dir="ltr">
                    {new Date(u.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_admin ? <Crown className="w-4 h-4 text-amber inline" /> : <span className="text-text-low">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ActionButtons u={u} isMe={isMe} busy={busy} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-text-mid text-xs"><span dir="ltr">{users.length}</span> משתמשים סה"כ</p>

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
