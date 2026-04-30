import { API_MODE } from "./api-config";
import type { ApiMode } from "./api-types";

export const getApiMode = (): ApiMode => API_MODE;

export const isMockMode = (): boolean => getApiMode() === "mock";

export const isRealApiMode = (): boolean => getApiMode() === "real";

export const shouldUseMockData = (): boolean => isMockMode();

