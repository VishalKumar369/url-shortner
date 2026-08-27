"use client";

/**
 * The shorten form and its result card.
 * Client Component (React 19) so it can hold pending/copy state; the actual network
 * call happens in the Server Action it submits to.
 */

import { useActionState, useState } from "react";

import { shortenAction } from "@/app/actions";
import { initialShortenState, type ShortenState } from "@/lib/shorten-state";

export function ShortenForm() {
  // useActionState wires the form to the Server Action and hands back a pending flag.
  const [state, formAction, pending] = useActionState<ShortenState, FormData>(
    shortenAction,
    initialShortenState,
  );

  return (
    <div className="w-full max-w-xl space-y-6">
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="url" className="block text-sm font-medium">
            URL to shorten
          </label>
          <input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://example.com/a/very/long/link"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="custom_code" className="block text-sm font-medium">
            Custom code <span className="font-normal opacity-60">(optional)</span>
          </label>
          <input
            id="custom_code"
            name="custom_code"
            type="text"
            placeholder="my-link"
            pattern="[A-Za-z0-9_-]{3,32}"
            title="3-32 characters: letters, digits, hyphen or underscore"
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {pending ? "Shortening…" : "Shorten"}
        </button>
      </form>

      {state.status === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {state.message}
        </p>
      )}

      {state.status === "success" && <ResultCard shortUrl={state.link.short_url} targetUrl={state.link.target_url} />}
    </div>
  );
}

/** Shows the generated short link with a copy-to-clipboard button. */
function ResultCard({ shortUrl, targetUrl }: { shortUrl: string; targetUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Clipboard access needs a secure context (https or localhost) and can be
      // blocked by permissions — fail visibly rather than silently doing nothing.
      console.error("Clipboard write failed", error);
      window.prompt("Copy this link:", shortUrl);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 bg-black/3 p-4 dark:border-white/15 dark:bg-white/4">
      <p className="text-xs uppercase tracking-wide opacity-60">Your short link</p>
      <div className="flex items-center gap-2">
        <a
          href={shortUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-1 truncate font-mono text-sm underline underline-offset-4"
        >
          {shortUrl}
        </a>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="truncate text-xs opacity-60" title={targetUrl}>
        → {targetUrl}
      </p>
    </div>
  );
}
