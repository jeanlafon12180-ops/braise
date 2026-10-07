import type { UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";

export type Thread = { id: string; title: string; updated_at: string };

export async function listThreads(): Promise<Thread[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createThread(userId: string): Promise<Thread> {
  const { data, error } = await supabase
    .from("threads")
    .insert({ user_id: userId })
    .select("id, title, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteThread(id: string) {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw error;
}

export async function loadMessages(threadId: string): Promise<UIMessage[] | null> {
  const { data: thread, error: tErr } = await supabase.from("threads").select("id").eq("id", threadId).maybeSingle();
  if (tErr) throw tErr;
  if (!thread) return null;
  const { data, error } = await supabase
    .from("messages")
    .select("sdk_id, role, parts")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.sdk_id,
    role: r.role as UIMessage["role"],
    parts: r.parts as unknown as UIMessage["parts"],
  }));
}
