"use client";

/**
 * The shorten form, its result card, and the "Recent links" history.
 * Client Component (React 19) so it can hold pending/copy state; the actual network
 * calls happen in the Server Actions it invokes.
 */

import { useActionState, useId, useState, useSyncExternalStore, useTransition } from "react";

import { getLinkAction, shortenAction } from "@/app/actions";
import {
  AlertIcon,
  CheckIcon,
  ChevronIcon,
  CopyIcon,
  ExternalIcon,
  LinkIcon,
  RefreshIcon,
  Spinner,
  TrashIcon,
} from "@/components/icons";
import type { Link } from "@/lib/api";
import {
  addRecentLink,
  clearRecentLinks,
  getServerSnapshot,
  getSnapshot,
  removeRecentLink,
  subscribe,
  updateRecentLink,
} from "@/lib/recent-links";
import { initialShortenState, type ShortenState } from "@/lib/shorten-state";

/** Wraps the Server Action so successful results are also recorded in the local history. */
async function shortenAndRemember(prev: ShortenState, formData: FormData): Promise<ShortenState> {
  const next = await shortenAction(prev, formData);
  if (next.status === "success") {
    addRecentLink(next.link);
  }
  return next;
}

export function ShortenForm() {
  // useActionState wires the form to the action and hands back a pending flag.
  const [state, formAction, pending] = useActionState<ShortenState, FormData>(
    shortenAndRemember,
    initialShortenState,
  );
  const values = state.status === "error" ? state.values : undefined;
  const [aliasOpen, setAliasOpen] = useState(false);
  // Re-open the alias field when a failed submit used one (React's "adjust state
  // during render" pattern — avoids an effect and an extra paint).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (values?.custom_code) setAliasOpen(true);
  }
  const errorId = useId();

  return (
    <div className="mt-10 w-full max-w-2xl space-y-4">
      <form
        action={formAction}
        className="rounded-2xl border border-border bg-surface p-2 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="url" className="sr-only">
            URL to shorten
          </label>
          <div className="relative flex-1">
            <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted" />
            <input
              id="url"
              name="url"
              type="url"
              required
              autoComplete="off"
              autoFocus
              defaultValue={values?.url}
              placeholder="Paste a long URL — https://…"
              aria-invalid={state.status === "error" || undefined}
              aria-describedby={state.status === "error" ? errorId : undefined}
              className="h-12 w-full rounded-xl bg-transparent pl-10 pr-3 text-[15px] outline-none placeholder:text-muted/70 focus:bg-surface-muted/60"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? (
              <>
                <Spinner className="size-4" />
                Shortening…
              </>
            ) : (
              "Shorten link"
            )}
          </button>
        </div>

        <div className="mt-2 border-t border-border px-2 pb-1 pt-2">
          <button
            type="button"
            onClick={() => setAliasOpen((open) => !open)}
            aria-expanded={aliasOpen}
            aria-controls="alias-field"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronIcon
              className={`size-3.5 transition-transform duration-150 ${aliasOpen ? "rotate-90" : ""}`}
            />
            Custom alias
            <span className="font-normal opacity-70">(optional)</span>
          </button>

          {/* Kept mounted so typed text survives collapsing; `disabled` means a collapsed
              alias is neither validated nor submitted. */}
          <fieldset id="alias-field" hidden={!aliasOpen} disabled={!aliasOpen} className="animate-in mt-2 pb-1">
            <label htmlFor="custom_code" className="sr-only">
              Custom alias
            </label>
            <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border bg-surface-muted/50 focus-within:border-accent focus-within:ring-4 focus-within:ring-ring">
              <span className="select-none border-r border-border px-3 font-mono text-sm text-muted">
                /
              </span>
              <input
                id="custom_code"
                name="custom_code"
                type="text"
                autoComplete="off"
                spellCheck={false}
                defaultValue={values?.custom_code}
                placeholder="my-link"
                pattern="[A-Za-z0-9_\-]{3,32}"
                title="3–32 characters: letters, digits, hyphen or underscore"
                className="h-full flex-1 bg-transparent px-3 font-mono text-sm outline-none placeholder:text-muted/60"
              />
            </div>
            <p className="mt-1.5 px-0.5 text-xs text-muted">
              3–32 characters. Letters, numbers, hyphens and underscores.
            </p>
          </fieldset>
        </div>
      </form>

      {state.status === "error" && (
        <div
          id={errorId}
          role="alert"
          className="animate-in flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          <p>{state.message}</p>
        </div>
      )}

      {/* key re-mounts the card per result so the entry animation and copy state reset. */}
      {state.status === "success" && (
        <ResultCard key={state.link.code + state.link.created_at} link={state.link} />
      )}

      <RecentLinks />
    </div>
  );
}

