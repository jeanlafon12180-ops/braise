import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createThread, deleteThread, listThreads } from "@/lib/threads";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

export function ThreadSidebar({ activeId, userId, email }: { activeId: string; userId: string; email: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: threads = [] } = useQuery({ queryKey: ["threads"], queryFn: listThreads });

  async function onNew() {
    try {
      const t = await createThread(userId);
      await qc.invalidateQueries({ queryKey: ["threads"] });
      navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    } catch {
      toast.error("Impossible de créer une discussion.");
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteThread(id);
      await qc.invalidateQueries({ queryKey: ["threads"] });
      if (id === activeId) navigate({ to: "/" });
    } catch {
      toast.error("Suppression impossible.");
    }
  }

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <img src={logo} alt="" width={28} height={28} className="size-7" />
        <span className="font-display text-xl font-semibold tracking-tight">Braise</span>
      </div>
      <div className="px-3">
        <Button onClick={onNew} className="w-full justify-start gap-2">
          <Plus className="size-4" /> Nouvelle discussion
        </Button>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {threads.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center rounded-lg text-sm transition-colors hover:bg-sidebar-accent",
              t.id === activeId && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Link
              to="/chat/$threadId"
              params={{ threadId: t.id }}
              className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
            >
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{t.title}</span>
            </Link>
            <button
              type="button"
              aria-label="Supprimer"
              onClick={() => onDelete(t.id)}
              className="mr-1 rounded p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">
        <span className="truncate">{email}</span>
        <button
          type="button"
          aria-label="Se déconnecter"
          onClick={() => supabase.auth.signOut()}
          className="rounded p-1.5 hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
