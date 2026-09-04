import { describe, it, expect } from "vitest";
import { chatRowLabel } from "../lib/chat-rows";

const human = (content: string) => ({
  is_human: true,
  message: { data: { type: "human", content } },
});
const ai = (content: string) => ({ message: { data: { type: "ai", content } } });

describe("chatRowLabel", () => {
  it("prefers the session title", () => {
    expect(chatRowLabel({ session_id: "s", title: " Trip plan ", messages: [human("hi")] })).toBe(
      "Trip plan",
    );
  });

  it("falls back to the first human message, then any message with content", () => {
    expect(
      chatRowLabel({ session_id: "s", messages: [ai("Hello!"), human("book a flight")] }),
    ).toBe("book a flight");
    expect(chatRowLabel({ session_id: "s", messages: [ai("Hello!")] })).toBe("Hello!");
  });

  it("collapses whitespace to one line", () => {
    expect(chatRowLabel({ session_id: "s", messages: [human("a\n\n  b\tc ")] })).toBe("a b c");
  });

  it("uses the fallback when nothing is readable", () => {
    expect(chatRowLabel({ session_id: "s", title: "  ", messages: [] })).toBe("No content");
    expect(
      chatRowLabel(
        { session_id: "s", messages: [null, { message: { data: { content: 42 } } }] },
        "New chat",
      ),
    ).toBe("New chat");
    expect(chatRowLabel({ session_id: "s", messages: "not a list" })).toBe("No content");
  });
});
