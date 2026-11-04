"use client";

import { useState } from "react";
import { LogOut, UserMinus, UserPlus } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText, Input, Toggle } from "@/components/erp/ui/fields";
import { PeoplePicker } from "@/components/erp/messages/NewChatModal";
import { useConfirm } from "@/components/erp/ui/Feedback";

export default function ConversationInfo({ open, onClose, conversation, meId, directory, online, title, onChanged, onLeft }) {
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [name, setName] = useState(conversation.name);
  const [adding, setAdding] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const isGroup = conversation.type === "group";
  const isAdmin = conversation.admins.includes(meId);

  async function patch(body) {
    setError("");
    try {
      await api(`/api/messages/conversations/${conversation.id}`, { method: "PATCH", body });
      onChanged?.();
      return true;
    } catch (err) {
      setError(errorText(t, err));
      return false;
    }
  }

  async function leave() {
    if (!(await confirm({ text: t("erp.messages.confirmLeave"), danger: true }))) return;
    if (await patch({ removeMemberId: meId })) {
      onClose();
      onLeft?.();
    }
  }

  const candidates = directory.people.filter((p) => !conversation.members.includes(p.id));

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        <Toggle
          checked={Boolean(conversation.muted)}
          onChange={(muted) => patch({ muted })}
          label={t("erp.messages.mute")}
        />

        {isGroup && isAdmin && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input label={t("erp.messages.groupName")} value={name} onChange={setName} />
            </div>
            <Button variant="ghost" onClick={() => patch({ name })} disabled={!name.trim() || name === conversation.name}>
              {t("common.save")}
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-white/70">
            {t("erp.messages.members", { count: conversation.members.length })}
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {conversation.members.map((id) => {
              const p = directory.byId[id];
              return (
                <div key={id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  <Avatar name={p?.name} src={p?.avatarUrl} size={34} online={online?.size ? online.has(id) : undefined} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p?.name || "…"}
                    {conversation.admins.includes(id) && <span className="ms-2 text-xs text-brand-orange">{t("erp.messages.admin")}</span>}
                  </span>
                  {isGroup && isAdmin && id !== meId && (
                    <button
                      type="button"
                      onClick={() => patch({ removeMemberId: id })}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-red-500/10 hover:text-red-400"
                      aria-label={t("erp.messages.removeMember")}
                    >
                      <UserMinus size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isGroup && isAdmin && (
          <div>
            {showAdd ? (
              <div className="space-y-3">
                <PeoplePicker
                  multi
                  people={candidates}
                  selected={adding}
                  onToggle={(id) => setAdding((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))}
                />
                <Button
                  className="w-full"
                  disabled={adding.length === 0}
                  onClick={async () => {
                    if (await patch({ addMemberIds: adding })) {
                      setAdding([]);
                      setShowAdd(false);
                    }
                  }}
                >
                  {t("erp.messages.addMembers")} ({adding.length})
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setShowAdd(true)}>
                <UserPlus size={16} />
                {t("erp.messages.addMembers")}
              </Button>
            )}
          </div>
        )}

        {isGroup && (
          <Button variant="danger" onClick={leave}>
            <LogOut size={16} />
            {t("erp.messages.leave")}
          </Button>
        )}

        <p className="text-xs text-white/55">{t("erp.messages.monitoredNote")}</p>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
