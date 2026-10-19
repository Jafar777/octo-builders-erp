"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Crown, Hand, Minus, Plus, Search, Users } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useOnlineUsers } from "@/context/RealtimeContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { ErrorText, Select } from "@/components/erp/ui/fields";
import { Skeleton } from "@/components/erp/ui/Loading";

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15];
const topRank = (p) => ({ gm: 0, ceo: 1 })[p.role] ?? 2;

// One person on the chart.
function PersonCard({ person, dept, lang, t, isMe, selected, online, reports, collapsed, onSelect, onToggle, showManual }) {
  const top = !person.managerId;
  return (
    <div
      id={`org-node-${person.id}`}
      className={`relative w-44 rounded-2xl border bg-brand-navy transition-shadow ${
        selected ? "border-brand-orange shadow-[0_0_0_3px_rgba(243,123,32,0.25)]" : isMe ? "border-brand-orange/50" : "border-white/10"
      }`}
    >
      <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: dept?.color || "rgb(255 255 255 / 0.15)" }} />
      <button type="button" onClick={() => onSelect(person.id)} className="flex w-full flex-col items-center gap-2 px-3 pb-3 pt-4 text-center">
        <Avatar name={person.name} src={person.avatarUrl} size={top ? 60 : 48} online={online} />
        <span className="w-full">
          <span className="flex items-center justify-center gap-1 text-sm font-semibold leading-snug">
            {top && <Crown size={13} className="shrink-0 text-amber-300" />}
            <span className="line-clamp-2">{person.name}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/55">{person.jobTitle?.[lang] || person.roleName?.[lang]}</span>
          {dept && <span className="mt-0.5 block truncate text-[11px] text-white/35">{dept.name?.[lang]}</span>}
        </span>
        {(isMe || (showManual && person.source === "manual")) && (
          <span className="flex flex-wrap justify-center gap-1">
            {isMe && <span className="rounded-full bg-brand-orange/20 px-2 py-0.5 text-[10px] text-brand-orange">{t("erp.hierarchy.you")}</span>}
            {showManual && person.source === "manual" && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-200" title={t("erp.hierarchy.manualHint")}>
                <Hand size={10} /> {t("erp.hierarchy.manual")}
              </span>
            )}
          </span>
        )}
      </button>
      {reports > 0 && (
        <button
          type="button"
          onClick={() => onToggle(person.id)}
          className="absolute -bottom-3 start-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-brand-navy px-2 py-0.5 text-[11px] text-white/70 hover:text-white rtl:translate-x-1/2"
          aria-label={t(collapsed ? "erp.hierarchy.expand" : "erp.hierarchy.collapse")}
        >
          <Users size={11} /> {reports}
          <ChevronDown size={11} className={collapsed ? "-rotate-90 rtl:rotate-90" : ""} />
        </button>
      )}
    </div>
  );
}

