import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { Sparkles, Send, Loader2, User, Bot, Plus, Trash2, MessageSquare } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

const SUGGESTIONS = [
  "Hoeveel META Leads en Red Pepper leads in februari?",
  "Welk kanaal heeft de beste ROI?",
  "Vergelijk reclamatie ratio Solvari vs Red Pepper",
  "Zijn er inconsistenties in onze data?",
  "Wat is onze CPL per kanaal?",
  "Geef een samenvatting van onze marketing performance",
];

export function AiAssistantPage() {
  const queryClient = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["ai-conversations"],
    queryFn: async () => (await api.get("/ai/conversations")).data,
  });

  // Load active conversation
  const loadConversation = async (id: string) => {
    const res = await api.get(`/ai/conversations/${id}`);
    setMessages(res.data.messages || []);
    setActiveConvId(id);
  };

  const newConversation = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  const deleteConversation = async (id: string) => {
    await api.delete(`/ai/conversations/${id}`);
    queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    if (activeConvId === id) newConversation();
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await api.post("/ai/chat", { message, conversationId: activeConvId });
      return res.data as { answer: string; conversationId: string };
    },
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
      setActiveConvId(data.conversationId);
      queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
    },
    onError: (err: any) => {
      setMessages((prev) => [...prev, { role: "assistant", content: "Fout: " + (err.response?.data?.error || err.message) }]);
    },
  });

  const handleSend = (text?: string) => {
    const msg = text || input.trim();
    if (!msg || chatMutation.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    setInput("");
    chatMutation.mutate(msg);
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-5">
      {/* Sidebar - Conversations */}
      <div className="w-64 flex-shrink-0 flex flex-col rounded-xl border border-border/60 bg-white overflow-hidden">
        <div className="p-3 border-b border-border/60">
          <Button size="sm" className="w-full" onClick={newConversation}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nieuw gesprek
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations?.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                activeConvId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground"
              }`}
              onClick={() => loadConversation(conv.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 truncate text-xs">{conv.title}</span>
              <button
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {(!conversations || conversations.length === 0) && (
            <p className="px-3 py-4 text-xs text-muted-foreground/50 text-center">Nog geen gesprekken</p>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Vraag het aan AI</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                Ik heb toegang tot al je deal, kosten en afspraak data.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-w-lg">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="rounded-lg border border-border/60 bg-white px-3 py-2.5 text-left text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] px-4 py-3 ${
                    msg.role === "user"
                      ? "rounded-xl bg-primary text-white"
                      : "bg-white border border-border/40"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="text-sm text-foreground space-y-3">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <h2 className="text-base font-bold mt-4 mb-2">{children}</h2>,
                            h2: ({ children }) => <h3 className="text-sm font-bold mt-3 mb-1.5">{children}</h3>,
                            h3: ({ children }) => <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>,
                            p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                            ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>,
                            li: ({ children }) => <li className="text-sm">{children}</li>,
                            table: ({ children }) => (
                              <div className="my-3 overflow-x-auto border border-border/60">
                                <table className="w-full text-xs">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                            th: ({ children }) => <th className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border/60">{children}</th>,
                            td: ({ children }) => <td className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/30">{children}</td>,
                            tr: ({ children }) => <tr className="hover:bg-muted/30">{children}</tr>,
                            hr: () => <hr className="my-3 border-border/40" />,
                            blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-muted-foreground italic">{children}</blockquote>,
                            code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{children}</code>,
                          }}
                        >{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-sm">{msg.content}</div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary mt-0.5">
                      <User className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-white px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Data analyseren...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mt-3 flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Stel een vraag over je data..."
            className="h-12 flex-1 resize-none rounded-xl border border-border/60 bg-white px-4 py-3 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            rows={1}
          />
          <Button onClick={() => handleSend()} disabled={!input.trim() || chatMutation.isPending} className="h-12 px-5">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
