import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

export function ProtectedRoute({
  children,
  roles,
}: {
  children: JSX.Element;
  roles?: Role[];
}) {
  const { staff, ready } = useAuth();

  // While the stored session is being confirmed against the server, show a
  // placeholder rather than a blank page — a flash of nothing looks like a
  // crash, and bouncing to /login would sign people out on every refresh.
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo border-t-transparent" />
      </div>
    );
  }

  if (!staff) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(staff.role)) return <Navigate to="/" replace />;
  return children;
}
