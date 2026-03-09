// Always use relative URLs — Next.js rewrite proxies /api/* to backend
const API_URL = "";

const DEFAULT_TIMEOUT_MS = 30_000;

interface FetchOptions extends RequestInit {
  token?: string;
  timeout?: number;
}

export async function api<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, timeout = DEFAULT_TIMEOUT_MS, ...rest } = options;

  // For FormData, the browser must set Content-Type automatically (with multipart boundary)
  // so we must NOT set Content-Type ourselves
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...customHeaders as Record<string, string>,
  };

  // Remove empty Content-Type values (callers may pass "" to try to clear it)
  if (!headers["Content-Type"]) {
    delete headers["Content-Type"];
  }

  const storedToken = token || (typeof window !== "undefined" ? localStorage.getItem("df-token") : null);
  if (storedToken) {
    headers["Authorization"] = `Bearer ${storedToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // If caller also passed a signal, abort our controller when theirs fires
  if (rest.signal) {
    const callerSignal = rest.signal;
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers,
      credentials: "include",
      ...rest,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      const errorMsg = typeof body.error === "string" ? body.error.slice(0, 200) : `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }

    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiGet = <T = any>(path: string, options?: FetchOptions) => api<T>(path, options);
export const apiPost = <T = any>(path: string, body: any, options?: FetchOptions) => api<T>(path, { method: "POST", body: JSON.stringify(body), ...options });
export const apiPut = <T = any>(path: string, body: any, options?: FetchOptions) => api<T>(path, { method: "PUT", body: JSON.stringify(body), ...options });
export const apiPatch = <T = any>(path: string, body: any, options?: FetchOptions) => api<T>(path, { method: "PATCH", body: JSON.stringify(body), ...options });
export const apiDelete = <T = any>(path: string, options?: FetchOptions) => api<T>(path, { method: "DELETE", ...options });
