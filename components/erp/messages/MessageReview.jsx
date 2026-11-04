"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatRelative } from "@/lib/formatTime";
import Avatar from "@/components/erp/ui/Avatar";
import { ErrorText, Select } from "@/components/erp/ui/fields";
import ChatPane from "@/components/erp/messages/ChatPane";
import { useConversationLabel, useDirectory } from "@/components/erp/messages/useDirectory";
import { SkeletonList } from "@/components/erp/ui/Loading";

// Read-only access for management to conversations inside their scope: the CEO
// everyone's, a department manager their departments' (`departments`: the people list is
// limited to them). Every opened conversation is written to the audit log by the API.
export default function MessageReview({ meId, departments = null, switcher = null }) {
  const { t, lang } = useLanguage();
  const directory = useDirectory();
  const baseLabel = useConversationLabel(directory, meId);
  const [person, setPerson] = useState("");
  const [conversations, setConversations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api(`/api/messages/review${person ? `?userId=${person}` : ""}`);
      setConversations(data.conversations);
    } catch (err) {
      setError(errorText(t, err));
    }
    setLoaded(true);
  }, [person, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // In review the reader is usually not a member, so a direct chat is named after
  // both people instead of "the other person".
  const labelOf = (c) => {
    if (c.type !== "direct") return baseLabel(c);
    const names = c.members.map((m) => directory.byId[m]?.name || "…");
    return { name: names.join(" ↔ "), avatarUrl: "" };
  };

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] sm:-m-6 lg:-m-10">
      <aside className={`flex w-full shrink-0 flex-col border-e border-white/10 md:w-96 ${active ? "hidden md:flex" : "flex"}`}>
        {switcher}
        <div className="space-y-3 border-b border-white/10 p-3">
          <p className="text-xs text-white/45">{t(departments ? "erp.messages.reviewScopeDept" : "erp.messages.reviewScopeAll")}</p>
          <Select
            value={person}
            onChange={(v) => {
              setPerson(v);
              setActiveId(null);
            }}
            placeholder={t("erp.messages.allPeople")}
            options={directory.people.filter((p) => !departments || departments.includes(p.department)).map((p) => ({ value: p.id, label: p.name }))}
          />
          <ErrorText>{error}</ErrorText>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const label = labelOf(c);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-start ${c.id === activeId ? "bg-white/10" : "hover:bg-white/[0.05]"}`}
              >
                {c.type === "direct" ? (
                  <Avatar name={label.name} size={40} />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange/15 text-brand-orange">
                    {c.type === "announcement" ? <Megaphone size={17} /> : <Users size={17} />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{label.name}</span>
                  <span className="block truncate text-xs text-white/40">
                    <bdi>{c.lastMessage?.text}</bdi> · {formatRelative(c.lastMessage?.at, lang)}
                  </span>
                </span>
              </button>
            );
          })}
          {!loaded && <SkeletonList rows={6} className="p-3" />}
          {loaded && conversations.length === 0 && <p className="p-6 text-center text-sm text-white/40">{t("erp.messages.empty")}</p>}
        </div>
      </aside>

      <section className={`min-w-0 flex-1 ${active ? "flex" : "hidden md:flex"}`}>
        {active ? (
          <ChatPane
            key={active.id}
            review
            conversation={active}
            meId={meId}
            directory={directory}
            label={labelOf(active)}
            onBack={() => setActiveId(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-white/40">
            {t("erp.messages.reviewPick")}
          </div>
        )}
      </section>
    </div>
  );
}
