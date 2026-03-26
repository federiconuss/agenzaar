import { useEffect, useRef, useState, useCallback } from "react";
import { Centrifuge, Subscription } from "centrifuge";

type Message = {
  id: string;
  content: string;
  replyToMessageId: string | null;
  createdAt: string;
  agent: {
    id: string;
    name: string;
    slug: string;
    avatarUrl: string | null;
  };
};

async function getToken(): Promise<string> {
  const res = await fetch("/api/centrifugo/token");
  const data = await res.json();
  return data.token;
}

export function useLiveChat(channelSlug: string, initialMessages: Message[]) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [connected, setConnected] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 50);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<Centrifuge | null>(null);
  const subRef = useRef<Subscription | null>(null);
  const shouldAutoScroll = useRef(true);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || messages.length === 0) return;
    setLoadingOlder(true);
    shouldAutoScroll.current = false;

    const container = containerRef.current;
    const prevScrollHeight = container?.scrollHeight || 0;

    try {
      const oldestMsg = messages[0];
      const cursor = oldestMsg.id;
      const res = await fetch(
        `/api/channels/${channelSlug}/messages?limit=50&cursor=${cursor}`
      );
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages((prev) => [...data.messages, ...prev]);
        if (data.messages.length < 50) setHasOlder(false);

        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          }
        });
      } else {
        setHasOlder(false);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasOlder, messages, channelSlug]);

  const handlePublication = useCallback((ctx: { data: Message }) => {
    const msg = ctx.data;
    shouldAutoScroll.current = true;
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
    setNewCount((c) => c + 1);
    setTimeout(() => setNewCount((c) => Math.max(0, c - 1)), 3000);
  }, []);

  // Auto-scroll only for new live messages
  useEffect(() => {
    if (shouldAutoScroll.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Connect to Centrifugo
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch("/api/centrifugo/token");
        if (cancelled) return;
        const data = await res.json();
        const { token, url: centrifugoUrl } = data;

        if (!centrifugoUrl || !token) {
          console.warn("Centrifugo not configured, real-time disabled");
          return;
        }

        const wsUrl = centrifugoUrl.replace("https://", "wss://").replace("http://", "ws://");

        const client = new Centrifuge(`${wsUrl}/connection/websocket`, {
          token,
          getToken,
        });

        clientRef.current = client;

        const sub = client.newSubscription(`chat:${channelSlug}`);
        subRef.current = sub;

        sub.on("publication", handlePublication);

        sub.on("subscribed", () => {
          if (!cancelled) setConnected(true);
        });

        sub.on("unsubscribed", () => {
          if (!cancelled) setConnected(false);
        });

        client.on("disconnected", () => {
          if (!cancelled) setConnected(false);
        });

        sub.subscribe();
        client.connect();
      } catch (err) {
        console.error("Centrifugo connection error:", err);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (subRef.current) {
        subRef.current.removeAllListeners();
        subRef.current.unsubscribe();
      }
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [channelSlug, handlePublication]);

  return {
    messages,
    connected,
    newCount,
    loadingOlder,
    hasOlder,
    loadOlder,
    bottomRef,
    containerRef,
  };
}

export type { Message };
