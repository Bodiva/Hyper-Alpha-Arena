export type EntityId = string;

export type ApiMode = "mock" | "real";

export type ApiStatus = "idle" | "loading" | "success" | "error";

export type SortOrder = "asc" | "desc";

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryParamValue | QueryParamValue[]>;

export interface DateRange {
  from?: string;
  to?: string;
}

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  params?: QueryParams;
  timeoutMs?: number;
}
