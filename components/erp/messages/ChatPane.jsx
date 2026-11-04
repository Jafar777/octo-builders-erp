"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronsDown,
  CornerUpLeft,
  Download,
  Eye,
  FileText,
  Info,
  Loader2,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Search,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  conversationChannelName,
  usePollingFallback,
  useRealtimeEvent,
} from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import { formatClock, formatDate } from "@/lib/formatTime";
import { CHAT_UPLOAD_FOLDER, uploadFileToImageKit } from "@/lib/uploadFile";
import Avatar from "@/components/erp/ui/Avatar";
import ConversationInfo from "@/components/erp/messages/ConversationInfo";
import { Skeleton } from "@/components/erp/ui/Loading";
import { useConfirm } from "@/components/erp/ui/Feedback";
import { EmptyState } from "@/components/erp/ui/DataTools";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const TYPING_SEND_EVERY_MS = 3000;
const TYPING_SHOW_MS = 4000;

function mergeMessages(prev, incoming) {
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function Attachment({ file }) {
  if (file.mime?.startsWith("image/")) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.url} alt={file.name} className="max-h-64 w-full object-cover" />
      </a>
    );
  }
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-xs hover:bg-black/30"
    >
      <FileText size={16} className="shrink-0" />
      <span className="truncate">{file.name || file.url}</span>
    </a>
  );
}

