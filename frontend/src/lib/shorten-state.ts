/**
 * State shape shared between the Server Action and the form component.
 *
 * This lives OUTSIDE `app/actions.ts` on purpose: a `"use server"` module may only
 * export async functions, so any non-function export there would be rewritten into a
 * server reference rather than the plain object `useActionState` expects.
 */

import type { Link } from "@/lib/api";

/** Discriminated union consumed by `useActionState` in the form component. */
export type ShortenState =
  | { status: "idle" }
  | { status: "success"; link: Link }
  | { status: "error"; message: string };

export const initialShortenState: ShortenState = { status: "idle" };
