import { useEffect, useState } from "react";
import api from "../services/api";

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/api/v1/admin/users")
      .then(({ data }) => setUsers(data))
      .catch(() => setError("אין גישה או שגיאת שרת"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-text-muted">טוען...</div>;
  if (error) return <div className="p-6 text-red-400">{error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-text-main mb-6">ניהול משתמשים 👑</h1>
      <div className="bg-surface rounded-elem border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-700 text-text-muted">
            <tr>
              <th className="px-4 py-3 text-right">שם</th>
              <th className="px-4 py-3 text-right">אימייל</th>
              <th className="px-4 py-3 text-right">סטטוס</th>
              <th className="px-4 py-3 text-right">הצטרף</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/20">
                <td className="px-4 py-3 text-text-main font-medium">
                  {u.full_name}
                  {u.is_admin && <span className="mr-2 text-xs text-yellow-400">👑</span>}
                </td>
                <td className="px-4 py-3 text-text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                    {u.is_active ? "פעיל" : "לא פעיל"}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-muted">
                  {new Date(u.created_at).toLocaleDateString("he-IL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-text-muted text-xs">{users.length} משתמשים סה"כ</p>
    </div>
  );
}
