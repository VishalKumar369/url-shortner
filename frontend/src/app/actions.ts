"use server";

/**
 * Server Actions that proxy form submissions to the FastAPI backend.
 * Running the call server-side keeps API_BASE_URL out of the browser bundle and
 * means the app does not depend on CORS in production.
 */

import { API_BASE_URL, fetchWithTimeout, formatApiError, type Link } from "@/lib/api";
import type { ShortenState } from "@/lib/shorten-state";

// Note: this module may export async functions only. `ShortenState` is a type (erased at
// compile time) and `initialShortenState` lives in @/lib/shorten-state for that reason.

/**
 * Create a short link.
 *
 * @param _prevState - Previous state from `useActionState`; unused, each submit is independent.
 * @param formData - Fields `url` (required) and `custom_code` (optional).
 */
export async function shortenAction(
  _prevState: ShortenState,
  formData: FormData,
): Promise<ShortenState> {
  const url = String(formData.get("url") ?? "").trim();
  const customCode = String(formData.get("custom_code") ?? "").trim();

  // Cheap local check so an empty submit never costs a network round trip.
  // The backend re-validates everything; this is UX, not security.
  if (url === "") {
    return { status: "error", message: "Please enter a URL to shorten." };
  }

  const payload: { url: string; custom_code?: string } = { url };
  if (customCode !== "") {
    payload.custom_code = customCode;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE_URL}/api/shorten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store", // a mutation must never be served from a cache
    });
  } catch (error) {
    // Network failure, DNS error, or the 8s timeout firing.
    console.error("shortenAction: request to the backend failed", error);
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      status: "error",
      message: aborted
        ? "The backend took too long to respond. Please try again."
        : "Could not reach the backend. Is the FastAPI server running on port 8000?",
    };
  }

  if (!response.ok) {
    // Read the error body defensively — a 502 from a proxy may not be JSON at all.
    let detail: unknown = null;
    try {
      detail = (await response.json())?.detail ?? null;
    } catch {
      detail = null;
    }
    return {
      status: "error",
      message: formatApiError(detail, `Request failed with status ${response.status}.`),
    };
  }

  try {
    const link = (await response.json()) as Link;
    return { status: "success", link };
  } catch (error) {
    console.error("shortenAction: could not parse the backend response", error);
    return { status: "error", message: "Received an unexpected response from the backend." };
  }
}
