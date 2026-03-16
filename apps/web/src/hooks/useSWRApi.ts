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
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!path) return;

    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { signal });
      if (!signal?.aborted) {
        setData(result);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      if (!signal?.aborted) {
        setError(err.message);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    // Abort previous request if path changed
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetchData(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchData]);

  const mutate = useCallback((newData?: T) => {
    if (newData !== undefined) {
      setData(newData);
    } else {
      // Abort previous and refetch
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetchData(controller.signal);
    }
  }, [fetchData]);

  return { data, error, loading, mutate };
}
