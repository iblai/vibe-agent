"use client";

import { Spinner } from "@iblai/iblai-js/web-containers";
import { cn } from "@/lib/utils";

/**
 * The one loading / busy screen, the OS's look: white, a centred Lucide arc in
 * brand blue, and nothing else. Full page by default; `overlay` covers the
 * viewport (opaque, above everything, like the OS boot loader) while something
 * saves or redirects and the user must not interact. Busy forms keep their
 * controls disabled underneath it as well.
 *
 * {message} is not drawn: a caption under the arc is one more thing that appears
 * and disappears where the eye is already waiting. It is still the accessible
 * name, so a screen reader hears "Saving…" where a sighted user sees the arc.
 */
export function LoadingScreen({
  message,
  overlay = false,
  className,
}: {
  /** What is happening, announced but not drawn. */
  message?: string;
  /** Cover the viewport and block interaction while something saves or redirects. */
  overlay?: boolean;
  className?: string;
}) {
  return (
    <output
      aria-live="polite"
      aria-label={message ?? "Loading"}
      className={cn(
        "flex flex-col items-center justify-center bg-white",
        overlay ? "fixed inset-0 z-[9999]" : "min-h-screen w-full",
        className,
      )}
    >
      <Spinner className="h-14 w-14 text-[#2563EB]" />
    </output>
  );
}
