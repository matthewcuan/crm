import type { Status } from "@crm/core/types";

export const STATUS_LABEL: Record<Status, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  MESSAGED: "Messaged",
  FOLLOWED_UP: "Followed up",
  SCREEN: "Screen",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

/* Color system from the Claude design (Tailwind 400-series):
 * gray Saved, blue Applied, cyan Screen, amber Interview, green Offer,
 * red Rejected. Our three extra stages extend it in-family:
 * violet Messaged, indigo Followed-up, dim-gray Closed. */

export const STATUS_DOT: Record<Status, string> = {
  SAVED: "bg-neutral-400",
  APPLIED: "bg-blue-400",
  MESSAGED: "bg-violet-400",
  FOLLOWED_UP: "bg-indigo-400",
  SCREEN: "bg-cyan-400",
  INTERVIEW: "bg-amber-400",
  OFFER: "bg-green-400",
  REJECTED: "bg-red-400",
  CLOSED: "bg-neutral-600",
};

export const STATUS_PILL: Record<Status, string> = {
  SAVED: "bg-neutral-800 text-neutral-300",
  APPLIED: "bg-blue-400/15 text-blue-300",
  MESSAGED: "bg-violet-400/15 text-violet-300",
  FOLLOWED_UP: "bg-indigo-400/15 text-indigo-300",
  SCREEN: "bg-cyan-400/15 text-cyan-300",
  INTERVIEW: "bg-amber-400/15 text-amber-300",
  OFFER: "bg-green-400/15 text-green-300",
  REJECTED: "bg-red-400/15 text-red-300",
  CLOSED: "bg-neutral-800 text-neutral-500",
};
