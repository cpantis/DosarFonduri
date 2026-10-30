// Always use relative URLs — Next.js rewrite proxies /api/* to backend
const API_URL = "";

const DEFAULT_TIMEOUT_MS = 30_000;

/** Error thrown for non-2xx responses; carries the HTTP status. */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

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
      const body = await res.json().catch(async () => {
        const text = await res.text().catch(() => "");
        return { error: text ? text.slice(0, 200) : `HTTP ${res.status} ${res.statusText}` };
      });
      const errorMsg = typeof body.error === "string" ? body.error.slice(0, 200) : `HTTP ${res.status}`;
      // Org session expired or account disabled: drop the token and go to login.
      // Calls with an explicit token (provider pages, /auth/me) handle 401 themselves.
      if (res.status === 401 && !token && storedToken && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
        localStorage.removeItem("df-token");
        window.location.assign("/login");
      }
      throw new ApiError(errorMsg, res.status);
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

/** Download a file from an authenticated endpoint (plain <a href> links can't send the Bearer token). */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("df-token") : null;
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(typeof body.error === "string" ? body.error : `HTTP ${res.status}`, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fetch every page of a paginated list endpoint ({ data, total }) and return all rows. */
export async function apiGetAll<T = any>(path: string, pageSize = 100): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const rows: T[] = [];
  for (let page = 1; ; page++) {
    const res = await apiGet<{ data: T[]; total: number }>(`${path}${sep}page=${page}&limit=${pageSize}`);
    rows.push(...(res.data || []));
    if (!res.data?.length || rows.length >= res.total) return rows;
  }
}
