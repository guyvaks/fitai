import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { authAPI } from "../services/api";

// 3-30 chars, Hebrew + Latin letters, digits, '.', '_', '-' -- mirrors the
// backend's USERNAME_REGEX (app/schemas/auth.py). Client-side copy only
// blocks obviously-invalid input before a network round-trip; the backend
// is always the authoritative check.
const USERNAME_PATTERN = "^[a-zA-Z0-9א-ת._-]{3,30}$";
const DEBOUNCE_MS = 400;

// Shared by Register.jsx and ActivateAccount.jsx -- both need a username
// field with live availability checking and identical validation/copy.
export default function UsernameField({ value, onChange, label = "שם משתמש" }) {
  const [status, setStatus] = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setStatus(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setStatus("checking");
      try {
        const { data } = await authAPI.checkUsernameAvailable(trimmed);
        if (!data.available) {
          setStatus(data.reason === "invalid_format" ? "invalid" : "taken");
        } else {
          setStatus("available");
        }
      } catch {
        // Network hiccup on the live-check is not fatal -- the backend still
        // authoritatively validates at submit time either way.
        setStatus(null);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [value]);

  return (
    <div>
      <label className="block text-text-mid text-sm mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={3}
          maxLength={30}
          pattern={USERNAME_PATTERN}
          className="input-volt"
          // .input-volt's own `padding` shorthand (index.css) wins over the
          // pl-9 utility class at equal specificity/source order, so the
          // status icon's reserved space has to be forced via inline style
          // instead of relying on the utility-class cascade.
          style={{ paddingLeft: "2.25rem" }}
          placeholder="שם משתמש"
          autoComplete="username"
          dir="auto"
        />
        {status === "checking" && (
          <Loader2 className="w-4 h-4 animate-spin text-text-mid absolute left-3 top-1/2 -translate-y-1/2" />
        )}
        {status === "available" && (
          <Check className="w-4 h-4 text-volt absolute left-3 top-1/2 -translate-y-1/2" />
        )}
        {(status === "taken" || status === "invalid") && (
          <X className="w-4 h-4 text-coral absolute left-3 top-1/2 -translate-y-1/2" />
        )}
      </div>
      {status === "taken" && <p className="text-coral text-xs mt-1">שם המשתמש תפוס</p>}
      {status === "invalid" && (
        <p className="text-coral text-xs mt-1">
          שם משתמש לא תקין: 3-30 תווים, אותיות (עברית/אנגלית), ספרות, נקודה, מקף או קו תחתון
        </p>
      )}
    </div>
  );
}
