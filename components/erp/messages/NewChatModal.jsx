"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input } from "@/components/erp/ui/fields";

export function PeoplePicker({ people, selected, onToggle, multi }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = people.filter((p) => p.active && (!q || p.name.toLowerCase().includes(q) || p.email.includes(q)));

  return (
    <div>
      <div className="relative mb-3">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("erp.search")}
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pe-3 ps-9 text-sm outline-none focus:border-white/30"
        />
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => onToggle(p.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-white/[0.06] ${on ? "bg-white/10" : ""}`}
            >
              <Avatar name={p.name} src={p.avatarUrl} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.name}</span>
                <span className="block truncate text-xs text-white/40" dir="ltr">
                  {p.email}
                </span>
              </span>
              {multi && on && <Check size={16} className="text-brand-orange" />}
            </button>
          );
        })}
        {list.length === 0 && <p className="py-6 text-center text-sm text-white/40">{t("dashboard.noItems")}</p>}
      </div>
    </div>
  );
}

export default function NewChatModal({ open, onClose, meId, people, onCreated }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState("direct");
  const [name, setName] = useState("");
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const others = people.filter((p) => p.id !== meId);

  async function create(body) {
    setBusy(true);
    setError("");
    try {
      const { conversation } = await api("/api/messages/conversations", { method: "POST", body });
      setName("");
      setMembers([]);
      onCreated(conversation);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("erp.messages.newChat")}>
      <div className="mb-4 flex gap-1 rounded-xl border border-white/10 p-1">
        {["direct", "group"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg py-2 text-sm ${mode === m ? "bg-brand-orange text-white" : "text-white/60"}`}
          >
            {t(`erp.messages.${m}`)}
          </button>
        ))}
      </div>

      {mode === "direct" ? (
        <PeoplePicker people={others} selected={[]} onToggle={(id) => !busy && create({ type: "direct", userId: id })} />
      ) : (
        <div className="space-y-4">
          <Input label={t("erp.messages.groupName")} value={name} onChange={setName} />
          <PeoplePicker
            multi
            people={others}
            selected={members}
            onToggle={(id) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))}
          />
          <Button
            className="w-full"
            disabled={busy || !name.trim() || members.length === 0}
            onClick={() => create({ type: "group", name, memberIds: members })}
          >
            {t("erp.messages.createGroup")} ({members.length})
          </Button>
        </div>
      )}
      <div className="mt-3">
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
