import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";

export function useAuth() {
  const { user, token, setAuth, logout } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await api.get("/auth/me");
      return res.data.user;
    },
    enabled: !!token && !user,
    retry: false,
  });

  useEffect(() => {
    if (data && token) {
      setAuth(data, token);
    }
  }, [data, token, setAuth]);

  return { user, isLoading: isLoading && !!token, logout };
}
