import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from "react";

// Input & Textarea — Implementation Brief §2.2.

const BASE =
  "w-full bg-paper-50 border rounded-sm px-3 py-2 text-base text-ink-950 placeholder:text-ink-500 " +
  "focus:outline-none focus:ring-1 transition-fast disabled:bg-ink-50 disabled:text-ink-500 disabled:cursor-not-allowed";

function stateClass(error?: boolean) {
  return error
    ? "border-rose-600 focus:border-rose-600 focus:ring-rose-600"
    : "border-ink-200 focus:border-shelf-700 focus:ring-shelf-700";
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, className = "", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[BASE, stateClass(error), className].join(" ")}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ error, className = "", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={[BASE, stateClass(error), className].join(" ")}
        {...props}
      />
    );
  },
);
