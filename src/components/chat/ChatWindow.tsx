import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import logo from "@/assets/logo.png";

const SUGGESTIONS = [
  "Explique-moi la relativité simplement",
  "Écris un poème sur l'automne",
  "Aide-moi à organiser ma semaine",
  "Donne-moi une recette rapide et saine",
];

export function ChatWindow({
  threadId,
  initialMessages,
  onSaved,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onSaved: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (err) => toast.error(err.message || "Erreur réseau"),
    onFinish: () => onSaved(),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
  }

  const handleSubmit = (msg: PromptInputMessage) => send(msg.text ?? "");
  const last = messages[messages.length - 1];

  return (
    <div className="flex h-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-10">
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <img src={logo} alt="Braise" width={72} height={72} className="size-18" />
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">Comment puis-je vous aider ?</h1>
              <p className="text-muted-foreground">Posez une question, demandez un texte, une idée, un code…</p>
              <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-xl border bg-card px-4 py-3 text-left text-sm text-card-foreground transition hover:border-primary hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return m.role === "assistant" ? (
                        <MessageResponse key={i}>{part.text}</MessageResponse>
                      ) : (
                        <p key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </p>
                      );
                    }
                    if (part.type === "reasoning" && part.text) {
                      return (
                        <Reasoning
                          key={i}
                          isStreaming={status === "streaming" && m.id === last?.id && i === m.parts.length - 1}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Réflexion en cours…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <PromptInput onSubmit={handleSubmit} className="rounded-2xl bg-card shadow-2xl">
          <PromptInputTextarea ref={textareaRef} placeholder="Écrivez votre message…" autoFocus />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Braise peut se tromper. Vérifiez les informations importantes.
        </p>
      </div>
    </div>
  );
}
