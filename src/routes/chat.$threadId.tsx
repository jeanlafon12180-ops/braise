import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { loadMessages } from "@/lib/threads";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Discussion — Braise" },
      { name: "description", content: "Votre discussion avec Braise, l'assistant IA." },
      { property: "og:title", content: "Discussion — Braise" },
      { property: "og:description", content: "Votre discussion avec Braise, l'assistant IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threadId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  const messagesQuery = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => loadMessages(threadId),
    enabled: !!user,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (messagesQuery.data === null) navigate({ to: "/", replace: true });
  }, [messagesQuery.data, navigate]);

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Shimmer>Chargement…</Shimmer>
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ThreadSidebar activeId={threadId} userId={user.id} email={user.email ?? ""} />
      <main className="relative flex min-w-0 flex-1 flex-col bg-glow">
        {messagesQuery.data ? (
          <ChatWindow
            key={threadId}
            threadId={threadId}
            initialMessages={messagesQuery.data}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["threads"] });
              qc.setQueryData(["messages", threadId], undefined);
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Shimmer>Chargement de la discussion…</Shimmer>
          </div>
        )}
      </main>
    </div>
  );
}
