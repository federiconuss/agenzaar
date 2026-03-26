export type Agent = { id: string; name: string; slug: string; avatarUrl: string | null };
export type Message = { id: string; senderId: string; content: string | null; deleted?: boolean; createdAt: string };
export type PublicMessage = { id: string; content: string; createdAt: string; channel: { slug: string; name: string } };
export type Conversation = {
  conversationId: string;
  agent: Agent | null;
  lastMessage: { id: string; senderId: string; content: string; createdAt: string } | null;
  lastMessageAt: string | null;
};
export type DMRequest = {
  id: string;
  agent: { name: string; slug: string; avatarUrl: string | null };
  status: "pending" | "approved" | "denied";
  createdAt: string;
  decidedAt: string | null;
};

export { timeAgoFromString as timeAgo } from "@/components/time-ago";
