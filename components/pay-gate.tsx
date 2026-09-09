"use client";

import { useCallback, useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/loading-screen";
import { PayModal } from "@/components/pay-modal";
import { isTenantAdmin } from "@/lib/iblai/tenant";
import { errorWithStatus, hasPaidAccess, resetPaidAccess } from "@/lib/paywall-client";

/**
 * The SDK composer's own hooks (`CSS_CLASS_NAMES` in @iblai/web-containers;
 * `chat-input-form.tsx`, `chat/submit-message-button.tsx`,
 * `guided-suggested-prompts.tsx`, `welcome-chat.tsx`): the form, its
 * textarea, the send button, the follow-up prompts and the welcome prompts.
 * Enter in the textarea calls the SDK's handler directly (no submit event,
 * `auto-resize-text-area.tsx`), so it is caught on keydown. Re-check every
 * name after an SDK bump: AGENTS.md, "The send gate and SDK bumps".
 */
const SEND_FORM = "form.chat-textarea";
const SEND_TEXTAREA_ID = "chat-input-textarea";
const SEND_CLICKS =
  ".chat-submit-message-button, .chat-guided-suggested-prompts, .chat-welcome-button";
const NOT_A_SEND = ".chat-guided-suggested-prompts-refresh";

type Verdict = "admin" | "paid" | "unpaid" | "unknown";

/**
 * Wraps the SDK <Chat>. A platform admin, or a member whose payment grants,
 * sends as usual; anyone else gets the pay modal instead of a send. The
 * verdict is asked once per minute (a lapse is caught on the next send after
 * it); a send before the first answer waits for it, and the text stays in
 * the composer either way — the SDK's handler never ran.
 */
export function PayGate({ children }: { children: ReactNode }) {
  const [verdict, setVerdict] = useState<Verdict>(() => (isTenantAdmin() ? "admin" : "unknown"));
  const [screen, setScreen] = useState<"none" | "checking" | "pay">("none");

  const check = useCallback(
    () =>
      hasPaidAccess().then((ok) => {
        setVerdict(ok ? "paid" : "unpaid");
        return ok;
      }),
    [],
  );

  // The first verdict, before the first send.
  useEffect(() => {
    if (verdict !== "unknown") return;
    check().catch((e: unknown) => console.error("[paywall] access check failed:", e));
  }, [verdict, check]);

  const intercept = (e: SyntheticEvent) => {
    if (verdict === "admin") return;
    if (verdict === "paid") {
      // Stale-while-revalidate: this send goes; a lapse gates the next one.
      check().catch(() => {});
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (verdict === "unpaid") {
      setScreen("pay");
      return;
    }
    setScreen("checking");
    check()
      .then((ok) => setScreen(ok ? "none" : "pay"))
      .catch((err: unknown) => {
        // Loud: a member who cannot be checked is told, not silently let through.
        setScreen("none");
        toast.error(errorWithStatus(err));
      });
  };

  const onClickCapture = (e: React.MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest(SEND_CLICKS) && !target.closest(NOT_A_SEND)) intercept(e);
  };
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      target?.id === SEND_TEXTAREA_ID
    )
      intercept(e);
  };
  const onSubmitCapture = (e: React.FormEvent) => {
    if (e.target instanceof Element && e.target.matches(SEND_FORM)) intercept(e);
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onClickCapture={onClickCapture}
      onKeyDownCapture={onKeyDownCapture}
      onSubmitCapture={onSubmitCapture}
    >
      {children}
      {screen === "checking" && <LoadingScreen overlay message="Checking your access…" />}
      <PayModal
        open={screen === "pay"}
        onClose={() => setScreen("none")}
        onPaid={() => {
          // Paid in the modal: the text is still in the composer, the next send goes.
          resetPaidAccess();
          setVerdict("paid");
          setScreen("none");
        }}
      />
    </div>
  );
}
