const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface FetchOptions extends RequestInit {
  token?: string;
}

export async function api<T = any>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders as Record<string, string>,
  };

  const storedToken = token || (typeof window !== "undefined" ? localStorage.getItem("df-token") : null);
  if (storedToken) {
    headers["Authorization"] = `Bearer ${storedToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    headers,
    credentials: "include",
    ...rest,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const apiGet = <T = any>(path: string) => api<T>(path);
export const apiPost = <T = any>(path: string, body: any) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPut = <T = any>(path: string, body: any) => api<T>(path, { method: "PUT", body: JSON.stringify(body) });
export const apiPatch = <T = any>(path: string, body: any) => api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = <T = any>(path: string) => api<T>(path, { method: "DELETE" });
