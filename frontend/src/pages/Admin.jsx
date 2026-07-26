import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { KeyRound, Crown, Trash2, Loader2, Users, Dumbbell, Check, X, Apple, Sparkles } from "lucide-react";
import { notifyPendingCountChanged } from "../utils/pendingUpdates";

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

function PendingExercises() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchPending = () => {
    setLoading(true);
    api.get("/api/v1/admin/exercises/pending")
      .then(({ data }) => setExercises(data))
      .catch(() => setError("אין גישה או שגיאת שרת"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, []);

  const handleApprove = async (ex) => {
    setActionLoading(ex.id);
    try {
      await api.post(`/api/v1/admin/exercises/${ex.id}/approve`);
      setExercises((prev) => prev.filter((x) => x.id !== ex.id));
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה באישור התרגיל");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (ex) => {
    if (!window.confirm(`לדחות (ולמחוק) את התרגיל "${ex.canonical_name_he}"?\nפעולה זו אינה ניתנת לביטול.`)) return;
    setActionLoading(ex.id);
    try {
      await api.delete(`/api/v1/admin/exercises/${ex.id}/reject`);
      setExercises((prev) => prev.filter((x) => x.id !== ex.id));
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה בדחיית התרגיל");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return (
    <div className="p-6 text-text-mid card-glass flex items-center gap-2 anim-rise anim-d1">
      <Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...
    </div>
  );
  if (error) return <div className="p-6 text-coral card-glass anim-rise anim-d1" style={{ borderColor: "rgba(251,113,133,0.4)" }}>{error}</div>;

  if (exercises.length === 0) {
    return (
      <div className="p-6 text-text-mid card-glass text-center anim-rise anim-d1">
        אין תרגילים הממתינים לאישור כרגע
      </div>
    );
  }

  return (
    <div className="space-y-3 anim-rise anim-d1">
      {exercises.map((ex) => {
        const busy = actionLoading === ex.id;
        return (
          <div key={ex.id} className="card-glass p-4">
            <div className="mb-3">
              <p className="text-text-hi font-medium">{ex.canonical_name_he}</p>
              {ex.canonical_name_en && (
                <p className="text-text-mid text-xs" dir="ltr">{ex.canonical_name_en}</p>
              )}
              <p className="text-text-low text-xs mt-1">
                {ex.category} · {ex.muscle_group_primary} · {ex.equipment}
              </p>
            </div>
            <div className="flex items-stretch gap-2">
              <button
                onClick={() => handleApprove(ex)}
                disabled={busy}
                className="flex-1 py-2 text-xs px-2 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" /> אשר
              </button>
              <button
                onClick={() => handleReject(ex)}
                disabled={busy}
                className="flex-1 py-2 text-xs px-2 rounded-lg border border-coral/30 text-coral hover:bg-coral-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1"
              >
                {busy ? "..." : <>דחה <X className="w-3 h-3" /></>}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PendingFoods() {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const fetchPending = () => {
    setLoading(true);
    api.get("/api/v1/admin/food-master/pending")
      .then(({ data }) => setFoods(data))
      .catch(() => setError("אין גישה או שגיאת שרת"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPending(); }, []);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === foods.length ? new Set() : new Set(foods.map((f) => f.id))
    );
  };

  const handleApprove = async (food) => {
    setActionLoading(food.id);
    try {
      await api.post(`/api/v1/admin/food-master/${food.id}/approve`);
      setFoods((prev) => prev.filter((f) => f.id !== food.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(food.id);
        return next;
      });
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה באישור המוצר");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (food) => {
    if (!window.confirm(`לדחות (ולמחוק) את המוצר "${food.canonical_name_he}"?\nפעולה זו אינה ניתנת לביטול.`)) return;
    setActionLoading(food.id);
    try {
      await api.delete(`/api/v1/admin/food-master/${food.id}/reject`);
      setFoods((prev) => prev.filter((f) => f.id !== food.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(food.id);
        return next;
      });
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה בדחיית המוצר");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkApprove = async () => {
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const { data } = await api.post("/api/v1/admin/food-master/bulk-approve", { ids });
      const updated = new Set(data.updated_ids);
      setFoods((prev) => prev.filter((f) => !updated.has(f.id)));
      setSelectedIds(new Set());
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה באישור המוצרים הנבחרים");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkReject = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`לדחות (ולמחוק) ${count} מוצרים? פעולה זו אינה ניתנת לביטול.`)) return;
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const { data } = await api.delete("/api/v1/admin/food-master/bulk-reject", { data: { ids } });
      const deleted = new Set(data.deleted_ids);
      setFoods((prev) => prev.filter((f) => !deleted.has(f.id)));
      setSelectedIds(new Set());
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה בדחיית המוצרים הנבחרים");
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return (
    <div className="p-6 text-text-mid card-glass flex items-center gap-2 anim-rise anim-d1">
      <Loader2 className="w-4 h-4 animate-spin text-volt" /> טוען...
    </div>
  );
  if (error) return <div className="p-6 text-coral card-glass anim-rise anim-d1" style={{ borderColor: "rgba(251,113,133,0.4)" }}>{error}</div>;

  if (foods.length === 0) {
    return (
      <div className="p-6 text-text-mid card-glass text-center anim-rise anim-d1">
        אין מוצרים הממתינים לאישור כרגע
      </div>
    );
  }

  return (
    <div
      className="space-y-3 anim-rise anim-d1"
      style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
    >
      {/* Select all */}
      <label className="flex items-center gap-2 px-1 text-text-mid text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={selectedIds.size === foods.length}
          onChange={toggleSelectAll}
          className="w-4 h-4 accent-volt"
        />
        בחר הכל
      </label>

      {foods.map((food) => {
        const busy = actionLoading === food.id;
        return (
          <div key={food.id} className="card-glass p-4">
            <div className="flex items-start gap-3 mb-3">
              <input
                type="checkbox"
                checked={selectedIds.has(food.id)}
                onChange={() => toggleSelected(food.id)}
                className="w-4 h-4 mt-0.5 accent-volt flex-shrink-0"
                aria-label={`בחר את ${food.canonical_name_he}`}
              />
              <div className="min-w-0">
                <p className="text-text-hi font-medium">{food.canonical_name_he}</p>
                {food.canonical_name_en && (
                  <p className="text-text-mid text-xs" dir="ltr">{food.canonical_name_en}</p>
                )}
                <p className="text-text-low text-xs mt-1">
                  {food.category} · <span dir="ltr">{food.calories_per_100g}</span> קק״ל ל-100 גר׳ · ח׳ <span dir="ltr">{food.protein_per_100g}g</span>
                </p>
                {food.created_by_email && (
                  <p className="text-text-low text-xs mt-1" dir="ltr">הוצע ע"י: {food.created_by_email}</p>
                )}
              </div>
            </div>
            <div className="flex items-stretch gap-2">
              <button
                onClick={() => handleApprove(food)}
                disabled={busy}
                className="flex-1 py-2 text-xs px-2 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1"
              >
                <Check className="w-3 h-3" /> אשר
              </button>
              <button
                onClick={() => handleReject(food)}
                disabled={busy}
                className="flex-1 py-2 text-xs px-2 rounded-lg border border-coral/30 text-coral hover:bg-coral-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1"
              >
                {busy ? "..." : <>דחה <X className="w-3 h-3" /></>}
              </button>
            </div>
          </div>
        );
      })}

      {/* Bulk action bar — only when something is selected */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 bg-surface-2/95 backdrop-blur-xl border-t border-line-strong px-3 pt-3 flex items-center gap-2 anim-rise"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <span className="text-text-mid text-sm shrink-0">{selectedIds.size} נבחרו</span>
          <div className="flex-1 flex items-stretch gap-2">
            <button
              onClick={handleBulkApprove}
              disabled={bulkBusy}
              className="flex-1 py-2 text-xs px-2 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1"
            >
              <Check className="w-3 h-3" /> אשר את הנבחרים
            </button>
            <button
              onClick={handleBulkReject}
              disabled={bulkBusy}
              className="flex-1 py-2 text-xs px-2 rounded-lg border border-coral/30 text-coral hover:bg-coral-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1"
            >
              {bulkBusy ? "..." : <>דחה את הנבחרים <X className="w-3 h-3" /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTab() {
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

  const handleToggleAiAccess = async (u) => {
    const action = u.ai_access_approved ? "ביטול" : "אישור";
    if (!window.confirm(`${action} הגישה לתכונת ה-AI עבור "${u.full_name}"?`)) return;
    setActionLoading(u.id);
    try {
      const { data } = await api.patch(`/api/v1/admin/users/${u.id}/toggle-ai-access`);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, ai_access_approved: data.ai_access_approved } : x));
    } catch {
      alert("שגיאה בעדכון גישת ה-AI");
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
        onClick={() => handleToggleAiAccess(u)}
        disabled={busy}
        className={`text-xs px-2 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        {u.ai_access_approved ? "בטל AI" : "אשר AI"} <Sparkles className="w-3 h-3" />
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
    <>
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
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {u.is_admin && (
                    <span className="inline-flex items-center gap-1 bg-amber-soft text-amber text-xs px-2 py-0.5 rounded-full font-medium">
                      <Crown className="w-3 h-3" /> אדמין
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${u.ai_access_approved ? "bg-volt-soft text-volt" : "bg-white/5 text-text-low"}`}>
                    <Sparkles className="w-3 h-3" /> {u.ai_access_approved ? "AI מאושר" : "AI לא מאושר"}
                  </span>
                </div>
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
              <th className="px-4 py-3 text-center">AI</th>
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
                  <td className="px-4 py-3 text-center">
                    {u.ai_access_approved ? <Sparkles className="w-4 h-4 text-volt inline" /> : <span className="text-text-low">—</span>}
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
    </>
  );
}

const TABS = [
  { key: "users", label: "משתמשים", Icon: Users },
  { key: "exercises", label: "תרגילים ממתינים", Icon: Dumbbell },
  { key: "foods", label: "מוצרים ממתינים", Icon: Apple },
];

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = TABS.some((t) => t.key === tabParam) ? tabParam : "users";
  const setActiveTab = (tab) =>
    setSearchParams(tab === "users" ? {} : { tab }, { replace: true });

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-extrabold text-text-hi tracking-tight mb-6 flex items-center gap-2 anim-rise">
        ניהול <Crown className="w-6 h-6 text-amber" />
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line mb-6 anim-rise">
        {TABS.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                isActive
                  ? "border-volt text-volt"
                  : "border-transparent text-text-mid hover:text-text-hi"
              }`}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "users" ? <UsersTab /> : activeTab === "exercises" ? <PendingExercises /> : <PendingFoods />}
    </div>
  );
}