export default function ChatPane({
  conversation,
  meId,
  directory,
  label,
  online,
  canAnnounce = false,
  review = false,
  compact = false, // floating mini chat: back button always visible
  focusMessageId = null, // open scrolled to this message (search result)
  onBack,
  onRead,
  onChanged,
}) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [mentions, setMentions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [typing, setTyping] = useState({});
  const [readStates, setReadStates] = useState(conversation.readStates || []);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [pinned, setPinned] = useState([]);
  const [pinIndex, setPinIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [highlight, setHighlight] = useState(null);
  // Showing an older window of messages (after a jump); new ones are below.
  const [detached, setDetached] = useState(false);
  // Ticks so the edit button disappears once the edit window has passed.
  const [now, setNow] = useState(() => Date.now());
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const lastTypingSent = useRef(0);
  const stickToBottom = useRef(true);

  const id = conversation.id;
  const channel = conversationChannelName(id);
  const isMember = conversation.members.includes(meId);
  const canWrite = !review && isMember && (conversation.type !== "announcement" || canAnnounce);
  const nameOf = (userId) => directory.byId[userId]?.name || "…";

  const markRead = useCallback(() => {
    if (review || !isMember) return;
    api(`/api/messages/conversations/${id}/read`, { method: "POST" })
      .then(() => onRead?.(id))
      .catch(() => {});
  }, [id, review, isMember, onRead]);

  const loadLatest = useCallback(
    async (replace = false) => {
      try {
        const data = await api(`/api/messages/conversations/${id}/messages`);
        setMessages((prev) => (replace ? data.messages : mergeMessages(prev, data.messages)));
        setHasMore((h) => (replace ? data.hasMore : h || data.hasMore));
        if (data.pinned) setPinned(data.pinned);
      } catch (err) {
        setError(errorText(t, err));
      }
      setLoading(false);
    },
    [id, t]
  );

  // Loads the messages around one and scrolls to it (search results, pins).
  const jumpTo = useCallback(
    async (messageId) => {
      if (messages.some((m) => m.id === messageId)) {
        setHighlight(messageId);
        return;
      }
      try {
        const data = await api(`/api/messages/conversations/${id}/messages?around=${messageId}`);
        stickToBottom.current = false;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setDetached(data.hasNewer);
        if (data.pinned) setPinned(data.pinned);
        setHighlight(messageId);
      } catch (err) {
        setError(errorText(t, err));
      }
      setLoading(false);
    },
    [id, t, messages]
  );

  useEffect(() => {
    // Initial page of messages (or the one we were asked to show), then mark as read.
    if (focusMessageId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      jumpTo(focusMessageId).then(markRead);
    } else {
      loadLatest().then(markRead);
    }
    // Only on open / when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, focusMessageId]);

  usePollingFallback(() => !detached && loadLatest(), 6000);

  // Scroll the highlighted message into view, then let the highlight fade.
  useEffect(() => {
    if (!highlight) return undefined;
    document.getElementById(`msg-${highlight}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = setTimeout(() => setHighlight(null), 2500);
    return () => clearTimeout(timer);
  }, [highlight, messages]);

  // Search inside this conversation (debounced).
  useEffect(() => {
    const q = searchText.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      api(`/api/messages/search?c=${id}&q=${encodeURIComponent(q)}`)
        .then((d) => setSearchResults(d.results))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, id]);

  async function togglePin(message, pin) {
    await api(`/api/messages/items/${message.id}/pin`, { method: "POST", body: { pin } }).catch((err) => setError(errorText(t, err)));
  }

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    stickToBottom.current = false;
    const data = await api(`/api/messages/conversations/${id}/messages?before=${first.id}`).catch(() => null);
    if (data) {
      setMessages((prev) => mergeMessages(prev, data.messages));
      setHasMore(data.hasMore);
    }
  }

  // Real-time events for this conversation.
  useRealtimeEvent(channel, "message:new", (m) => {
    stickToBottom.current = true;
    setMessages((prev) => mergeMessages(prev, [m]));
    setTyping((prev) => {
      const next = { ...prev };
      delete next[m.senderId];
      return next;
    });
    if (m.senderId !== meId && document.visibilityState === "visible") markRead();
  });
  useRealtimeEvent(channel, "message:updated", (m) => setMessages((prev) => mergeMessages(prev, [m])));
  useRealtimeEvent(channel, "conversation:pins", ({ message, pin }) => {
    setPinned((prev) => (pin ? [message, ...prev.filter((x) => x.id !== message.id)] : prev.filter((x) => x.id !== message.id)));
    setPinIndex(0);
  });
  useRealtimeEvent(channel, "typing", ({ userId }) => {
    if (userId !== meId) setTyping((prev) => ({ ...prev, [userId]: Date.now() }));
  });
  useRealtimeEvent(channel, "conversation:read", ({ userId, lastReadAt }) =>
    setReadStates((prev) => [...prev.filter((s) => s.userId !== userId), { userId, lastReadAt }])
  );

  // Typing indicators fade out on their own.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return undefined;
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, at]) => now - at < TYPING_SHOW_MS));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typing]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Keep the view at the newest message unless the user scrolled up to read history.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function handleTextChange(value) {
    setText(value);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const match = /@([^\s@]*)$/.exec(value.slice(0, caret));
    setMentionQuery(match && conversation.type !== "direct" ? match[1].toLowerCase() : null);

    if (canWrite && value && Date.now() - lastTypingSent.current > TYPING_SEND_EVERY_MS) {
      lastTypingSent.current = Date.now();
      api(`/api/messages/conversations/${id}/typing`, { method: "POST" }).catch(() => {});
    }
  }

  const mentionOptions =
    mentionQuery === null
      ? []
      : conversation.members
          .filter((m) => m !== meId)
          .map((m) => directory.byId[m])
          .filter((p) => p && p.name.toLowerCase().includes(mentionQuery))
          .slice(0, 6);

  function pickMention(person) {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]*)$/, `@${person.name} `);
    setText(before + text.slice(caret));
    setMentions((prev) => [...new Set([...prev, person.id])]);
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading((n) => n + files.length);
    const results = await Promise.allSettled(
      files.map((file) =>
        uploadFileToImageKit(file, { folder: CHAT_UPLOAD_FOLDER })
          .then((r) => ({ url: r.url, name: file.name, mime: file.type, size: file.size }))
          .finally(() => setUploading((n) => n - 1))
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    if (ok.length < files.length) setError(t("errors.server_error"));
    setAttachments((prev) => [...prev, ...ok].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const body = text.trim();
    if ((!body && attachments.length === 0) || sending) return;
    setSending(true);
    setError("");
    try {
      if (editing) {
        const { message } = await api(`/api/messages/items/${editing.id}`, { method: "PATCH", body: { text: body } });
        setMessages((prev) => mergeMessages(prev, [message]));
        setEditing(null);
      } else {
        const names = mentions.filter((m) => body.includes(`@${nameOf(m)}`));
        const { message } = await api(`/api/messages/conversations/${id}/messages`, {
          method: "POST",
          body: { text: body, attachments, replyTo: replyTo?.id, mentions: names },
        });
        stickToBottom.current = true;
        setMessages((prev) => mergeMessages(prev, [message]));
        setAttachments([]);
        setReplyTo(null);
        setMentions([]);
      }
      setText("");
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSending(false);
    }
  }

  async function remove(message) {
    if (!(await confirm({ text: t("erp.messages.confirmDelete"), kind: "delete" }))) return;
    const data = await api(`/api/messages/items/${message.id}`, { method: "DELETE" }).catch(() => null);
    if (data) setMessages((prev) => mergeMessages(prev, [data.message]));
  }

  function startEdit(message) {
    setEditing(message);
    setReplyTo(null);
    setText(message.text);
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mentionOptions.length) pickMention(mentionOptions[0]);
      else send();
    }
    if (e.key === "Escape") {
      setEditing(null);
      setReplyTo(null);
      setMentionQuery(null);
    }
  }

  // Read receipt for my latest message.
  const lastMine = [...messages].reverse().find((m) => m.senderId === meId && !m.deleted);
  const seenBy = lastMine
    ? readStates.filter(
        (s) => s.userId !== meId && s.lastReadAt && new Date(s.lastReadAt) >= new Date(lastMine.createdAt)
      ).length
    : 0;

  const typingNames = Object.keys(typing).map(nameOf);
  const otherOnline = label.otherId && online?.has(label.otherId);
  const byId = Object.fromEntries(messages.map((m) => [m.id, m]));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-3 sm:px-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 ${compact ? "" : "md:hidden"}`}
            aria-label={t("erp.back")}
          >
            <ArrowLeft size={18} className="rtl:rotate-180" />
          </button>
        )}
        <Avatar name={label.name} src={label.avatarUrl} size={40} online={label.otherId && online?.size ? otherOnline : undefined} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{label.name}</p>
          <p className="truncate text-xs text-white/60">
            {typingNames.length
              ? t("erp.messages.typing", { names: typingNames.join("، ") })
              : conversation.type === "direct"
                ? otherOnline
                  ? t("erp.messages.online")
                  : ""
                : t("erp.messages.members", { count: conversation.members.length })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o);
            setSearchText("");
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 hover:text-white ${searchOpen ? "bg-white/10 text-white" : "text-white/60"}`}
          aria-label={t("erp.search")}
        >
          <Search size={17} />
        </button>
        {review && (
          <a
            href={`/api/messages/conversations/${id}/export`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={t("erp.messages.export")}
            title={t("erp.messages.export")}
          >
            <Download size={17} />
          </a>
        )}
        {!review && (
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={t("erp.messages.info")}
          >
            <Info size={18} />
          </button>
        )}
      </div>

      {searchOpen && (
        <div className="relative shrink-0 border-b border-white/10 p-2">
          <input
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
            placeholder={t("erp.messages.searchIn")}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-white/30"
          />
          {searchResults && (
            <div className="absolute inset-x-2 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-brand-navy-light shadow-2xl">
              {searchResults.length === 0 && <EmptyState compact text={t("erp.messages.noResults")} />}
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    jumpTo(r.id);
                  }}
                  className="block w-full border-b border-white/5 px-3 py-2 text-start hover:bg-white/10"
                >
                  <span className="flex justify-between gap-2 text-[11px] text-white/60">
                    <span>{nameOf(r.senderId)}</span>
                    <span>{formatDate(r.createdAt, lang)}</span>
                  </span>
                  <span className="line-clamp-2 text-sm" dir="auto">
                    {r.text || r.attachments[0]?.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pinned.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
          <Pin size={14} className="shrink-0 text-brand-orange" />
          <button
            type="button"
            onClick={() => {
              const target = pinned[pinIndex % pinned.length];
              setPinIndex((i) => (i + 1) % pinned.length);
              jumpTo(target.id);
            }}
            className="min-w-0 flex-1 text-start"
          >
            <span className="block text-[11px] text-white/60">
              {t("erp.messages.pinned")} {pinned.length > 1 && `(${(pinIndex % pinned.length) + 1}/${pinned.length})`}
            </span>
            <span className="block truncate text-white/85" dir="auto">
              {nameOf(pinned[pinIndex % pinned.length].senderId)}: {pinned[pinIndex % pinned.length].text || "📎"}
            </span>
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => togglePin(pinned[pinIndex % pinned.length], false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
              aria-label={t("erp.messages.unpin")}
            >
              <PinOff size={14} />
            </button>
          )}
        </div>
      )}

      {review && (
        <div className="flex items-center gap-2 border-b border-brand-orange/20 bg-brand-orange/10 px-4 py-2 text-xs text-white/80">
          <Eye size={14} className="text-brand-orange" />
          {t("erp.messages.reviewBanner")}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6">
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <button type="button" onClick={loadOlder} className="rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/70 hover:bg-white/15">
              {t("erp.loadMore")}
            </button>
          </div>
        )}
        {loading && (
          <div className="space-y-3 py-2" aria-busy="true">
            {[60, 40, 72, 35, 55].map((w, i) => (
              <div key={i} className={`flex items-end gap-2 ${i % 2 ? "flex-row-reverse" : ""}`}>
                {i % 2 === 0 && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
                <Skeleton className="h-10 rounded-2xl" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <EmptyState compact text={t("erp.messages.noMessages")} />
        )}

        {messages.map((m, i) => {
          const mine = m.senderId === meId;
          const prev = messages[i - 1];
          const grouped = prev && prev.senderId === m.senderId && new Date(m.createdAt) - new Date(prev.createdAt) < 5 * 60 * 1000;
          const day = formatDate(m.createdAt, lang);
          const showDay = !prev || formatDate(prev.createdAt, lang) !== day;
          const reply = m.replyTo ? byId[m.replyTo] : null;
          const editable = mine && !m.deleted && !review && now - new Date(m.createdAt) < EDIT_WINDOW_MS;

          return (
            <div key={m.id} id={`msg-${m.id}`} className={`rounded-2xl transition-colors duration-700 ${highlight === m.id ? "bg-brand-orange/15" : ""}`}>
              {showDay && (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/55">{day}</span>
                </div>
              )}
              <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
                {!mine && (
                  <span className="w-8 shrink-0">
                    {!grouped && <Avatar name={nameOf(m.senderId)} src={directory.byId[m.senderId]?.avatarUrl} size={32} />}
                  </span>
                )}
                <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && !grouped && conversation.type !== "direct" && (
                    <span className="mb-1 px-1 text-[11px] text-white/60">{nameOf(m.senderId)}</span>
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm ${
                      m.deleted && !review
                        ? "border border-white/10 italic text-white/60"
                        : mine
                          ? "bg-brand-orange text-white"
                          : "bg-white/10 text-white"
                    }`}
                  >
                    {reply && (
                      <div className="mb-1.5 rounded-lg border-s-2 border-white/50 bg-black/15 px-2 py-1 text-xs opacity-80">
                        <span className="font-semibold">{nameOf(reply.senderId)}</span>
                        <span className="line-clamp-1">{reply.deleted ? t("erp.messages.deleted") : reply.text || "📎"}</span>
                      </div>
                    )}
                    {m.deleted && !review ? (
                      t("erp.messages.deleted")
                    ) : (
                      <>
                        {m.attachments.length > 0 && (
                          <div className="mb-1 space-y-1.5">
                            {m.attachments.map((f, j) => (
                              <Attachment key={j} file={f} />
                            ))}
                          </div>
                        )}
                        {m.text && <p className="whitespace-pre-wrap break-words" dir="auto">{m.text}</p>}
                        {review && m.deleted && (
                          <span className="mt-1 block text-[11px] uppercase tracking-wider text-red-300">{t("erp.messages.deleted")}</span>
                        )}
                      </>
                    )}
                  </div>
                  <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-white/55">
                    {formatClock(m.createdAt, lang)}
                    {m.editedAt && !m.deleted && ` · ${t("erp.messages.edited")}`}
                    {mine && lastMine?.id === m.id && !review &&
                      (seenBy > 0 ? (
                        <span className="flex items-center gap-0.5 text-sky-300">
                          <CheckCheck size={12} />
                          {conversation.type !== "direct" && seenBy}
                        </span>
                      ) : (
                        <Check size={12} />
                      ))}
                  </span>
                </div>
                {!m.deleted && !review && canWrite && (
                  <div className="mb-5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(m);
                        setEditing(null);
                        inputRef.current?.focus();
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                      aria-label={t("erp.messages.reply")}
                    >
                      <CornerUpLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(m, !pinned.some((x) => x.id === m.id))}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                      aria-label={pinned.some((x) => x.id === m.id) ? t("erp.messages.unpin") : t("erp.messages.pin")}
                    >
                      {pinned.some((x) => x.id === m.id) ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                        aria-label={t("common.edit")}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {mine && (
                      <button
                        type="button"
                        onClick={() => remove(m)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-red-500/15 hover:text-red-400"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {detached && (
        <div className="flex shrink-0 justify-center border-t border-white/5 py-1.5">
          <button
            type="button"
            onClick={() => {
              setDetached(false);
              stickToBottom.current = true;
              loadLatest(true);
            }}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/15"
          >
            <ChevronsDown size={14} /> {t("erp.messages.jumpLatest")}
          </button>
        </div>
      )}

      {/* Composer */}
      {canWrite ? (
        <div className="relative shrink-0 border-t border-white/10 p-3">
          {mentionOptions.length > 0 && (
            <div className="absolute bottom-full start-3 mb-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-brand-navy-light shadow-2xl">
              {mentionOptions.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(p);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-white/10"
                >
                  <Avatar name={p.name} src={p.avatarUrl} size={26} />
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {(replyTo || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-white/70">
              {editing ? <Pencil size={13} /> : <CornerUpLeft size={13} />}
              <span className="min-w-0 flex-1 truncate">
                {editing ? t("erp.messages.editing") : `${nameOf(replyTo.senderId)}: ${replyTo.text || "📎"}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyTo(null);
                  if (editing) {
                    setEditing(null);
                    setText("");
                  }
                }}
                aria-label={t("common.cancel")}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {(attachments.length > 0 || uploading > 0) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((f, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs">
                  <Paperclip size={12} />
                  <span className="max-w-40 truncate">{f.name}</span>
                  <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {uploading > 0 && (
                <span className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/60">
                  <Loader2 size={12} className="animate-spin" />
                  {t("dashboard.uploading")}
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-2">
            {!editing && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
                aria-label={t("erp.messages.attach")}
              >
                <Paperclip size={18} />
              </button>
            )}
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFiles} />
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("erp.messages.placeholder")}
              dir="auto"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none focus:border-white/30"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || uploading > 0 || (!text.trim() && attachments.length === 0)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange text-white disabled:opacity-40"
              aria-label={t("erp.messages.send")}
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <SendHorizontal size={18} className="rtl:rotate-180" />}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          <p className="mt-2 text-[11px] text-white/50">{t("erp.messages.monitoredNote")}</p>
        </div>
      ) : (
        !review && (
          <div className="shrink-0 border-t border-white/10 p-4 text-center text-xs text-white/60">
            {t("erp.messages.readOnly")}
          </div>
        )
      )}

      {!review && (
        <ConversationInfo
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          conversation={conversation}
          meId={meId}
          directory={directory}
          online={online}
          title={label.name}
          onChanged={onChanged}
          onLeft={onBack}
        />
      )}
    </div>
  );
}
