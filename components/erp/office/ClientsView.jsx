"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, PhoneCall, Plus, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDate, formatRelative } from "@/lib/formatTime";
import { CHANNELS, whatsappLink } from "@/lib/office";
import Modal from "@/components/erp/ui/Modal";
import { Button, ErrorText } from "@/components/erp/ui/fields";
import { useConfirm } from "@/components/erp/ui/Feedback";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { EmptyState } from "@/components/erp/ui/DataTools";
import { SearchBox } from "@/components/erp/ui/ListControls";
import CallsView from "@/components/erp/office/CallsView";
import { inputCls, ItemRow } from "@/components/erp/office/officeUi";

const SOURCES = ["referral", "website", "social", "walk_in", "repeat", "other"];

// The office's clients: a searchable list; one opens its 360 view.
export default function ClientsView({ onOpenItem, refreshKey, onClientsChanged, focusClient = null }) {
  const { t, lang } = useLanguage();
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(focusClient);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api(`/api/office/clients${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
      .then((d) => setList(d.clients))
      .catch((err) => setError(errorText(t, err)));
  }, [q, t]);
  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder={t("erp.office.clients.search")} className="w-72" />
        <Button className="ms-auto" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t("erp.office.clients.new")}
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      {!list && !error && <SkeletonList rows={6} />}
      {list?.length === 0 && <EmptyState compact text={t("erp.office.clients.none")} />}
      <div className="grid gap-2 md:grid-cols-2">
        {list?.map((c) => (
          <button
            key={c.id}
            type="button"
            data-entity={`client:${c.id}`}
            onClick={() => setOpenId(c.id)}
            className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-start hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-white">{c.name}</span>
              <span className="rounded-md bg-white/5 px-1.5 text-[11px] text-white/50">{t(`erp.office.clients.kind.${c.kind}`)}</span>
              {c.openItems > 0 && <span className="ms-auto rounded-full bg-amber-500/15 px-2 text-[11px] text-amber-200">{t("erp.office.clients.open", { n: c.openItems })}</span>}
            </div>
            <p className="mt-1 truncate text-xs text-white/50" dir="auto">
              {[c.phone, c.city, c.source && t(`erp.sales.sources.${c.source}`)].filter(Boolean).join(" · ")}
            </p>
            {c.lastContact && (
              <p className="mt-1 truncate text-[11px] text-white/40">
                {t("erp.office.clients.last", { when: formatRelative(c.lastContact.at, lang) })} — {c.lastContact.summary}
              </p>
            )}
          </button>
        ))}
      </div>
      {openId && (
        <Client360
          id={openId}
          onClose={() => setOpenId(null)}
          onOpenItem={onOpenItem}
          onChanged={() => {
            load();
            onClientsChanged?.();
          }}
          onDeleted={() => {
            setOpenId(null);
            setList((l) => l?.filter((c) => c.id !== openId) || l);
            load();
            onClientsChanged?.();
          }}
        />
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title={t("erp.office.clients.new")} wide>
        {adding && (
          <ClientForm
            onCancel={() => setAdding(false)}
            onSaved={(c) => {
              setAdding(false);
              load();
              onClientsChanged?.();
              setOpenId(c.id);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// New or edit a client: name, kind, phone / WhatsApp / email, city, source, contact people.
function ClientForm({ client = null, onSaved, onCancel }) {
  const { t } = useLanguage();
  const [f, setF] = useState(client || { name: "", kind: "person", phone: "", whatsapp: "", email: "", city: "", source: "other", notes: "", contacts: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setContact = (i, k, v) => setF((x) => ({ ...x, contacts: x.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const d = await api(client ? `/api/office/clients/${client.id}` : "/api/office/clients", { method: client ? "PATCH" : "POST", body: f });
      onSaved(d.client);
    } catch (err) {
      setError(errorText(t, err));
      setBusy(false);
    }
  }

  const field = (k, ph, dir) => <input value={f[k] || ""} onChange={(e) => set(k)(e.target.value)} placeholder={t(ph)} aria-label={t(ph)} dir={dir} className={inputCls} />;
  return (
    <div className="space-y-3">
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("name", "erp.office.clients.name")}
        <div className="flex gap-1 rounded-xl border border-white/10 p-1">
          {["person", "company"].map((k) => (
            <button key={k} type="button" onClick={() => set("kind")(k)} className={`flex-1 rounded-lg py-1.5 text-xs ${f.kind === k ? "bg-brand-orange text-white" : "text-white/60"}`}>
              {t(`erp.office.clients.kind.${k}`)}
            </button>
          ))}
        </div>
        {field("phone", "erp.office.contactPhone", "ltr")}
        {field("whatsapp", "erp.office.clients.whatsapp", "ltr")}
        {field("email", "erp.office.clients.email", "ltr")}
        {field("city", "erp.office.clients.city")}
        <select value={f.source || "other"} onChange={(e) => set("source")(e.target.value)} aria-label={t("erp.office.source")} className={inputCls}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`erp.sales.sources.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <textarea value={f.notes || ""} onChange={(e) => set("notes")(e.target.value)} rows={2} placeholder={t("erp.office.clients.notes")} className={inputCls} />
      {f.kind === "company" && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-white/60">{t("erp.office.clients.contacts")}</p>
          {f.contacts.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input value={c.name} onChange={(e) => setContact(i, "name", e.target.value)} placeholder={t("erp.office.contactName")} className={inputCls} />
              <input value={c.role || ""} onChange={(e) => setContact(i, "role", e.target.value)} placeholder={t("erp.office.clients.role")} className={inputCls} />
              <input value={c.phone || ""} onChange={(e) => setContact(i, "phone", e.target.value)} placeholder={t("erp.office.contactPhone")} dir="ltr" className={inputCls} />
              <button type="button" aria-label={t("common.delete")} onClick={() => setF((x) => ({ ...x, contacts: x.contacts.filter((_, j) => j !== i) }))} className="rounded-xl border border-white/10 px-3 text-red-300">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setF((x) => ({ ...x, contacts: [...x.contacts, { name: "", role: "", phone: "" }] }))} className="text-xs text-brand-orange hover:underline">
            + {t("erp.office.clients.addContact")}
          </button>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button loading={busy} disabled={!f.name?.trim()} onClick={save}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

const SECTIONS = ["timeline", "items", "sales", "projects", "meetings", "correspondence"];

// Client 360: contact buttons, a quick note of a call, and everything the company has
// with them — calls, open items and complaints, inquiries and quotations, intake forms
// and projects, meetings, correspondence.
function Client360({ id, onClose, onOpenItem, onChanged, onDeleted }) {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!(await confirm({ kind: "delete", text: t("erp.office.clients.deleteAsk", { name: data?.client?.name || "" }) }))) return;
    setDeleting(true);
    setError("");
    try {
      await api(`/api/office/clients/${id}`, { method: "DELETE" });
      onDeleted?.();
    } catch (err) {
      setError(err?.message === "in_use" ? t("erp.office.clients.deleteInUse") : errorText(t, err));
      setDeleting(false);
    }
  }
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("timeline");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState({ summary: "", channel: "call_out", callback: false });

  const load = useCallback(() => {
    api(`/api/office/clients/${id}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [id, t]);
  useEffect(() => {
    load();
  }, [load]);

  async function logContact() {
    if (!note.summary.trim()) return;
    try {
      await api("/api/office/interactions", { method: "POST", body: { ...note, client: id } });
      setNote({ summary: "", channel: note.channel, callback: false });
      load();
      onChanged?.();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const c = data?.client;
  const wa = whatsappLink(c?.whatsapp || c?.phone);
  const counts = data && { timeline: data.interactions.length, items: data.items.length, sales: data.leads.length + data.quotations.length, projects: data.intakes.length + data.projects.length, meetings: data.meetings.length, correspondence: data.correspondence.length };

  return (
    <Modal open onClose={onClose} title={c?.name || t("erp.office.clients.title")} wide>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <SkeletonList rows={4} />}
      {data && editing && (
        <ClientForm
          client={c}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
            onChanged?.();
          }}
        />
      )}
      {data && !editing && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10" dir="ltr">
                <PhoneCall size={14} /> {c.phone}
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                WhatsApp
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white">
                <Mail size={14} /> {c.email}
              </a>
            )}
            <span className="text-xs text-white/45">{[t(`erp.office.clients.kind.${c.kind}`), c.city, c.source && t(`erp.sales.sources.${c.source}`)].filter(Boolean).join(" · ")}</span>
            <button type="button" onClick={() => setEditing(true)} className="ms-auto text-xs text-brand-orange hover:underline">
              {t("common.edit")}
            </button>
            <button type="button" onClick={remove} disabled={deleting} className="flex items-center gap-1 text-xs text-red-300 hover:underline disabled:opacity-50">
              <Trash2 size={13} /> {t("common.delete")}
            </button>
          </div>
          {c.notes && <p className="whitespace-pre-wrap rounded-xl bg-white/[0.03] p-3 text-xs text-white/70">{c.notes}</p>}
          {c.contacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {c.contacts.map((p) => (
                <span key={p.id} className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-white/75">
                  {p.name}
                  {p.role && <span className="text-white/45"> · {p.role}</span>}
                  {p.phone && (
                    <a href={`tel:${p.phone}`} className="ms-1 text-sky-300" dir="ltr">
                      {p.phone}
                    </a>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Log a contact with them, right here. */}
          <div className="flex flex-col gap-2 rounded-xl border border-white/10 p-3 sm:flex-row sm:items-center">
            <select value={note.channel} onChange={(e) => setNote((n) => ({ ...n, channel: e.target.value }))} aria-label={t("erp.office.channelLabel")} className={`${inputCls} sm:w-36`}>
              {CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {t(`erp.office.channel.${ch}`)}
                </option>
              ))}
            </select>
            <input
              value={note.summary}
              onChange={(e) => setNote((n) => ({ ...n, summary: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && logContact()}
              placeholder={t("erp.office.clients.logPlaceholder")}
              className={`${inputCls} flex-1`}
            />
            <label className="flex items-center gap-1.5 text-xs text-white/65">
              <input type="checkbox" checked={note.callback} onChange={(e) => setNote((n) => ({ ...n, callback: e.target.checked }))} className="accent-[#f68b1f]" />
              {t("erp.office.callbackNeeded")}
            </label>
            <Button disabled={!note.summary.trim()} onClick={logContact}>
              {t("erp.office.capture.save")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-white/10">
            {SECTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setSection(s)} data-active={section === s} className={`px-3 py-2 text-xs ${section === s ? "border-b-2 border-brand-orange text-white" : "text-white/55 hover:text-white"}`}>
                {t(`erp.office.clients.section.${s}`)} <span className="text-white/40">{counts[s]}</span>
              </button>
            ))}
          </div>

          {section === "timeline" && <CallsView compact list={data.interactions} />}
          {section === "items" && (
            <div className="space-y-2">
              {data.items.length === 0 && <p className="text-xs text-white/40">{t("erp.office.noItems")}</p>}
              {data.items.map((i) => (
                <ItemRow key={i.id} item={i} onOpen={onOpenItem} />
              ))}
            </div>
          )}
          {section === "sales" && (
            <List
              rows={[
                ...data.leads.map((l) => ({ id: l.id, href: "/dashboard/finance?tab=sales", title: l.name, sub: [t(`erp.sales.stage.${l.stage}`), l.need, formatDate(l.createdAt, lang)] })),
                ...data.quotations.map((q) => ({ id: q.id, href: "/dashboard/finance?tab=sales&view=quotes", title: `${t("erp.office.clients.quotation")} ${q.number}`, sub: [q.status, formatDate(q.createdAt, lang)] })),
              ]}
            />
          )}
          {section === "projects" && (
            <List
              rows={[
                ...data.intakes.map((i) => ({ id: i.id, href: `/dashboard/intake?form=${i.id}`, title: `${t("erp.office.clients.intake")} #${i.number} ${i.project}`, sub: [i.status, formatDate(i.createdAt, lang)] })),
                ...data.projects.map((p) => ({ id: p.id, href: `/dashboard/projects/${p.id}`, title: [p.code, p.name].filter(Boolean).join(" · "), sub: [p.status] })),
              ]}
            />
          )}
          {section === "meetings" && <List rows={data.meetings.map((m) => ({ id: m.id, title: m.title, sub: [formatDate(m.start, lang), t(`erp.office.meetingStatus.${m.status}`)] }))} />}
          {section === "correspondence" && <List rows={data.correspondence.map((x) => ({ id: x.id, title: `${x.ref} · ${x.subject}`, sub: [t(`erp.office.corr.direction.${x.direction}`), x.counterparty, x.date] }))} />}
        </div>
      )}
    </Modal>
  );
}

function List({ rows }) {
  const { t } = useLanguage();
  if (!rows.length) return <p className="text-xs text-white/40">{t("erp.office.nothingYet")}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const body = (
          <>
            <p className="truncate text-sm text-white">{r.title}</p>
            <p className="mt-0.5 truncate text-[11px] text-white/50">{r.sub.filter(Boolean).join(" · ")}</p>
          </>
        );
        return r.href ? (
          <a key={r.id} href={r.href} className="block rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 hover:border-white/20">
            {body}
          </a>
        ) : (
          <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
            {body}
          </div>
        );
      })}
    </div>
  );
}
