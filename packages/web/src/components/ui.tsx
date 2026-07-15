import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import type { Status } from "@crm/core/types";
import { STATUS_DOT, STATUS_LABEL, STATUS_PILL } from "../lib/status";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<Variant, string> = {
  primary: "bg-neutral-100 text-neutral-900 hover:bg-white",
  secondary: "bg-neutral-800 text-neutral-200 hover:bg-neutral-700",
  danger: "bg-red-600 text-white hover:bg-red-500",
  ghost: "text-neutral-400 hover:text-neutral-100",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-[10px] px-3.5 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

const CONTROL =
  "w-full rounded-[10px] border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} ${className}`} {...props} />;
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} ${className}`} {...props} />;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[14px] border border-neutral-800 bg-neutral-900 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

/* Status color system from the design: tiny dot + tinted pill. */

export function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block h-[7px] w-[7px] flex-none rounded-full ${STATUS_DOT[status]}`}
    />
  );
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block flex-none whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const BADGE_TONES: Record<string, string> = {
  slate: "bg-neutral-800 text-neutral-300",
  green: "bg-green-400/15 text-green-300",
  amber: "bg-amber-400/15 text-amber-300",
  red: "bg-red-400/15 text-red-300",
  blue: "bg-blue-400/15 text-blue-300",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_TONES[tone] ?? BADGE_TONES.slate}`}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-200" />
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="py-14 text-center">
      {title && (
        <div className="text-[15px] font-semibold text-neutral-400">{title}</div>
      )}
      <div className="mt-1 text-[13px] text-neutral-600">{children}</div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[14px] border border-neutral-800 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button
            className="text-neutral-500 hover:text-neutral-200"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