export default function OrgChart() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const online = useOnlineUsers();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(2);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/org/hierarchy"));
    } catch (err) {
      setError(errorText(t, err));
    }
  }, [t]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const { byId, childrenOf, roots, deptOf } = useMemo(() => {
    const people = data?.people || [];
    const map = new Map(people.map((p) => [p.id, p]));
    const kids = {};
    for (const p of people) if (p.managerId) (kids[p.managerId] ||= []).push(p);
    // Bosses first, then by name.
    const order = (a, b) => (kids[b.id]?.length || 0) - (kids[a.id]?.length || 0) || a.name.localeCompare(b.name);
    Object.values(kids).forEach((list) => list.sort(order));
    const depts = Object.fromEntries((data?.departments || []).map((d) => [d.id, d]));
    return {
      byId: map,
      childrenOf: kids,
      // GM before CEO before anyone else left at the top.
      roots: people.filter((p) => !p.managerId).sort((a, b) => topRank(a) - topRank(b) || order(a, b)),
      deptOf: (p) => (p?.department ? depts[p.department] : null),
    };
  }, [data]);

  const meId = user?.id;
  const focusId = selectedId && byId.has(selectedId) ? selectedId : byId.has(meId) ? meId : roots[0]?.id;
  const focus = byId.get(focusId);

  // Focus person's chain, from the top down to them.
  const chain = useMemo(() => {
    const list = [];
    const seen = new Set();
    for (let p = focus; p && !seen.has(p.id); p = byId.get(p.managerId)) {
      seen.add(p.id);
      list.unshift(p);
    }
    return list;
  }, [focus, byId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (data?.people || [])
      .filter((p) => [p.name, p.jobTitle?.[lang], p.roleName?.[lang], deptOf(p)?.name?.[lang]].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, data, lang, deptOf]);

  function select(id, scroll = false) {
    setSelectedId(id);
    if (!scroll) return;
    // Open every collapsed boss above them, then bring the card into view.
    setCollapsed((c) => {
      const next = new Set(c);
      for (let p = byId.get(byId.get(id)?.managerId); p; p = byId.get(p.managerId)) next.delete(p.id);
      return next;
    });
    setTimeout(() => document.getElementById(`org-node-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 60);
  }

  const toggle = (id) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function setManager(managerId) {
    setSaving(true);
    setError("");
    try {
      await api("/api/org/hierarchy", { method: "PATCH", body: { userId: focus.id, managerId: managerId || null } });
      await load();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setSaving(false);
    }
  }

  function renderNode(p) {
    const kids = childrenOf[p.id] || [];
    const isCollapsed = collapsed.has(p.id);
    const card = (
      <PersonCard
        person={p}
        dept={deptOf(p)}
        lang={lang}
        t={t}
        isMe={p.id === meId}
        selected={p.id === focusId}
        online={online.has(p.id)}
        reports={kids.length}
        collapsed={isCollapsed}
        onSelect={(id) => select(id)}
        onToggle={toggle}
        showManual={data.canEdit}
      />
    );
    if (!kids.length || isCollapsed) return <li key={p.id}>{card}</li>;
    // Colleagues at the same level always sit side by side on one row.
    return (
      <li key={p.id}>
        {card}
        <ul>{kids.map(renderNode)}</ul>
      </li>
    );
  }

  if (!data)
    return error ? (
      <ErrorText>{error}</ErrorText>
    ) : (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );

  const boss = focus ? byId.get(focus.managerId) : null;
  const team = focus ? childrenOf[focus.id] || [] : [];
  const gm = roots[0];

  return (
    <div className="space-y-5">
      {/* Focus panel: the selected person (me by default), their chain and team */}
      {focus && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={focus.name} src={focus.avatarUrl} size={56} online={online.has(focus.id)} />
              <div>
                <p className="text-lg font-semibold">
                  {focus.name}
                  {focus.id === meId && <span className="ms-2 text-xs font-normal text-brand-orange">({t("erp.hierarchy.you")})</span>}
                </p>
                <p className="text-sm text-white/55">
                  {[focus.jobTitle?.[lang] || focus.roleName?.[lang], deptOf(focus)?.name?.[lang]].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>

            <div className="min-w-48">
              <p className="mb-1.5 text-xs uppercase tracking-wider text-white/40">{t("erp.hierarchy.reportsTo")}</p>
              {boss ? (
                <button type="button" onClick={() => select(boss.id, true)} className="flex items-center gap-2 rounded-xl px-1 py-0.5 hover:bg-white/5">
                  <Avatar name={boss.name} src={boss.avatarUrl} size={32} />
                  <span className="text-start">
                    <span className="block text-sm font-medium">{boss.name}</span>
                    <span className="block text-xs text-white/45">{boss.jobTitle?.[lang] || boss.roleName?.[lang]}</span>
                  </span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-amber-300">
                  <Crown size={14} /> {t("erp.hierarchy.top")}
                </span>
              )}
            </div>

            {team.length > 0 && (
              <div className="min-w-48">
                <p className="mb-1.5 text-xs uppercase tracking-wider text-white/40">{t("erp.hierarchy.team", { n: team.length })}</p>
                <div className="flex -space-x-2 rtl:space-x-reverse">
                  {team.slice(0, 8).map((k) => (
                    <button key={k.id} type="button" onClick={() => select(k.id, true)} title={k.name} className="rounded-full ring-2 ring-brand-navy">
                      <Avatar name={k.name} src={k.avatarUrl} size={32} />
                    </button>
                  ))}
                  {team.length > 8 && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs ring-2 ring-brand-navy">+{team.length - 8}</span>
                  )}
                </div>
              </div>
            )}

            {gm && gm.id !== focus.id && (
              <div className="min-w-48">
                <p className="mb-1.5 text-xs uppercase tracking-wider text-white/40">{t("erp.hierarchy.gm")}</p>
                <button type="button" onClick={() => select(gm.id, true)} className="flex items-center gap-2 rounded-xl px-1 py-0.5 hover:bg-white/5">
                  <Avatar name={gm.name} src={gm.avatarUrl} size={32} />
                  <span className="text-sm font-medium">{gm.name}</span>
                </button>
              </div>
            )}
          </div>

          {/* Chain of command, top → person */}
          {chain.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-3 text-xs">
              {chain.map((p, i) => (
                <span key={p.id} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronLeft size={13} className="text-white/30 ltr:rotate-180" />}
                  <button
                    type="button"
                    onClick={() => select(p.id, true)}
                    className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${p.id === focus.id ? "border-brand-orange/50 text-white" : "border-white/10 text-white/60 hover:text-white"}`}
                  >
                    <Avatar name={p.name} src={p.avatarUrl} size={18} />
                    {p.name}
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* GM: change who this person reports to */}
          {data.canEdit && (
            <div className="mt-4 grid items-end gap-3 border-t border-white/5 pt-3 sm:grid-cols-[minmax(0,320px)_1fr]">
              <Select
                label={t("erp.hierarchy.setReportsTo")}
                value={focus.source === "manual" ? focus.managerId : ""}
                disabled={saving}
                onChange={setManager}
                placeholder={t("erp.hierarchy.automatic")}
                options={data.people.filter((p) => p.id !== focus.id).map((p) => ({ value: p.id, label: p.name }))}
              />
              <p className="text-xs text-white/40">{t("erp.hierarchy.autoHint")}</p>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("erp.hierarchy.search")}
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pe-3 ps-9 text-sm outline-none focus:border-white/30"
          />
          {matches.length > 0 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-white/10 bg-brand-navy shadow-xl">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    select(p.id, true);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-white/5"
                >
                  <Avatar name={p.name} src={p.avatarUrl} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-xs text-white/45">
                      {[p.jobTitle?.[lang] || p.roleName?.[lang], deptOf(p)?.name?.[lang]].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 disabled:opacity-30" aria-label={t("erp.hierarchy.zoomOut")}>
            <Minus size={15} />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-white/60">{Math.round(ZOOMS[zoom] * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 disabled:opacity-30" aria-label={t("erp.hierarchy.zoomIn")}>
            <Plus size={15} />
          </button>
        </div>
        {meId && byId.has(meId) && (
          <button type="button" onClick={() => select(meId, true)} className="text-sm text-brand-orange hover:underline">
            {t("erp.hierarchy.findMe")}
          </button>
        )}
      </div>

      {/* The chart */}
      <div className="overflow-auto rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="org-tree mx-auto w-max" style={{ zoom: ZOOMS[zoom] }}>
          <ul>{roots.map(renderNode)}</ul>
        </div>
        {roots.length === 0 && <p className="py-10 text-center text-white/40">{t("dashboard.noItems")}</p>}
      </div>
    </div>
  );
}
