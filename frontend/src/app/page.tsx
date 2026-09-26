/** Home page — a Server Component that renders the marketing shell around the interactive form. */

import Link from "next/link";
import type { ReactNode } from "react";

import { ShortenForm } from "@/app/shorten-form";
import { BoltIcon, ChartIcon, LinkIcon, ShieldIcon } from "@/components/icons";

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <BoltIcon />,
    title: "Instant links",
    body: "Short, collision-checked codes generated in milliseconds.",
  },
  {
    icon: <ChartIcon />,
    title: "Click tracking",
    body: "Every redirect is counted so you can see what gets opened.",
  },
  {
    icon: <ShieldIcon />,
    title: "Safe by default",
    body: "Only valid http(s) URLs are accepted — no script or data payloads.",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col">
      {/* Decorative grid behind the hero. */}
      <div className="hero-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]" />

      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground shadow-sm">
            <LinkIcon className="size-4.5" />
          </span>
          Snip
        </Link>
        <a
          href="https://github.com/VishalKumar369"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          GitHub
        </a>
      </nav>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <header className="max-w-2xl space-y-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm">
            <span className="size-1.5 rounded-full bg-success" />
            Next.js + FastAPI
          </span>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Shorter links, <span className="text-accent">clearer sharing</span>
          </h1>
          <p className="mx-auto max-w-lg text-pretty text-base text-muted sm:text-lg">
            Paste a long URL, get a clean short link you can share anywhere — and see how many
            times it has been opened.
          </p>
        </header>

        <ShortenForm />

        <section
          aria-label="Features"
          className="mt-20 grid w-full max-w-3xl gap-4 sm:grid-cols-3"
        >
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-border bg-surface p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-lg text-accent">
                {feature.icon}
              </span>
              <h2 className="mt-4 text-sm font-semibold">{feature.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:px-6">
          <p>Snip — built with Next.js and FastAPI.</p>
          <p>Short links redirect with HTTP 307.</p>
        </div>
      </footer>
    </div>
  );
}
