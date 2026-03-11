const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

/**
 * Wrapper around fetch that automatically includes the x-user-email header.
 * Call with the same signature as fetch, but path is relative to API_BASE.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  email?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (email) {
    headers["x-user-email"] = email;
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
}

export { API_BASE };
