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
  if (!ready) return null;
  if (!staff) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(staff.role))
    return <Navigate to="/" replace />;
  return children;
}
