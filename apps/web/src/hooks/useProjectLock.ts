"use client";
import { useState, useRef, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api";

const API_URL = "";

/**
 * Pessimistic project lock: acquire on mount, heartbeat every 5 min,
 * poll every 30s while locked by someone else, release on unmount + beforeunload.
 */
export function useProjectLock(projectId: string) {
  const [lockOwned, setLockOwned] = useState(false);
  const [lockError, setLockError] = useState<{ lockedByName: string; lockedAt: string } | null>(null);
  const [lockRetrying, setLockRetrying] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Shared lock acquire function (used on mount + retry)
  const tryAcquireLock = async () => {
    try {
      await apiPost<any>(`/api/projects/${projectId}/lock`, {});
      if (!cancelledRef.current) {
        setLockOwned(true);
        setLockError(null);
        // Stop polling — we own the lock now
        if (lockPollRef.current) { clearInterval(lockPollRef.current); lockPollRef.current = null; }
        // Start heartbeat
        if (!heartbeatRef.current) {
          heartbeatRef.current = setInterval(async () => {
            try {
              await apiPost(`/api/projects/${projectId}/lock/heartbeat`, {});
            } catch {
              setLockOwned(false);
            }
          }, 5 * 60 * 1000);
        }
      }
      return true;
    } catch (err: any) {
      if (!cancelledRef.current) {
        try {
          const msg = err.message || "";
          if (msg.includes("blocat")) {
            const lockInfo = await apiGet<any>(`/api/projects/${projectId}/lock`);
            setLockError({ lockedByName: lockInfo.lockedByName || "Alt utilizator", lockedAt: lockInfo.lockedAt || "" });
          }
        } catch {
          setLockError({ lockedByName: "Alt utilizator", lockedAt: "" });
        }
        setLockOwned(false);
      }
      return false;
    }
  };

  // Manual retry from banner button
  const handleRetryLock = async () => {
    setLockRetrying(true);
    await tryAcquireLock();
    setLockRetrying(false);
  };

  // Acquire lock on mount, release on unmount
  useEffect(() => {
    cancelledRef.current = false;

    tryAcquireLock().then((acquired) => {
      // If lock not acquired, start polling every 30s to auto-acquire when freed
      if (!acquired && !cancelledRef.current) {
        lockPollRef.current = setInterval(async () => {
          if (cancelledRef.current) return;
          try {
            const lockInfo = await apiGet<any>(`/api/projects/${projectId}/lock`);
            if (!lockInfo.locked) {
              // Lock is free — try to acquire
              await tryAcquireLock();
            } else if (!cancelledRef.current) {
              // Update banner with fresh info
              setLockError({ lockedByName: lockInfo.lockedByName || "Alt utilizator", lockedAt: lockInfo.lockedAt || "" });
            }
          } catch {
            // Ignore poll errors
          }
        }, 30_000);
      }
    });

    // Release lock on unmount / navigation
    const releaseLock = () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("df-token") || "" : "";
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ token })], { type: "application/json" });
        navigator.sendBeacon(`${API_URL}/api/projects/${projectId}/lock/release`, blob);
      }
      fetch(`${API_URL}/api/projects/${projectId}/lock`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(e => console.warn("[project]", e?.message || e));
    };

    window.addEventListener("beforeunload", releaseLock);

    return () => {
      cancelledRef.current = true;
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (lockPollRef.current) { clearInterval(lockPollRef.current); lockPollRef.current = null; }
      window.removeEventListener("beforeunload", releaseLock);
      releaseLock();
    };
  }, [projectId]);

  return { lockOwned, lockError, lockRetrying, handleRetryLock };
}
