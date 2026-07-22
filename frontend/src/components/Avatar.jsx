import { API_BASE_URL } from "../services/api";

export default function Avatar({ user, className = "w-8 h-8 text-xs" }) {
  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  if (user?.id && user?.avatar_updated_at) {
    return (
      <img
        src={`${API_BASE_URL}/api/v1/users/avatar/${user.id}?v=${encodeURIComponent(user.avatar_updated_at)}`}
        alt={user.full_name || "avatar"}
        className={`${className} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${className} rounded-full bg-gradient-to-br from-volt to-cyan flex items-center justify-center text-ink font-bold flex-shrink-0`}
    >
      {initials}
    </div>
  );
}
