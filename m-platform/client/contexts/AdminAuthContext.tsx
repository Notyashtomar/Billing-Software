"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  logoutAdminSession,
  validateAdminSession,
  type AdminSessionUser,
} from "@/lib/admin-session";

interface Admin {
  id: string;
  userid: string;
  role: string;
}

interface AdminAuthContextType {
  admin: Admin | null;
  logout: () => void;
  isLoading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(
  undefined
);

function toAdmin(user: AdminSessionUser): Admin {
  return {
    id: user.id,
    userid: user.userid,
    role: user.role,
  };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /* -------------------- Restore session (JWT only) -------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await validateAdminSession();
        if (cancelled) return;

        if (result.ok && result.user) {
          setAdmin(toAdmin(result.user));
        } else {
          setAdmin(null);
        }
      } catch {
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* -------------------- Logout -------------------- */
  const logout = useCallback(() => {
    setAdmin(null);
    void logoutAdminSession();
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{ admin, logout, isLoading }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

/* -------------------- Hook -------------------- */
export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
