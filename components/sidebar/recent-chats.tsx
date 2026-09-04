"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import {
  useAddPinnedMessageMutation,
  useDeleteMessageMutation,
  useGetPinnedMessagesQuery,
  useGetRecentMessagesInfiniteQuery,
  useUnPinMessageMutation,
} from "@iblai/iblai-js/data-layer";
import {
  selectActiveChatMessages,
  selectNumberOfActiveChatMessages,
  selectSessionId,
  selectStreaming,
} from "@iblai/iblai-js/web-utils";
import {
  PLATFORM_SIDEBAR_NAV_MUTED,
  PlatformSidebarCollapsedNavFlyout,
  type PlatformSidebarSectionContext,
} from "@iblai/iblai-js/web-containers/next";
import { cn } from "@/lib/utils";
import { chatRowLabel, type ChatRow } from "@/lib/chat-rows";
import { ChatRowItem } from "./chat-row";

const LABEL = "Recents";
const EMPTY = "No recent chats";

/**
 * The chat page owns session switching: `/?session=<id>` restores a chat and
 * `/?new=<nonce>` starts a fresh one (both remount the SDK Chat through its
 * key). The sidebar only produces those URLs; it never touches the chat's own
 * Redux state.
 */
function useRecentChats(tenantKey: string, mentorId: string, username: string, open: boolean) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const activeSessionId = useSelector(selectSessionId);
  const skip = !tenantKey || !username;

  const {
    data: recentData,
    refetch: refetchRecent,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetRecentMessagesInfiniteQuery(
    { org: tenantKey, userId: username, mentor: mentorId },
    { skip },
  );
  // The pinned-messages URL is user-scoped like the recent one, but the
  // installed query type omits `userId`; a variable (not a literal) carries
  // the extra field past the excess-property check. `sessionId` is the cache
  // key the SDK invalidates on, not a filter (the OS passes it the same way).
  const pinnedArgs = { org: tenantKey, sessionId: activeSessionId, userId: username };
  const { data: pinnedData, refetch: refetchPinned } = useGetPinnedMessagesQuery(pinnedArgs, {
    skip,
  });

  const forThisAgent = useCallback(
    (row: ChatRow) => !row.mentor?.unique_id || row.mentor.unique_id === mentorId,
    [mentorId],
  );

  // The SDK types the pinned list as an array; the API answers `{ results }`.
  const pinned = useMemo(() => {
    const raw = pinnedData as unknown as ChatRow[] | { results?: ChatRow[] } | undefined;
    const rows = Array.isArray(raw) ? raw : (raw?.results ?? []);
    return rows.filter(forThisAgent);
  }, [pinnedData, forThisAgent]);

  // Recent lists every session, pinned ones included, so drop those here:
  // one list, pins sort to the top.
  const recent = useMemo(() => {
    const pinnedIds = new Set(pinned.map((row) => row.session_id));
    const rows = (recentData?.pages ?? []).flatMap((page) => (page?.results ?? []) as ChatRow[]);
    return rows.filter((row) => forThisAgent(row) && !pinnedIds.has(row.session_id));
  }, [recentData, pinned, forThisAgent]);

  // A brand-new chat appears in Recents once its first exchange has landed:
  // the second message is the assistant's and nothing is streaming.
  const streaming = useSelector(selectStreaming);
  const messageCount = useSelector(selectNumberOfActiveChatMessages);
  const messages = useSelector(selectActiveChatMessages) as { role?: string }[];
  useEffect(() => {
    if (skip || streaming || messageCount !== 2) return;
    if (messages[1]?.role === "assistant") void refetchRecent();
  }, [skip, streaming, messageCount, messages, refetchRecent]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  // `open` re-attaches the observer when the section expands and the
  // sentinel mounts.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, open]);

  const [pinMessage] = useAddPinnedMessageMutation();
  const [unpinMessage] = useUnPinMessageMutation();
  const [deleteMessage] = useDeleteMessageMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (row: ChatRow, what: string, run: () => Promise<unknown>) => {
    setBusyId(row.session_id);
    try {
      await run();
    } catch (e) {
      console.error(`[sidebar] ${what} failed:`, e);
      toast.error(`Could not ${what} this chat.`);
    } finally {
      setBusyId(null);
    }
  };

  const select = (row: ChatRow) => {
    if (row.session_id === activeSessionId) {
      if (pathname !== "/") router.push("/");
      return;
    }
    router.push(`/?session=${encodeURIComponent(row.session_id)}`);
  };

  // Pin and unpin invalidate the SDK's pinned tag themselves; only Recent
  // needs a nudge so the dedup above sees server truth.
  const pin = (row: ChatRow) =>
    act(row, "pin", async () => {
      const args = {
        org: tenantKey,
        userId: username,
        requestBody: { session_id: row.session_id },
      };
      await pinMessage(args).unwrap();
      await refetchRecent();
    });

  const unpin = (row: ChatRow) =>
    act(row, "unpin", async () => {
      const args = {
        org: tenantKey,
        userId: username,
        requestBody: { session_id: row.session_id },
      };
      await unpinMessage(args).unwrap();
      await refetchRecent();
    });

  const remove = (row: ChatRow) =>
    act(row, "delete", async () => {
      const args = { org: tenantKey, userId: username, sessionId: row.session_id };
      await deleteMessage(args).unwrap();
      await Promise.all([refetchPinned(), refetchRecent()]);
      // Never leave the composer pointed at a deleted session.
      if (row.session_id === activeSessionId) router.push(`/?new=${Date.now()}`);
    });

  return { pinned, recent, activeSessionId, busyId, sentinelRef, select, pin, unpin, remove };
}

export function RecentChats({
  tenantKey,
  mentorId,
  username,
  ctx,
}: {
  tenantKey: string;
  mentorId: string;
  username: string;
  ctx: PlatformSidebarSectionContext;
}) {
  const { collapsed, open, onOpenChange, expandFromRail, onAfterNav } = ctx;
  const { pinned, recent, activeSessionId, busyId, sentinelRef, select, pin, unpin, remove } =
    useRecentChats(tenantKey, mentorId, username, open);
  const rows = [
    ...pinned.map((row) => ({ row, pinned: true })),
    ...recent.map((row) => ({ row, pinned: false })),
  ];

  if (collapsed) {
    // The SDK's rail flyout, fed the same rows; it closes the mobile sheet
    // and runs the after-nav callback itself.
    const items = rows.length
      ? rows.map(({ row }) => ({ id: row.session_id, label: chatRowLabel(row) }))
      : [{ id: "empty", label: EMPTY, emptyState: true }];
    return (
      <PlatformSidebarCollapsedNavFlyout
        icon={MessageSquare}
        label={LABEL}
        items={items}
        onIconClick={expandFromRail}
        onItemSelect={(id) => {
          const hit = rows.find(({ row }) => row.session_id === id);
          if (hit) select(hit.row);
        }}
      />
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[14px] font-normal text-[#5f5f61] transition-colors outline-none hover:bg-[#f4f4f4] focus-visible:ring-2 focus-visible:ring-[#cfe8fa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fafafa]",
          open && "bg-[#cfe8fa]/40 hover:bg-[#cfe8fa]/50",
        )}
      >
        <MessageSquare
          className="size-4 shrink-0"
          style={{ color: PLATFORM_SIDEBAR_NAV_MUTED }}
          strokeWidth={1.5}
        />
        <span className="min-w-0 flex-1 truncate">{LABEL}</span>
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-[#7d7e82]" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-[#7d7e82]" aria-hidden />
        )}
      </button>
      {open && (
        <div className="mt-0.5 mr-1 ml-1.5 border-l-2 border-[#e2e8f0] pb-0.5 pl-2.5">
          {rows.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {rows.map(({ row, pinned }) => (
                <li key={row.session_id}>
                  <ChatRowItem
                    label={chatRowLabel(row)}
                    active={row.session_id === activeSessionId}
                    pinned={pinned}
                    busy={busyId === row.session_id}
                    onSelect={() => {
                      select(row);
                      onAfterNav();
                    }}
                    onPinToggle={() => void (pinned ? unpin(row) : pin(row))}
                    onDelete={() => void remove(row)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <span className="block px-2 py-1.5 text-[13px] text-[#94a3b8] italic">{EMPTY}</span>
          )}
          <div ref={sentinelRef} aria-hidden />
        </div>
      )}
    </div>
  );
}
