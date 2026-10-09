import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { Database, Json } from "@/integrations/supabase/types";

const INSTRUCTIONS =
  "Tu es Braise, un assistant IA généraliste, chaleureux et précis. Réponds dans la langue de l'utilisateur (par défaut en français). Utilise le markdown (titres, listes, blocs de code) quand cela aide à la lecture.";

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

function userClient(token: string) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

function titleFrom(message: UIMessage | undefined) {
  const text = message?.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export async function handleChat(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) {
    console.error("Missing OPENAI_API_KEY or OPENAI_MODEL environment variable.");
    return json(500, "Le service IA n'est pas configuré. Contactez l'administrateur.");
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return json(401, "Veuillez vous connecter.");

  const supabase = userClient(token);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return json(401, "Session expirée, reconnectez-vous.");

  let body: { messages?: UIMessage[]; threadId?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, "Requête invalide.");
  }
  const messages = body.messages;
  const threadId = body.threadId;
  if (!Array.isArray(messages) || messages.length === 0 || typeof threadId !== "string") {
    return json(400, "Requête invalide.");
  }

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("id, title")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (threadError) return json(500, "Impossible de charger la discussion.");
  if (!thread) return json(404, "Discussion introuvable.");

  // Uses OpenAI's API directly. Keep this key server-side; never expose it in VITE_* variables.
  const provider = createOpenAI({ apiKey });

  const result = streamText({
    model: provider.responses(model),
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onError: (error) => {
      console.error("chat stream error", error);
      const status = (error as { statusCode?: number; status?: number })?.statusCode
        ?? (error as { status?: number })?.status;
      if (status === 429) return "Trop de demandes, réessayez dans un instant.";
      if (status === 401 || status === 403) return "La configuration du service IA est invalide.";
      if (status === 402) return "Le compte API ne dispose pas du crédit ou du paiement nécessaire.";
      return "Une erreur est survenue pendant la génération.";
    },
    onFinish: async ({ messages: finalMessages }) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      const assistant = finalMessages[finalMessages.length - 1];
      const rows = [lastUser, assistant?.role === "assistant" ? assistant : undefined]
        .filter((m): m is UIMessage => !!m)
        .map((m) => ({
          thread_id: threadId,
          user_id: userId,
          sdk_id: m.id,
          role: m.role,
          parts: m.parts as unknown as Json,
        }));
      const { error } = await supabase.from("messages").upsert(rows, { onConflict: "thread_id,sdk_id" });
      if (error) console.error("Failed to save messages", error);

      const update: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
      if (thread.title === "Nouvelle discussion") {
        const title = titleFrom(messages.find((m) => m.role === "user"));
        if (title) update.title = title;
      }
      const { error: tErr } = await supabase.from("threads").update(update).eq("id", threadId);
      if (tErr) console.error("Failed to update thread", tErr);
    },
  });
}
