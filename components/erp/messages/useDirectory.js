"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

// People and departments for names/avatars in the chat screens.
export function useDirectory() {
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetch("/api/messages/people", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setPeople(data.people || []);
        setDepartments(data.departments || []);
      })
      .catch(() => {});
  }, []);

  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  return { people, departments, byId };
}

// Display name + avatar of a conversation from the viewer's point of view.
export function useConversationLabel(directory, meId) {
  const { t, lang } = useLanguage();
  return useCallback(
    (c) => {
      if (!c) return { name: "", avatarUrl: "" };
      if (c.type === "direct") {
        const otherId = c.members.find((m) => m !== meId) || meId;
        const other = directory.byId[otherId];
        return { name: other?.name || "…", avatarUrl: other?.avatarUrl || "", otherId };
      }
      if (c.type === "department") {
        const dep = directory.departments.find((d) => d.id === c.department);
        return { name: `# ${dep?.name?.[lang] || t("erp.messages.department")}`, avatarUrl: "" };
      }
      if (c.type === "announcement") return { name: t("erp.messages.company"), avatarUrl: "" };
      return { name: c.name, avatarUrl: c.avatarUrl };
    },
    [directory, meId, t, lang]
  );
}
