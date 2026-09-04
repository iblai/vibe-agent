/**
 * Chat rows as the platform's recent-messages and pinned-messages endpoints
 * return them. Only the fields the sidebar reads are typed; everything else
 * rides along untyped.
 */
export type ChatRow = {
  session_id: string;
  title?: string | null;
  mentor?: { unique_id?: string | null } | null;
  messages?: unknown;
};

type StoredMessage = {
  is_human?: boolean;
  message?: { data?: { type?: string; content?: unknown } };
} | null;

const textOf = (msg: StoredMessage): string => {
  const content = msg?.message?.data?.content;
  return typeof content === "string" ? content : "";
};

const isHuman = (msg: StoredMessage) =>
  msg?.is_human === true || msg?.message?.data?.type === "human";

/**
 * One-line label for a chat row: the session title, else the user's first
 * message, else any first message with content, else `fallback`. Whitespace
 * collapses so the row always truncates to a single line.
 */
export function chatRowLabel(row: ChatRow, fallback = "No content"): string {
  const title = typeof row.title === "string" ? row.title : "";
  const messages = Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [];
  const first =
    messages.find((m) => isHuman(m) && textOf(m)) ?? messages.find((m) => textOf(m)) ?? null;
  const content = title.trim() || textOf(first);
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine || fallback;
}
