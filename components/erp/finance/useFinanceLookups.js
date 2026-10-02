"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api } from "@/lib/clientApi";

export function useFinanceLookups() {
  const { lang } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [branches, setBranches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);

  const loadClients = useCallback(() => api("/api/finance/clients").then((d) => setClients(d.clients)).catch(() => {}), []);
  const loadSettings = useCallback(() => api("/api/settings").then((d) => setSettings(d.settings)).catch(() => {}), []);

  useEffect(() => {
    loadSettings();
    api("/api/org/branches").then((d) => setBranches(d.items)).catch(() => {});
    api("/api/work-projects").then((d) => setProjects(d.projects)).catch(() => {});
    loadClients();
  }, [loadClients, loadSettings]);

  return useMemo(
    () => ({
      settings,
      branches,
      projects,
      clients,
      base: settings?.currencies.base || "USD",
      branchName: (id) => branches.find((b) => b.id === id)?.name?.[lang] || "—",
      projectName: (id) => projects.find((p) => p.id === id)?.name?.[lang] || "—",
      clientName: (id) => clients.find((c) => c.id === id)?.name || "",
      categoryName: (key) => settings?.finance.expenseCategories.find((c) => c.key === key)?.name?.[lang] || key,
      reloadClients: loadClients,
      reloadSettings: loadSettings,
    }),
    [settings, branches, projects, clients, lang, loadClients, loadSettings]
  );
}
