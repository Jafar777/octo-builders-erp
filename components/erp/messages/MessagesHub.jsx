"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, MessagesSquare } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import MessagesApp from "@/components/erp/messages/MessagesApp";
import MessageReview from "@/components/erp/messages/MessageReview";

// The Messages page: my own chats, and — for the CEO (everyone's) and department
// managers (their departments') — reviewing other people's conversations (?view=review).
export default function MessagesHub({ meId, canAnnounce, reviewScope, departments }) {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState(reviewScope && searchParams.get("view") === "review" ? "review" : "mine");

  const pick = (next) => {
    setView(next);
    router.replace(next === "review" ? "/dashboard/messages?view=review" : "/dashboard/messages", { scroll: false });
  };

  const switcher = reviewScope ? (
    <div className="grid grid-cols-2 gap-1 border-b border-white/10 p-2">
      {[
        ["mine", MessagesSquare, "erp.messages.viewMine"],
        ["review", Eye, "erp.nav.messageReview"],
      ].map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => pick(key)}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium ${view === key ? "bg-brand-orange text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}
        >
          <Icon size={14} /> {t(label)}
        </button>
      ))}
    </div>
  ) : null;

  return view === "review" ? (
    <MessageReview meId={meId} departments={reviewScope === "department" ? departments : null} switcher={switcher} />
  ) : (
    <MessagesApp meId={meId} canAnnounce={canAnnounce} switcher={switcher} />
  );
}
