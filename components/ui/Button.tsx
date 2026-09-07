"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";

// Button — Implementation Brief §2.1.
// Buttons never have icons unless a spec explicitly calls for one.

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-shelf-700 text-white hover:bg-shelf-500",
  secondary: "bg-ink-50 text-ink-800 border border-ink-200 hover:bg-ink-100",
  ghost: "bg-transparent text-ink-800 hover:bg-ink-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  link: "bg-transparent text-shelf-700 hover:underline p-0 h-auto",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded",
  md: "h-10 px-4 text-base rounded",
  lg: "h-12 px-6 text-lg rounded",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className = "", children, ...props },
  ref,
) {
  const isLink = variant === "link";
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        "inline-flex items-center justify-center font-medium font-body transition-fast",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shelf-700",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        VARIANT_CLASS[variant],
        isLink ? "" : SIZE_CLASS[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      ) : (
        children
      )}
      {loading && <span className="sr-only">Loading</span>}
    </button>
  );
});
