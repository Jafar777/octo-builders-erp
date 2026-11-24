"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

// Everything the task screens need to show names: task types, rating tags,
// people, departments and projects. `enabled: false` skips loading (customers, who
// can't read them).
export function useTaskLookups({ enabled = true } = {}) {
  const { lang } = useLanguage();
  const [settings, setSettings] = useState({ taskTypes: [], ratingTags: [] });
  const [people, setPeople] = useState([]);
  // The staff list couldn't be loaded (an empty list would look like "nobody").
  const [peopleFailed, setPeopleFailed] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const loadProjects = useCallback(() => {
    if (!enabled) return;
    fetch("/api/work-projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, [enabled]);

  const loadPeople = useCallback(async () => {
    // One more try after a short failure (the server restarting, a lost connection).
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 2000));
      try {
        const r = await fetch("/api/messages/people", { cache: "no-store" });
        if (!r.ok) continue;
        const d = await r.json();
        setPeople((d.people || []).filter((p) => p.active));
        setDepartments(d.departments || []);
        setPeopleFailed(false);
        return;
      } catch {
        // tried again below
      }
    }
    setPeopleFailed(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.settings && setSettings(d.settings.tasks))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set after the request, not at once
    loadPeople();
    loadProjects();
  }, [loadPeople, loadProjects, enabled]);

  return useMemo(() => {
    const typeName = (key) => settings.taskTypes.find((t) => t.key === key)?.name?.[lang] || key;
    const tag = (key) => settings.ratingTags.find((r) => r.key === key);
    const departmentName = (id) => departments.find((d) => d.id === id)?.name?.[lang] || "—";
    return { settings, people, peopleFailed, reloadPeople: loadPeople, departments, projects, projectsLoaded, typeName, tag, departmentName, reloadProjects: loadProjects };
  }, [settings, people, peopleFailed, departments, projects, projectsLoaded, lang, loadProjects, loadPeople]);
}
