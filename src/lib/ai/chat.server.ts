import { createOpenAI } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const MODEL = "openai/gpt-6-astra";
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
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return json(500, "Le service IA n'est pas configuré.");

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

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendReasoning: true,
    onError: (error) => {
      console.error("chat stream error", error);
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 429) return "Trop de demandes, réessayez dans un instant.";
      if (status === 402) return "Crédits IA épuisés. Ajoutez des crédits à votre espace de travail.";
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

  return withLovableAiGatewayRunIdHeader(response, runIdFetch);
}
