"use client";

import { useState } from "react";
import { EllipsisVertical, LoaderCircle, Pin, PinOff, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@iblai/iblai-js/web-containers";
import { cn } from "@/lib/utils";

/** One chat in the Recents list: the row button plus its Pin / Delete menu. */
export function ChatRowItem({
  label,
  active,
  pinned,
  busy,
  onSelect,
  onPinToggle,
  onDelete,
}: {
  label: string;
  active: boolean;
  pinned: boolean;
  /** An action on this row is in flight: the menu trigger shows a spinner. */
  busy: boolean;
  onSelect: () => void;
  onPinToggle: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // One trailing slot, two occupants: a pinned row wears its pin until the
  // pointer reaches the row, then the menu that can unpin it takes over. An
  // open menu or a running action owns the slot outright.
  const showPin = pinned && !menuOpen && !busy;

  return (
    <div className="group/chat-row relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2 pr-8 text-left text-[14px] font-normal transition-colors",
          active ? "bg-[#eef6fc] text-[#1e40af]" : "text-[#4a5568] hover:bg-[#f4f4f4]",
        )}
      >
        {pinned && <span className="sr-only">Pinned</span>}
        <span className="line-clamp-1 min-w-0 flex-1 overflow-hidden">{label}</span>
      </button>
      <div className="absolute top-1/2 right-0 -translate-y-1/2">
        {showPin && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[#9ca3af] transition-opacity group-hover/chat-row:opacity-0"
          >
            <Pin className="size-3.5" strokeWidth={1.75} />
          </span>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild disabled={busy}>
            <button
              type="button"
              disabled={busy}
              aria-label="Chat actions"
              aria-busy={busy}
              className={cn(
                "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#7d7e82] transition-opacity hover:bg-[#eef0f3] hover:text-[#1f2937] data-[state=open]:opacity-100",
                busy ? "opacity-100" : "opacity-0 group-hover/chat-row:opacity-100",
              )}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
              ) : (
                <EllipsisVertical className="size-3.5" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem className="gap-2" onSelect={onPinToggle}>
              {pinned ? (
                <PinOff className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              ) : (
                <Pin className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              )}
              {pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={onDelete}>
              <Trash2 className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