/** Copy-to-clipboard button with a transient "Copied" confirmation. */
function CopyButton({ value, compact = false }: { value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      // Clipboard access needs a secure context (https or localhost) and can be
      // blocked by permissions — fail visibly rather than silently doing nothing.
      console.error("Clipboard write failed", error);
      window.prompt("Copy this link:", value);
    }
  }

  const Icon = copied ? CheckIcon : CopyIcon;

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        title={copied ? "Copied" : "Copy"}
        className={`grid size-8 place-items-center rounded-md transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${copied ? "text-success" : "text-muted hover:text-foreground"}`}
      >
        <Icon className="size-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring ${
        copied
          ? "bg-success-soft text-success"
          : "bg-foreground text-background hover:opacity-90"
      }`}
    >
      <Icon className="size-4" />
      {copied ? "Copied" : "Copy"}
      {/* Announce the change to screen readers without moving focus. */}
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </button>
  );
}

/** Shows the freshly generated short link. */
function ResultCard({ link }: { link: Link }) {
  return (
    <section
      aria-label="Your short link"
      className="animate-in rounded-2xl border border-accent/30 bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-success">
        <span className="grid size-5 place-items-center rounded-full bg-success-soft">
          <CheckIcon className="size-3.5" />
        </span>
        Link created
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href={link.short_url}
          target="_blank"
          rel="noreferrer noopener"
          className="group flex min-w-0 flex-1 items-center gap-1.5 font-mono text-lg font-medium text-accent hover:underline hover:underline-offset-4"
        >
          <span className="truncate">{stripProtocol(link.short_url)}</span>
          <ExternalIcon className="size-4 shrink-0 opacity-60 group-hover:opacity-100" />
        </a>
        <CopyButton value={link.short_url} />
      </div>

      <p className="mt-3 truncate text-sm text-muted" title={link.target_url}>
        <span className="text-muted/70">Redirects to </span>
        {link.target_url}
      </p>
    </section>
  );
}

/** Locally remembered links with live visit counts. */
function RecentLinks() {
  const links = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (links.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="recent-heading" className="pt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 id="recent-heading" className="text-sm font-semibold">
          Recent links
        </h2>
        <button
          type="button"
          onClick={clearRecentLinks}
          className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear
        </button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {links.map((link) => (
          <RecentLinkRow key={link.code} link={link} />
        ))}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted">Stored only in this browser.</p>
    </section>
  );
}

function RecentLinkRow({ link }: { link: Link }) {
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    startRefresh(async () => {
      const result = await getLinkAction(link.code);
      if (result.ok) {
        setError(null);
        updateRecentLink(result.link);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <a
          href={link.short_url}
          target="_blank"
          rel="noreferrer noopener"
          className="block truncate font-mono text-sm font-medium hover:text-accent"
        >
          {stripProtocol(link.short_url)}
        </a>
        <p className="truncate text-xs text-muted" title={link.target_url}>
          {error ? <span className="text-danger">{error}</span> : link.target_url}
        </p>
      </div>

      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium tabular-nums">
          {link.visits.toLocaleString()}
          <span className="ml-1 text-xs font-normal text-muted">
            {link.visits === 1 ? "click" : "clicks"}
          </span>
        </p>
        <p className="text-xs text-muted">{formatRelative(link.created_at)}</p>
      </div>

      <div className="flex items-center">
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          aria-label={`Refresh stats for ${link.code}`}
          title="Refresh clicks"
          className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {refreshing ? <Spinner className="size-4" /> : <RefreshIcon className="size-4" />}
        </button>
        <CopyButton value={link.short_url} compact />
        <button
          type="button"
          onClick={() => removeRecentLink(link.code)}
          aria-label={`Remove ${link.code} from history`}
          title="Remove from history"
          className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
    </li>
  );
}

/** "http://localhost:8000/abc" → "localhost:8000/abc" for a cleaner display. */
function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Human-friendly "5 minutes ago" style timestamp; falls back to "" on bad input. */
function formatRelative(iso: string): string {
  // The backend may omit the timezone suffix for naive UTC datetimes; treat those as UTC.
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  const time = new Date(hasZone ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(time)) {
    return "";
  }

  const seconds = Math.round((time - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relativeFormatter.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}
