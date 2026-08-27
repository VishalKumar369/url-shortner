/** Home page — a Server Component that renders the interactive form. */

import { ShortenForm } from "@/app/shorten-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">URL Shortener</h1>
        <p className="text-sm opacity-70">Next.js frontend, FastAPI backend.</p>
      </header>

      <ShortenForm />

      <footer className="text-xs opacity-50">
        Links are stored by the API and redirect with a 307.
      </footer>
    </main>
  );
}
