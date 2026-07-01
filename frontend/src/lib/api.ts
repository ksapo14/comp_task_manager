import { firebaseAuth } from "./firebase";

const API_URL = import.meta.env.VITE_API_URL ?? "/api";
const CACHE_PREFIX = "compass:api-cache:";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const pendingGets = new Map<string, Promise<unknown>>();

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function validationMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null;
  const messages = detail
    .map((issue) => {
      if (!issue || typeof issue !== "object" || !("msg" in issue)) return null;
      return String(issue.msg).replace(/^Value error,\s*/i, "");
    })
    .filter((message): message is string => Boolean(message));
  return messages.length > 0 ? messages.join(" ") : null;
}

function currentCacheKey(path: string): string {
  const userId = firebaseAuth.currentUser?.uid ?? "anonymous";
  return `${userId}:${path}`;
}

function storageKey(cacheKey: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(cacheKey)}`;
}

function readCache<T>(cacheKey: string): T | undefined {
  const now = Date.now();
  const inMemory = memoryCache.get(cacheKey);
  if (inMemory && inMemory.expiresAt > now) return inMemory.data as T;
  if (inMemory) memoryCache.delete(cacheKey);

  try {
    const serialized = window.localStorage.getItem(storageKey(cacheKey));
    if (!serialized) return undefined;
    const stored = JSON.parse(serialized) as CacheEntry;
    if (stored.expiresAt <= now) {
      window.localStorage.removeItem(storageKey(cacheKey));
      return undefined;
    }
    memoryCache.set(cacheKey, stored);
    return stored.data as T;
  } catch {
    return undefined;
  }
}

function writeCache(cacheKey: string, data: unknown) {
  const entry = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  memoryCache.set(cacheKey, entry);
  try {
    window.localStorage.setItem(storageKey(cacheKey), JSON.stringify(entry));
  } catch {
    // Memory caching still avoids duplicate requests if storage is unavailable or full.
  }
}

function affectedResources(path: string): string[] {
  const resource = path.split("?")[0].split("/").filter(Boolean)[0];
  if (resource === "tasks") return ["tasks", "calendar"];
  if (resource === "courses") return ["courses", "calendar"];
  if (resource === "calendar") return ["tasks", "calendar"];
  if (resource === "google") return ["google", "calendar"];
  return resource ? [resource] : [];
}

export function invalidateApiCache(resources?: string[]) {
  const prefixes = resources?.map((resource) => `/${resource}`) ?? [];
  const shouldDelete = (cacheKey: string) => {
    const path = cacheKey.slice(cacheKey.indexOf(":") + 1);
    return prefixes.length === 0 || prefixes.some((prefix) => path.startsWith(prefix));
  };

  for (const cacheKey of memoryCache.keys()) {
    if (shouldDelete(cacheKey)) memoryCache.delete(cacheKey);
  }
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(CACHE_PREFIX)) continue;
      const cacheKey = decodeURIComponent(key.slice(CACHE_PREFIX.length));
      if (shouldDelete(cacheKey)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled; the in-memory cache has already been invalidated.
  }
}

export async function api<T>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: BodyInit | object | null } = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const cacheKey = currentCacheKey(path);
  const cacheableGet =
    method === "GET" && !options.body && !path.startsWith("/google/status");
  if (cacheableGet) {
    const cached = readCache<T>(cacheKey);
    if (cached !== undefined) return cached;
    const pending = pendingGets.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  const request = (async () => {
    const token = await firebaseAuth.currentUser?.getIdToken();
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const body = options.body;
    const isNativeBody =
      body instanceof FormData ||
      body instanceof URLSearchParams ||
      body instanceof Blob ||
      body instanceof ArrayBuffer;
    let requestBody: BodyInit | null | undefined;
    if (body && typeof body === "object" && !isNativeBody) {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify(body);
    } else {
      requestBody = body as BodyInit | null | undefined;
    }
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: requestBody,
    });
    if (response.status === 401) {
      window.dispatchEvent(new Event("compass:unauthorized"));
    }
    if (!response.ok) {
      let message = "Something went wrong";
      try {
        const payload = await response.json();
        message =
          typeof payload.detail === "string"
            ? payload.detail
            : validationMessage(payload.detail) ?? message;
      } catch {
        message = response.statusText || message;
      }
      throw new ApiError(message, response.status);
    }
    if (method !== "GET") invalidateApiCache(affectedResources(path));
    if (response.status === 204) return undefined as T;
    const result = (await response.json()) as T;
    if (cacheableGet) {
      writeCache(cacheKey, result);
    }
    return result;
  })();

  if (!cacheableGet) return request;
  pendingGets.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingGets.delete(cacheKey);
  }
}
