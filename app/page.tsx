"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase, Order } from "@/lib/supabase";
import Receipt from "@/app/components/Receipt";

// ─── Web Speech API types (not in all TS DOM lib versions) ─────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionConstructor = new () => ISpeechRecognition;

// ─── Types ─────────────────────────────────────────────────────────────────

type ApiMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessage =
  | { id: string; type: "text"; role: "user" | "assistant"; content: string }
  | { id: string; type: "receipt"; order: Order }
  | { id: string; type: "divider" };

type Mode = "text" | "voice";

// ─── Helpers ───────────────────────────────────────────────────────────────

function uid() {
  return String(Date.now()) + Math.random().toString(36).slice(2, 7);
}

const GREETING = "Hey there! Welcome to NYC Coffee. What can I get started for you today? ☕";

const INITIAL_MESSAGE: ChatMessage = {
  id: "init",
  type: "text",
  role: "assistant",
  content: GREETING,
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function CustomerPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("voice");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  // Ref mirrors (mode === "voice" && !orderPlaced) — read inside async callbacks
  const shouldAutoListenRef = useRef(false);
  // Holds the latest startListening fn so speak()'s onend can call it without stale closure
  const startListeningRef = useRef<(() => void) | null>(null);
  // Guard so we only auto-speak the greeting once
  const hasSpokenGreeting = useRef(false);

  // Auto-scroll on new messages / loading state change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Focus text input when switching to text mode
  useEffect(() => {
    if (mode === "text") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  // Keep shouldAutoListenRef in sync so speak()'s onend always sees the latest value
  useEffect(() => {
    shouldAutoListenRef.current = mode === "voice" && !orderPlaced;
  }, [mode, orderPlaced]);

  // ── Build API-compatible messages (current session only, skip opening greeting) ──
  const buildApiMessages = useCallback(
    (chatMessages: ChatMessage[]): ApiMessage[] => {
      // Find the last divider — everything after it is the current order session
      const lastDividerIdx = chatMessages.reduce(
        (last, msg, i) => (msg.type === "divider" ? i : last),
        -1
      );
      const sessionMsgs =
        lastDividerIdx >= 0 ? chatMessages.slice(lastDividerIdx + 1) : chatMessages;

      return sessionMsgs
        .filter((m): m is Extract<ChatMessage, { type: "text" }> => m.type === "text")
        .filter((_, i) => i !== 0) // skip the opening greeting of each session
        .map(({ role, content }) => ({ role, content }));
    },
    []
  );

  // ── TTS ────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-restart listening so the customer doesn't have to tap the mic again
      if (shouldAutoListenRef.current) {
        setTimeout(() => startListeningRef.current?.(), 400);
      }
    };
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  // Speak the opening greeting once on mount (voice mode only)
  useEffect(() => {
    if (hasSpokenGreeting.current) return;
    hasSpokenGreeting.current = true;
    // Small delay so the browser speech engine is ready
    setTimeout(() => speak(GREETING), 400);
  }, [speak]);

  // ── Save confirmed order to Supabase ───────────────────────────────────
  const saveOrder = async (orderData: {
    items: Order["items"];
    subtotal: number;
    tax: number;
    total: number;
  }): Promise<Order | null> => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          items: orderData.items,
          subtotal: orderData.subtotal,
          tax: orderData.tax,
          total: orderData.total,
          status: "new",
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
        return null;
      }
      return data as Order;
    } catch (err) {
      console.error("Failed to save order:", err);
      return null;
    }
  };

  // ── Core send-message logic ────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading || orderPlaced) return;

      const userMsg: ChatMessage = {
        id: uid(),
        type: "text",
        role: "user",
        content: trimmed,
      };

      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setIsLoading(true);

      try {
        const apiMessages = buildApiMessages(nextMessages);

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const { message: rawMessage, error: apiError } = await res.json();
        if (apiError) throw new Error(apiError);

        // Detect order JSON block
        const ORDER_REGEX = /```order\s*([\s\S]*?)\s*```/;
        const orderMatch = rawMessage.match(ORDER_REGEX);
        const displayText = rawMessage.replace(ORDER_REGEX, "").trim();

        const aiMsg: ChatMessage = {
          id: uid(),
          type: "text",
          role: "assistant",
          content: displayText,
        };

        if (orderMatch) {
          // Parse and persist the order
          let orderData: ReturnType<typeof JSON.parse> | null = null;
          try {
            orderData = JSON.parse(orderMatch[1]);
          } catch {
            console.error("Failed to parse order JSON from AI response");
          }

          if (orderData) {
            const saved = await saveOrder(orderData);
            if (saved) {
              setOrderPlaced(true);
              const receiptMsg: ChatMessage = { id: uid(), type: "receipt", order: saved };
              setMessages((prev) => [...prev, aiMsg, receiptMsg]);
            } else {
              // Supabase failed — still show the AI message, surface error
              const errMsg: ChatMessage = {
                id: uid(),
                type: "text",
                role: "assistant",
                content: "Your order is confirmed but I had trouble saving it. Please let a staff member know.",
              };
              setMessages((prev) => [...prev, aiMsg, errMsg]);
            }
          } else {
            setMessages((prev) => [...prev, aiMsg]);
          }
        } else {
          setMessages((prev) => [...prev, aiMsg]);
        }

        // Read response aloud in voice mode
        if (mode === "voice" && displayText) {
          speak(displayText);
        }
      } catch (err) {
        console.error("sendMessage error:", err);
        const errMsg: ChatMessage = {
          id: uid(),
          type: "text",
          role: "assistant",
          content: "Sorry, something went wrong on my end. Try again!",
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, isLoading, orderPlaced, mode, buildApiMessages, speak]
  );

  // ── Voice recognition: start (also called automatically after TTS) ────
  const startListening = useCallback(() => {
    setMicError(null);
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    const SpeechRecognitionAPI = (
      (window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    ) as SpeechRecognitionConstructor | undefined;

    if (!SpeechRecognitionAPI) {
      setMicError("Voice isn't supported in this browser. Switch to Text mode or use Chrome / Edge.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      sendMessage(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("Mic access blocked. Tap the 🔒 in your browser's address bar, allow microphone, then refresh.");
      } else if (e.error === "audio-capture") {
        setMicError("No microphone detected. Please connect one and try again.");
      } else if (e.error !== "no-speech") {
        console.error("Speech recognition error:", e.error);
        setMicError(`Voice error: ${e.error}. Try switching to Text mode.`);
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [sendMessage]);

  // Keep the ref current so speak()'s onend always calls the latest version
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // ── Toggle: tap once to start, tap again to stop ───────────────────────
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    startListening();
  }, [isListening, startListening]);

  // ── Mode toggle ───────────────────────────────────────────────────────
  const switchMode = useCallback(
    (newMode: Mode) => {
      if (newMode === mode) return;
      setMicError(null); // clear any error on mode switch
      if (newMode === "text") {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
        recognitionRef.current?.stop();
        setIsListening(false);
      }
      setMode(newMode);
    },
    [mode]
  );

  // ── Start a new order — keep history, append divider + fresh greeting ──
  const resetOrder = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    recognitionRef.current?.stop();
    setIsListening(false);
    setMicError(null);
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: uid(), type: "divider" },
      {
        id: uid(),
        type: "text",
        role: "assistant",
        content: "Sure! What can I get started for you? ☕",
      },
    ]);
    setOrderPlaced(false);
  }, []);

  // ── Keyboard submit ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    // Mobile: fills the full screen below the nav, edge-to-edge, no rounding
    // Desktop (md+): centred card with padding, rounded corners, drop shadow
    <div className="md:flex md:items-center md:justify-center md:bg-gray-50 md:p-4 md:min-h-[calc(100vh-3.5rem)]">
      <div className="w-full md:max-w-2xl bg-white md:rounded-2xl md:shadow-lg flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-5.5rem)] md:max-h-[800px]">

        {/* ── Header ── */}
        <div className="flex items-center px-4 h-14 border-b border-gray-100 flex-shrink-0">
          <h1 className="font-semibold text-slate-700 text-sm">
            {orderPlaced ? "Order placed ☕" : "NYC Coffee"}
          </h1>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.map((msg) => {
            // Session divider
            if (msg.type === "divider") {
              return (
                <div key={msg.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium tracking-wide">
                    New order
                  </span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              );
            }

            // Receipt card
            if (msg.type === "receipt") {
              return (
                <div key={msg.id} className="flex justify-center py-2">
                  <Receipt order={msg.order} />
                </div>
              );
            }

            // User bubble
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-gradient-to-br from-sky-500 to-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-xs text-sm leading-relaxed">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
                  NYC
                </div>
                <div className="bg-sky-50 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-sm text-sm text-slate-800 leading-relaxed">
                  {msg.content}
                </div>
              </div>
            );
          })}

          {/* Typing / loading indicator */}
          {isLoading && (
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                NYC
              </div>
              <div className="bg-sky-50 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <div className="px-5 pt-4 pb-3 border-t border-gray-100 flex-shrink-0">
          {orderPlaced ? (
            <div className="flex justify-center py-1">
              <button
                onClick={resetOrder}
                className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm font-medium rounded-full hover:from-sky-400 hover:to-blue-500 active:scale-95 transition-all shadow-sm"
              >
                Place another order
              </button>
            </div>
          ) : mode === "text" ? (
            /* Text input */
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your order…"
                disabled={isLoading}
                autoComplete="off"
                className="flex-1 px-4 py-2.5 rounded-full border border-gray-200 bg-gray-50 text-base md:text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 focus:bg-white disabled:opacity-50 transition-colors"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 transition-all flex-shrink-0"
                aria-label="Send"
              >
                <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          ) : (
            /* Voice input */
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-16 w-full flex items-center justify-center">

                {/* ── Waveform — visible while AI is speaking ── */}
                <div className={`absolute flex items-end gap-1.5 transition-opacity duration-500 ${
                  isSpeaking ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}>
                  {[
                    { h: 20, d: "0ms"   },
                    { h: 32, d: "90ms"  },
                    { h: 26, d: "45ms"  },
                    { h: 40, d: "135ms" },
                    { h: 28, d: "20ms"  },
                    { h: 36, d: "110ms" },
                    { h: 18, d: "70ms"  },
                    { h: 30, d: "155ms" },
                    { h: 22, d: "35ms"  },
                  ].map((bar, i) => (
                    <span
                      key={i}
                      style={{
                        height: `${bar.h}px`,
                        animationDelay: bar.d,
                        transformOrigin: "bottom",
                      }}
                      className="w-1.5 rounded-full bg-gradient-to-b from-sky-400 to-blue-500 [animation:soundbar_0.7s_ease-in-out_infinite]"
                    />
                  ))}
                </div>

                {/* ── Mic / Stop button — hidden while speaking ── */}
                <button
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-40 ${
                    isSpeaking
                      ? "opacity-0 pointer-events-none scale-90"
                      : "opacity-100"
                  } ${
                    isListening
                      ? "bg-red-500 text-white scale-110"
                      : micError
                      ? "bg-amber-500 text-white hover:bg-amber-400 active:scale-95"
                      : "bg-gradient-to-br from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500 active:scale-95"
                  }`}
                  aria-label={isListening ? "Stop recording" : "Start recording"}
                >
                  {isListening && (
                    <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
                  )}
                  {isListening ? (
                    /* Stop icon */
                    <svg className="w-5 h-5 relative z-10" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    /* Mic icon */
                    <svg className="w-6 h-6 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Status / error text */}
              {micError ? (
                <p className="text-xs text-amber-500 text-center leading-snug px-2">{micError}</p>
              ) : (
                <p className={`text-xs h-4 transition-colors duration-300 ${isSpeaking ? "text-sky-500" : "text-slate-400"}`}>
                  {isSpeaking
                    ? "Speaking…"
                    : isListening
                    ? "Listening… tap to stop"
                    : isLoading
                    ? "Processing…"
                    : "Tap the mic to speak"}
                </p>
              )}
            </div>
          )}

          {/* ── Mode toggle — bottom-right ── */}
          {!orderPlaced && (
            <div className="flex justify-end mt-3">
              <div className="flex items-center bg-gray-100 rounded-full p-1 gap-0.5">
                <button
                  onClick={() => switchMode("voice")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    mode === "voice"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-400 hover:text-blue-500"
                  }`}
                >
                  <span>🎤</span> Voice
                </button>
                <button
                  onClick={() => switchMode("text")}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    mode === "text"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-400 hover:text-blue-500"
                  }`}
                >
                  <span>⌨️</span> Text
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
