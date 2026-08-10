import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Products from "@/pages/Products";
import Stock from "@/pages/Stock";
import Promotions from "@/pages/Promotions";
import Customers from "@/pages/Customers";
import Sms from "@/pages/Sms";
import Delivery from "@/pages/Delivery";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route
          path="/products"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN", "STAFF"]}>
              <Products />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN", "STAFF"]}>
              <Stock />
            </ProtectedRoute>
          }
        />
        <Route
          path="/promotions"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN"]}>
              <Promotions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN", "SUPPORT"]}>
              <Customers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sms"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN"]}>
              <Sms />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN"]}>
              <Delivery />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN"]}>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
  );
}
