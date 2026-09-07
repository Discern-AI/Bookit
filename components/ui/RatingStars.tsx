"use client";
import { useId, useState } from "react";
export function RatingStars({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const rating = hover ?? value ?? 0;
  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(null)}
    >
      <div
        className="flex"
        role={onChange ? "group" : "img"}
        aria-label={`Rating: ${value ?? "unrated"} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className="relative w-6 h-6">
            <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
              <defs>
                <clipPath id={`${id}-${star}`}>
                  <rect
                    width={Math.min(1, Math.max(0, rating - star + 1)) * 24}
                    height="24"
                  />
                </clipPath>
              </defs>
              <path
                className="fill-ink-200"
                d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"
              />
              <path
                className="fill-ink-800"
                clipPath={`url(#${id}-${star})`}
                d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"
              />
            </svg>
            {onChange && (
              <span className="absolute inset-0 flex">
                {[star - 0.5, star].map((n) => (
                  <button
                    key={n}
                    disabled={disabled}
                    type="button"
                    aria-label={`Rate ${n} stars`}
                    className="w-1/2 h-full focus-visible:outline-shelf-700"
                    onMouseEnter={() => setHover(n)}
                    onFocus={() => setHover(n)}
                    onBlur={() => setHover(null)}
                    onClick={() => onChange(n)}
                  />
                ))}
              </span>
            )}
          </span>
        ))}
      </div>
      {onChange && value !== null && (
        <button
          disabled={disabled}
          onClick={() => onChange(null)}
          className="text-xs text-shelf-700 ml-2"
        >
          Clear rating
        </button>
      )}
    </div>
  );
}
