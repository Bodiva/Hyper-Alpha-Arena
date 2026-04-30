import type { ApiMode } from "./api-types";

const normalizeApiMode = (value: unknown): ApiMode => {
  return value === "real" ? "real" : "mock";
};

const getEnvValue = (key: string): string | undefined => {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[key];
};

export const API_MODE: ApiMode = normalizeApiMode(getEnvValue("VITE_ALPHA_TRACE_API_MODE"));

export const API_BASE_URL = getEnvValue("VITE_ALPHA_TRACE_API_BASE_URL") || "/api";

