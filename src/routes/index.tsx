import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { createThread, listThreads } from "@/lib/threads";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Braise — Votre assistant IA" },
      { name: "description", content: "Discutez avec Braise, une IA générative pour écrire, apprendre et créer." },
      { property: "og:title", content: "Braise — Votre assistant IA" },
      { property: "og:description", content: "Discutez avec Braise, une IA générative pour écrire, apprendre et créer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const threads = await listThreads();
        const target = threads[0] ?? (await createThread(user.id));
        navigate({ to: "/chat/$threadId", params: { threadId: target.id }, replace: true });
      } catch {
        toast.error("Impossible de charger vos discussions.");
      }
    })();
  }, [loading, user, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background bg-glow">
      <Shimmer>Chargement…</Shimmer>
    </main>
  );
}
