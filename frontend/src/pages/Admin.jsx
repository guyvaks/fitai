import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { KeyRound, Crown, Trash2, Loader2, Users, Dumbbell, Check, X, Apple, Sparkles, RefreshCw, UserX, UserCheck, Mail, Ban } from "lucide-react";
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

function DailyLimitModal({ user, onClose, onSuccess }) {
  const [value, setValue] = useState(user.daily_ai_generation_limit ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = String(value).trim();
    if (trimmed !== "" && (!/^\d+$/.test(trimmed))) {
      setError("הזן מספר שלם וחיובי, או השאר ריק ללא הגבלה");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const daily_limit = trimmed === "" ? null : parseInt(trimmed, 10);
      const { data } = await api.patch(`/api/v1/admin/users/${user.id}/daily-ai-limit`, { daily_limit });
      onSuccess(data.daily_ai_generation_limit);
      onClose();
    } catch {
      setError("שגיאה בעדכון המגבלה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-2 border border-line-strong rounded-card p-6 w-full max-w-sm mx-4 shadow-2xl anim-rise" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-text-hi font-bold text-lg mb-1 flex items-center gap-2"><Sparkles className="w-5 h-5 text-volt" /> מגבלת יצירות AI יומית</h2>
        <p className="text-text-mid text-sm mb-4">{user.full_name} (<span dir="ltr">{user.email}</span>)</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            placeholder="ללא הגבלה"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="input-volt"
            dir="ltr"
          />
          <p className="text-text-low text-xs">השאר ריק להסרת ההגבלה (ללא הגבלה)</p>
          {error && <p className="text-coral text-xs">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-mid hover:text-text-hi transition-colors">
              בטל
            </button>
            <button type="submit" disabled={loading} className="btn-volt px-4 py-2 text-sm flex items-center gap-1.5">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? "מעדכן..." : "שמור"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Applies one numeric limit to every selected user in one call, reusing the
// same bulk endpoint the per-row deactivate/reactivate buttons call (single-
// id array) -- see BulkActionsBar below.
function BulkLimitModal({ count, onClose, onSubmit }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = String(value).trim();
    if (trimmed !== "" && !/^\d+$/.test(trimmed)) {
      setError("הזן מספר שלם וחיובי, או השאר ריק ללא הגבלה");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const daily_limit = trimmed === "" ? null : parseInt(trimmed, 10);
      await onSubmit(daily_limit);
      onClose();
    } catch {
      setError("שגיאה בעדכון המגבלה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-2 border border-line-strong rounded-card p-6 w-full max-w-sm mx-4 shadow-2xl anim-rise" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-text-hi font-bold text-lg mb-1 flex items-center gap-2"><Sparkles className="w-5 h-5 text-volt" /> מגבלת יצירות AI יומית</h2>
        <p className="text-text-mid text-sm mb-4">עבור <span dir="ltr">{count}</span> משתמשים נבחרים</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            placeholder="ללא הגבלה"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="input-volt"
            dir="ltr"
          />
          <p className="text-text-low text-xs">השאר ריק להסרת ההגבלה (ללא הגבלה) לכל הנבחרים</p>
          {error && <p className="text-coral text-xs">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-mid hover:text-text-hi transition-colors">
              בטל
            </button>
            <button type="submit" disabled={loading} className="btn-volt px-4 py-2 text-sm flex items-center gap-1.5">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? "מעדכן..." : `החל על ${count} משתמשים`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The modal itself serves as the "how many users are affected" confirmation
// step for the send-email bulk action -- the count is shown up front and the
// submit button restates it, so there's no need for a second window.confirm.
function BulkEmailModal({ count, onClose, onSubmit }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) {
      setError("יש למלא נושא ותוכן");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(subject.trim(), body.trim());
      onClose();
    } catch {
      setError("שגיאה בשליחת המייל");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-2 border border-line-strong rounded-card p-6 w-full max-w-md mx-4 shadow-2xl anim-rise" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-text-hi font-bold text-lg mb-1 flex items-center gap-2"><Mail className="w-5 h-5 text-cyan" /> שליחת מייל</h2>
        <p className="text-text-mid text-sm mb-4">יישלח ל-<span dir="ltr">{count}</span> משתמשים נבחרים</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="נושא"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            autoFocus
            className="input-volt"
          />
          <textarea
            placeholder="תוכן ההודעה"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="input-volt resize-none"
          />
          {error && <p className="text-coral text-xs">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-text-mid hover:text-text-hi transition-colors">
              בטל
            </button>
            <button type="submit" disabled={loading} className="btn-volt px-4 py-2 text-sm flex items-center gap-1.5">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? "שולח..." : `שלח ל-${count} משתמשים`}
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
    <div className="space-y-3 anim-rise anim-d1 pb-16">
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
        <div className="fixed bottom-0 inset-x-0 z-40 bg-surface-2/95 backdrop-blur-xl border-t border-line-strong p-3 flex items-center gap-2 anim-rise">
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [limitTarget, setLimitTarget] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkLimitOpen, setBulkLimitOpen] = useState(false);
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);

  // isInitial drives the full-page loading state (first mount only) --
  // every later refetch (manual button, tab-refocus) uses `refreshing`
  // instead, so the existing list stays visible while it updates instead
  // of flashing back to a spinner.
  const fetchUsers = (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);
    api.get("/api/v1/admin/users")
      .then(({ data }) => setUsers(data))
      .catch(() => setError("אין גישה או שגיאת שרת"))
      .finally(() => {
        if (isInitial) setLoading(false);
        else setRefreshing(false);
      });
  };

  useEffect(() => {
    fetchUsers(true);

    // New users registering elsewhere (or admin actions from another tab)
    // won't show up otherwise -- this only fetched once on mount before,
    // which repeatedly looked like missing users until the admin manually
    // reloaded the page. Refetch silently whenever this tab regains focus.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchUsers();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

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

  const handleToggleAiAccess = async (u) => {
    const action = u.ai_access_approved ? "ביטול" : "אישור";
    if (!window.confirm(`${action} הגישה לתכונת ה-AI עבור "${u.full_name}"?`)) return;
    setActionLoading(u.id);
    try {
      const { data } = await api.patch(`/api/v1/admin/users/${u.id}/toggle-ai-access`);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, ai_access_approved: data.ai_access_approved } : x));
      notifyPendingCountChanged();
    } catch {
      alert("שגיאה בעדכון גישת ה-AI");
    } finally {
      setActionLoading(null);
    }
  };

  const selectableIds = users.filter((u) => u.id !== me?.id).map((u) => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === selectableIds.length ? new Set() : new Set(selectableIds)));
  };

  const clearSelection = () => setSelected(new Set());

  // Shared by every bulk action (and the per-row deactivate/reactivate
  // toggle, which just calls this with a single-id array) -- applies the
  // per-user results the backend returns instead of assuming the whole batch
  // succeeded, so a partial failure doesn't silently look like success.
  const runBulkAction = async (ids, action, extra = {}) => {
    setBulkBusy(true);
    try {
      const { data } = await api.post("/api/v1/admin/users/bulk", { user_ids: ids, action, ...extra });
      const results = data.results || [];
      const succeededIds = new Set(results.filter((r) => r.success).map((r) => r.id));
      const failed = results.filter((r) => !r.success);

      if (succeededIds.size > 0) {
        setUsers((prev) => prev.map((u) => {
          if (!succeededIds.has(u.id)) return u;
          if (action === "deactivate") return { ...u, is_active: false };
          if (action === "reactivate") return { ...u, is_active: true };
          if (action === "revoke_ai_access") return { ...u, ai_access_approved: false };
          if (action === "set_daily_limit") return { ...u, daily_ai_generation_limit: extra.daily_limit };
          return u;
        }));
      }
      if (action === "revoke_ai_access" && succeededIds.size > 0) notifyPendingCountChanged();

      if (failed.length > 0) {
        alert(`הפעולה בוצעה עבור ${succeededIds.size} משתמשים. נכשלה עבור ${failed.length}:\n` +
          failed.map((f) => `${f.id}: ${f.error}`).join("\n"));
      }
      setSelected((prev) => {
        const next = new Set(prev);
        succeededIds.forEach((id) => next.delete(id));
        return next;
      });
    } catch {
      alert("שגיאה בביצוע הפעולה");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDeactivate = () => {
    if (!window.confirm(`להשבית ${selected.size} משתמשים נבחרים?\nהתחברות תיחסם עבורם, אך הנתונים שלהם לא יימחקו. ניתן להפעיל מחדש בכל עת.`)) return;
    runBulkAction([...selected], "deactivate");
  };

  const handleBulkRevokeAi = () => {
    if (!window.confirm(`לבטל את הגישה לתכונת ה-AI עבור ${selected.size} משתמשים נבחרים?`)) return;
    runBulkAction([...selected], "revoke_ai_access");
  };

  const handleToggleActive = async (u) => {
    if (u.is_active && !window.confirm(`להשבית את המשתמש "${u.full_name}" (${u.email})?\nהתחברות תיחסם עבורו, אך הנתונים שלו לא יימחקו. ניתן להפעיל מחדש בכל עת.`)) return;
    setActionLoading(u.id);
    await runBulkAction([u.id], u.is_active ? "deactivate" : "reactivate");
    setActionLoading(null);
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
        onClick={() => handleToggleAiAccess(u)}
        disabled={busy}
        className={`text-xs px-2 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        {u.ai_access_approved ? "בטל AI" : "אשר AI"} <Sparkles className="w-3 h-3" />
      </button>
      <button
        onClick={() => setLimitTarget(u)}
        disabled={busy}
        className={`text-xs px-2 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        מגבלה יומית <Sparkles className="w-3 h-3" />
      </button>
      <button
        onClick={() => handleToggleActive(u)}
        disabled={busy || isMe}
        className={`text-xs px-2 rounded-lg border ${u.is_active ? "border-amber/30 text-amber hover:bg-amber-soft" : "border-volt/30 text-volt hover:bg-volt-soft"} disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1 ${horizontal ? "flex-1 py-2" : "py-1"}`}
      >
        {u.is_active ? <>השבת <UserX className="w-3 h-3" /></> : <>הפעל <UserCheck className="w-3 h-3" /></>}
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
      <div className="flex justify-end mb-3 anim-rise">
        <button
          onClick={() => fetchUsers()}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg border border-line text-text-mid hover:text-text-hi hover:border-volt/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "מרענן..." : "רענן"}
        </button>
      </div>

      {/* Bulk actions bar -- appears once 1+ users are selected */}
      {selected.size > 0 && (
        <div className="card-glass p-3 mb-3 flex flex-wrap items-center gap-2 anim-rise" style={{ borderColor: "rgba(163,230,53,0.35)" }}>
          <span className="text-text-hi text-sm font-medium ml-1">
            <span dir="ltr">{selected.size}</span> נבחרו
          </span>
          <button
            onClick={handleBulkRevokeAi}
            disabled={bulkBusy}
            className="text-xs px-3 py-1.5 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5" /> בטל גישת AI
          </button>
          <button
            onClick={() => setBulkLimitOpen(true)}
            disabled={bulkBusy}
            className="text-xs px-3 py-1.5 rounded-lg border border-volt/30 text-volt hover:bg-volt-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> מגבלה יומית
          </button>
          <button
            onClick={() => setBulkEmailOpen(true)}
            disabled={bulkBusy}
            className="text-xs px-3 py-1.5 rounded-lg border border-cyan/30 text-cyan hover:bg-cyan-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" /> שלח מייל
          </button>
          <button
            onClick={handleBulkDeactivate}
            disabled={bulkBusy}
            className="text-xs px-3 py-1.5 rounded-lg border border-coral/30 text-coral hover:bg-coral-soft disabled:opacity-30 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
          >
            {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />} השבת
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="text-xs px-3 py-1.5 rounded-lg text-text-mid hover:text-text-hi disabled:opacity-30 transition-colors mr-auto"
          >
            נקה בחירה
          </button>
        </div>
      )}

      {/* Mobile: card list (actions always visible) */}
      <div className="md:hidden space-y-3 anim-rise anim-d1">
        {users.map((u) => {
          const isMe = u.id === me?.id;
          const busy = actionLoading === u.id;
          return (
            <div key={u.id} className={`card-glass p-4 ${!u.is_active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleOne(u.id)}
                    disabled={isMe}
                    className="mt-1.5 flex-shrink-0"
                  />
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
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {!u.is_active && (
                    <span className="inline-flex items-center gap-1 bg-coral-soft text-coral text-xs px-2 py-0.5 rounded-full font-medium">
                      <UserX className="w-3 h-3" /> מושבת
                    </span>
                  )}
                  {u.is_admin && (
                    <span className="inline-flex items-center gap-1 bg-amber-soft text-amber text-xs px-2 py-0.5 rounded-full font-medium">
                      <Crown className="w-3 h-3" /> אדמין
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${u.ai_access_approved ? "bg-volt-soft text-volt" : "bg-white/5 text-text-low"}`}>
                    <Sparkles className="w-3 h-3" /> {u.ai_access_approved ? "AI מאושר" : "AI לא מאושר"}
                  </span>
                  <span className="text-text-low text-xs">
                    {u.daily_ai_generation_limit == null ? "ללא הגבלה" : `מגבלה: ${u.daily_ai_generation_limit}/יום`}
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
              <th className="px-4 py-3 text-center w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={selectableIds.length === 0} />
              </th>
              <th className="px-4 py-3 text-right">שם</th>
              <th className="px-4 py-3 text-right">אימייל</th>
              <th className="px-4 py-3 text-right">הצטרף</th>
              <th className="px-4 py-3 text-center">סטטוס</th>
              <th className="px-4 py-3 text-center">אדמין</th>
              <th className="px-4 py-3 text-center">AI</th>
              <th className="px-4 py-3 text-center">מגבלה יומית</th>
              <th className="px-4 py-3 text-center">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === me?.id;
              const busy = actionLoading === u.id;
              return (
                <tr key={u.id} className={`border-b border-line/50 hover:bg-white/3 transition-colors ${!u.is_active ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} disabled={isMe} />
                  </td>
                  <td className="px-4 py-3 text-text-hi font-medium">
                    {u.full_name}
                    {isMe && <span className="mr-2 text-xs text-volt">(אני)</span>}
                  </td>
                  <td className="px-4 py-3 text-text-mid" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3 text-text-mid" dir="ltr">
                    {new Date(u.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_active ? (
                      <span className="text-text-low">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-coral-soft text-coral text-xs px-2 py-0.5 rounded-full font-medium">
                        <UserX className="w-3 h-3" /> מושבת
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.is_admin ? <Crown className="w-4 h-4 text-amber inline" /> : <span className="text-text-low">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.ai_access_approved ? <Sparkles className="w-4 h-4 text-volt inline" /> : <span className="text-text-low">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-text-mid">
                    {u.daily_ai_generation_limit == null ? "ללא הגבלה" : `${u.daily_ai_generation_limit}/יום`}
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

      {limitTarget && (
        <DailyLimitModal
          user={limitTarget}
          onClose={() => setLimitTarget(null)}
          onSuccess={(newLimit) => {
            setUsers((prev) => prev.map((x) => x.id === limitTarget.id ? { ...x, daily_ai_generation_limit: newLimit } : x));
          }}
        />
      )}

      {bulkLimitOpen && (
        <BulkLimitModal
          count={selected.size}
          onClose={() => setBulkLimitOpen(false)}
          onSubmit={(daily_limit) => runBulkAction([...selected], "set_daily_limit", { daily_limit })}
        />
      )}

      {bulkEmailOpen && (
        <BulkEmailModal
          count={selected.size}
          onClose={() => setBulkEmailOpen(false)}
          onSubmit={(subject, body) => runBulkAction([...selected], "send_email", { subject, body })}
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
