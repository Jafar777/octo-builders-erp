"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

// Everything the task screens need to show names: task types, rating tags,
// people, departments and projects.
export function useTaskLookups() {
  const { lang } = useLanguage();
  const [settings, setSettings] = useState({ taskTypes: [], ratingTags: [] });
  const [people, setPeople] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  const loadProjects = useCallback(() => {
    fetch("/api/work-projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, []);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.settings && setSettings(d.settings.tasks))
      .catch(() => {});
    fetch("/api/messages/people", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setPeople((d.people || []).filter((p) => p.active));
        setDepartments(d.departments || []);
      })
      .catch(() => {});
    loadProjects();
  }, [loadProjects]);

  return useMemo(() => {
    const typeName = (key) => settings.taskTypes.find((t) => t.key === key)?.name?.[lang] || key;
    const tag = (key) => settings.ratingTags.find((r) => r.key === key);
    const departmentName = (id) => departments.find((d) => d.id === id)?.name?.[lang] || "—";
    return { settings, people, departments, projects, projectsLoaded, typeName, tag, departmentName, reloadProjects: loadProjects };
  }, [settings, people, departments, projects, projectsLoaded, lang, loadProjects]);
}
