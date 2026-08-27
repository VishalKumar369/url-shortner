/**
 * Shared types and helpers for talking to the FastAPI backend.
 * TypeScript 5.x — imported only from server-side code (Server Actions / Server Components).
 */

/** Shape of the `LinkResponse` model returned by the backend. */
export type Link = {
  code: string;
  target_url: string;
  short_url: string;
  created_at: string;
  visits: number;
};

/**
 * Base URL of the FastAPI service. Read from the environment so the same build can
 * point at localhost in dev and a real host in production. It is NOT prefixed with
 * NEXT_PUBLIC_, so it stays on the server and is never shipped to the browser.
 */
export const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

/** Milliseconds to wait before giving up on the backend. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * FastAPI returns `detail` as a plain string for our own HTTPExceptions, but as an
 * array of error objects for Pydantic validation failures. Normalise both into one
 * human-readable sentence.
 */
export function formatApiError(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim() !== "") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String((item as { msg: unknown }).msg)
          : null,
      )
      .filter((msg): msg is string => msg !== null);

    if (messages.length > 0) {
      // Pydantic prefixes messages with "Value error, " — trim it for readability.
      return messages.map((msg) => msg.replace(/^Value error,\s*/, "")).join(" ");
    }
  }

  return fallback;
}

/**
 * `fetch` with a timeout, so a hung or unreachable backend surfaces as an error the
 * UI can render instead of leaving the form spinning forever.
 */
export async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    // Always clear the timer, including on the abort/throw path.
    clearTimeout(timeout);
  }
}
