import { API_BASE_URL } from "./api-config";
import type { ApiError, QueryParams, RequestOptions } from "./api-types";

const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

const DEFAULT_TIMEOUT_MS = 15000;

const buildUrlWithParams = (url: string, params?: QueryParams): string => {
  if (!params) return url;
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === null || item === undefined) return;
        searchParams.append(key, String(item));
      });
      return;
    }

    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  if (!query) return url;
  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
};

const resolveUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
};

const parseErrorPayload = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    try {
      return await response.text();
    } catch {
      return undefined;
    }
  }
};

const extractErrorMessage = (payload: unknown): string | undefined => {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const record = payload as { message?: unknown; detail?: unknown; error?: unknown };
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }
  if (typeof record.detail === "string" && record.detail.trim()) {
    return record.detail;
  }
  if (Array.isArray(record.detail) && record.detail.length > 0) {
    return record.detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null && "msg" in item) {
          return String((item as { msg?: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }
  if (typeof record.error === "object" && record.error !== null && "message" in record.error) {
    return String((record.error as { message?: unknown }).message);
  }

  return undefined;
};

const request = async <T>(url: string, options: RequestOptions = {}): Promise<T> => {
  const { params, headers, body, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;
  const finalUrl = buildUrlWithParams(resolveUrl(url), params);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(finalUrl, {
      ...rest,
      headers: {
        ...DEFAULT_HEADERS,
        ...headers,
      },
      body: typeof body === "string" || body === undefined ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await parseErrorPayload(response);
      const payloadMessage = extractErrorMessage(payload);
      const apiError: ApiError = {
        code: `HTTP_${response.status}`,
        message: payloadMessage || `HTTP request failed: ${response.status}`,
        status: response.status,
        details: payload,
      };
      throw apiError;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if ((error as DOMException)?.name === "AbortError") {
      const apiError: ApiError = {
        code: "REQUEST_TIMEOUT",
        message: `Request timed out after ${timeoutMs}ms`,
        details: { url: finalUrl },
      };
      throw apiError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const httpClient = {
  get: <T>(url: string, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(url, { ...options, method: "GET" }),
  post: <T>(url: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(url, { ...options, method: "POST", body }),
  put: <T>(url: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(url, { ...options, method: "PUT", body }),
  delete: <T>(url: string, options: Omit<RequestOptions, "method" | "body"> = {}) =>
    request<T>(url, { ...options, method: "DELETE" }),
};
