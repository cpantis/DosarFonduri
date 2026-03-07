"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";

interface UseSWRApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  mutate: (data?: T) => void;
}

export function useSWRApi<T = any>(path: string | null): UseSWRApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const dedupRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!path) return;
    // Dedup: don't refetch if same path already inflight
    if (dedupRef.current === path) return;
    dedupRef.current = path;

    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      dedupRef.current = null;
    }
  }, [path]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mutate = useCallback((newData?: T) => {
    if (newData !== undefined) {
      setData(newData);
    } else {
      dedupRef.current = null;
      fetchData();
    }
  }, [fetchData]);

  return { data, error, loading, mutate };
}
