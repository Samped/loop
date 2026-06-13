"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const STARTERS = [
  "How is my portfolio doing?",
  "What stocks are moving today?",
  "How do I trade on Loop?",
];

export default function AgentPage() {
  const { address } = useAccount();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi — I'm your Loop agent. Ask about your portfolio, market movers, or how to trade.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg = text.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, address }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "No response." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-4 py-4 sm:px-6">
        <div className="flex-1 space-y-4 overflow-y-auto scrollbar-none pb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-emerald-500/15 text-zinc-100"
                    : "glass-card text-zinc-300"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="glass-card rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-zinc-500" />
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-zinc-500 [animation-delay:0.2s]" />
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-zinc-500 [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-emerald-500/30 hover:text-emerald-400"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your portfolio, markets, or trading…"
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-primary shrink-0 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
  );
}
