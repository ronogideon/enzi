import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import Products from "@/pages/Products";
import Categories from "@/pages/Categories";
import Stock from "@/pages/Stock";
import Promotions from "@/pages/Promotions";
import Customers from "@/pages/Customers";
import Sms from "@/pages/Sms";
import Delivery from "@/pages/Delivery";
import StaffPage from "@/pages/Staff";
import Metrics from "@/pages/Metrics";
import Blog from "@/pages/Blog";
import Faqs from "@/pages/Faqs";
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
          path="/categories"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN", "STAFF"]}>
              <Categories />
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
          path="/blog"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN", "STAFF"]}>
              <Blog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/faqs"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN", "STAFF"]}>
              <Faqs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute roles={["SUPERADMIN", "ADMIN"]}>
              <StaffPage />
            </ProtectedRoute>
          }
        />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
