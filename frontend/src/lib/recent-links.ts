/**
 * Browser-only store for the "Recent links" list, persisted to localStorage.
 * Exposed in the subscribe/getSnapshot shape `useSyncExternalStore` expects, so the
 * list hydrates without a setState-in-effect and every consumer stays in sync.
 * TypeScript 5.x.
 */

import type { Link } from "@/lib/api";

const STORAGE_KEY = "snip:recent-links";
const MAX_ITEMS = 8;

/** Stable empty array: used as the server snapshot and before the first read. */
const EMPTY: readonly Link[] = [];

let cache: readonly Link[] | null = null;
const listeners = new Set<() => void>();

/** Read from storage once; storage can be missing, blocked, or hold garbage. */
function load(): readonly Link[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Link[]).slice(0, MAX_ITEMS) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(links: readonly Link[]) {
  cache = links;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    // Private mode / quota exceeded: keep the in-memory copy so the UI still works.
  }
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): readonly Link[] {
  cache ??= load();
  return cache;
}

export function getServerSnapshot(): readonly Link[] {
  return EMPTY;
}

/** Add (or move to the top) a link, de-duplicated by code. */
export function addRecentLink(link: Link) {
  const rest = getSnapshot().filter((item) => item.code !== link.code);
  save([link, ...rest].slice(0, MAX_ITEMS));
}

/** Replace a stored link's data in place, e.g. after refreshing its visit count. */
export function updateRecentLink(link: Link) {
  save(getSnapshot().map((item) => (item.code === link.code ? link : item)));
}

export function removeRecentLink(code: string) {
  save(getSnapshot().filter((item) => item.code !== code));
}

export function clearRecentLinks() {
  save(EMPTY);
}
