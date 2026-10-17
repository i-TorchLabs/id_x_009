"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");

      if (!token) {
        router.push("/f/login");
        return;
      }

      validateToken(token);
    }
  }, [router]);

  const validateToken = async (token: string) => {
    try {
      const user = localStorage.getItem("user");

      if (!user) {
        localStorage.removeItem("token");
        router.push("/f/login");
      }
    } catch (error) {
      console.error("Token validation failed:", error);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.push("/f/login");
    }
  };

  return <>{children}</>;
}
