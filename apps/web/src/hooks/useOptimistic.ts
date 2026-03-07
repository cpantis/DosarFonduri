"use client";
import { useState, useCallback } from "react";

export function useOptimisticUpdate<T>(initial: T) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);

  const optimisticUpdate = useCallback(async (
    newData: T,
    apiCall: () => Promise<T>,
  ) => {
    const previous = data;
    setData(newData);
    setPending(true);

    try {
      const result = await apiCall();
      setData(result);
    } catch {
      setData(previous);
    } finally {
      setPending(false);
    }
  }, [data]);

  return { data, setData, pending, optimisticUpdate };
}
