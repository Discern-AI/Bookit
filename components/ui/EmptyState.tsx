// EmptyState — Implementation Brief §2.11.

import { Button } from "@/components/ui/Button";

export function EmptyState({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="text-center py-12">
      <svg
        aria-hidden
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-ink-200 mx-auto mb-4"
      >
        <path d="M4 5.5C4 4.67 4.67 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
        <path d="M20 5.5c0-.83-.67-1.5-1.5-1.5H13v16h5.5c.83 0 1.5-.67 1.5-1.5v-13Z" />
      </svg>
      <h3 className="font-display text-xl text-ink-800">{heading}</h3>
      <p className="text-base text-ink-500 max-w-xs mx-auto mt-2">{body}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}
