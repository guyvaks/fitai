// Header.jsx/Sidebar.jsx fetch the combined pending-exercises+pending-foods
// count once on mount and have no other link to Admin.jsx's approve/reject
// actions, so their badge went stale until a full remount. Admin.jsx calls
// notifyPendingCountChanged() after every successful approve/reject (single
// or bulk) so both badges refetch immediately.
export const PENDING_COUNT_CHANGED_EVENT = "fitai:pending-count-changed";

export function notifyPendingCountChanged() {
  window.dispatchEvent(new CustomEvent(PENDING_COUNT_CHANGED_EVENT));
}
