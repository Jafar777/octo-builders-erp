"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, DatabaseZap, FileUp, RefreshCw } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatDateTime } from "@/lib/formatTime";
import { Button, Card, ErrorText, Select } from "@/components/erp/ui/fields";
import { SkeletonList } from "@/components/erp/ui/Loading";
import { useConfirm } from "@/components/erp/ui/Feedback";

async function send(file, { people, digest } = {}) {
  const res = await fetch("/api/legacy-import", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-People": encodeURIComponent(JSON.stringify(people || {})),
      ...(digest ? { "X-Digest": digest } : {}),
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "server_error");
    err.data = data;
    throw err;
  }
  return data;
}

// "Add project data": the CEO uploads the old Excel program's Access file; a preview says
// what's new or changed, and nothing is written before it's confirmed. Temporary, while
// the company still works in Excel too (lib/legacySync.js).
export default function LegacyImport() {
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [people, setPeople] = useState({});
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  const loadHistory = useCallback(() => {
    api("/api/legacy-import")
      .then((d) => setHistory(d.history))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function read(f, map) {
    setBusy("preview");
    setError("");
    setDone(null);
    try {
      setPreview((await send(f, { people: map })).preview);
    } catch (err) {
      setPreview(null);
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }
  function pick(f) {
    if (!f) return;
    setFile(f);
    setPeople({});
    setPreview(null);
    read(f, {});
  }
  function assign(name, id) {
    const next = { ...people, [name]: id };
    if (!id) delete next[name];
    setPeople(next);
    read(file, next);
  }
  async function apply() {
    if (!(await confirm({ text: t("erp.legacyImport.confirm", { a: preview.added.length, c: preview.changed.length }) }))) return;
    setBusy("apply");
    setError("");
    try {
      const { summary } = await send(file, { people, digest: preview.digest });
      setDone(summary);
      setPreview(null);
      setFile(null);
      loadHistory();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy("");
    }
  }

  const nothing = preview && !preview.added.length && !preview.changed.length && !preview.redos;
  // Names given an account by hand stay listed, so the choice can be changed.
  const names = preview ? [...new Set([...preview.newPeople, ...Object.keys(people)])] : [];
  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <p className="flex items-center gap-2 font-semibold">
          <DatabaseZap size={18} className="text-brand-orange" /> {t("erp.legacyImport.title")}
        </p>
        <p className="text-sm leading-relaxed text-white/60">{t("erp.legacyImport.hint")}</p>
        <input
          ref={input}
          type="file"
          accept=".accdb,.mdb"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => input.current?.click()} disabled={Boolean(busy)}>
            <FileUp size={16} /> {t("erp.legacyImport.choose")}
          </Button>
          {file && (
            <span className="text-sm text-white/60" dir="ltr">
              {file.name}
            </span>
          )}
          {file && error && (
            <Button variant="ghost" onClick={() => read(file, people)} disabled={Boolean(busy)}>
              <RefreshCw size={15} /> {t("erp.legacyImport.again")}
            </Button>
          )}
        </div>
        <ErrorText>{error}</ErrorText>
        {busy === "preview" && (
          <>
            <p className="text-sm text-white/60">{t("erp.legacyImport.reading")}</p>
            <SkeletonList rows={3} />
          </>
        )}
        {done && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <CheckCircle2 size={16} className="shrink-0" /> {t("erp.legacyImport.done", { a: done.added, c: done.changed })}
          </p>
        )}
      </Card>

      {preview && !busy.includes("preview") && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["added", preview.added.length],
              ["changed", preview.changed.length],
              ["newProjects", preview.newProjects.length],
              ["conflicts", preview.conflicts.length],
            ].map(([k, n]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-2xl font-semibold tabular-nums">{n}</p>
                <p className="text-xs text-white/60">{t(`erp.legacyImport.count.${k}`)}</p>
              </div>
            ))}
          </div>

          {nothing && <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{t("erp.legacyImport.upToDate")}</p>}

          {names.length > 0 && (
            <Card className="space-y-3">
              <p className="font-semibold">{t("erp.legacyImport.people")}</p>
              <p className="text-xs text-white/60">{t("erp.legacyImport.peopleHint")}</p>
              {names.map((name) => (
                <div key={name} className="grid items-center gap-3 sm:grid-cols-2">
                  <span className="text-sm">{name}</span>
                  <Select value={people[name] || ""} onChange={(id) => assign(name, id)} placeholder={t("erp.legacyImport.newAccount")} options={preview.accounts.map((a) => ({ value: a.id, label: a.name }))} />
                </div>
              ))}
            </Card>
          )}

          <Rows title={t("erp.legacyImport.added")} rows={preview.added} open />
          <Rows title={t("erp.legacyImport.changed")} rows={preview.changed} open />
          {preview.redos > 0 && <p className="text-sm text-white/60">{t("erp.legacyImport.redos", { n: preview.redos })}</p>}
          <Lines title={t("erp.legacyImport.newProjects")} lines={preview.newProjects} />
          <Lines title={t("erp.legacyImport.newStages")} lines={preview.newStages.map((x) => `${x.project}: ${x.stages.join(" · ")}`)} />
          <Lines title={t("erp.legacyImport.reopened")} lines={preview.reopened} />
          <Lines title={t("erp.legacyImport.closed")} lines={preview.closed.map((x) => x.project)} />
          <Rows title={t("erp.legacyImport.twins")} hint={t("erp.legacyImport.twinsHint")} rows={preview.twins} tone="amber" open />
          <Rows title={t("erp.legacyImport.conflicts")} hint={t("erp.legacyImport.conflictsHint")} rows={preview.conflicts} tone="amber" />
          <Rows title={t("erp.legacyImport.leftOut")} hint={t("erp.legacyImport.leftOutHint")} rows={preview.leftOut} tone="amber" />
          <Rows title={t("erp.legacyImport.keptHere")} hint={t("erp.legacyImport.keptHereHint")} rows={preview.keptHere} tone="amber" />
          <Lines title={t("erp.legacyImport.skipped")} lines={preview.skipped.map((x) => `#${x.id}: ${x.why}`)} />
          <Lines title={t("erp.legacyImport.warnings")} lines={preview.warnings} />

          {!nothing && (
            <div className="sticky bottom-4 flex justify-end">
              <Button onClick={apply} loading={busy === "apply"} disabled={Boolean(busy)}>
                <CheckCircle2 size={16} /> {t("erp.legacyImport.apply")}
              </Button>
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <Card>
          <p className="mb-3 font-semibold">{t("erp.legacyImport.history")}</p>
          <ul className="divide-y divide-white/5 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="text-white/60">{formatDateTime(h.at, lang)}</span>
                <span>{h.by}</span>
                <span className="text-white/60" dir="ltr">
                  {h.fileName}
                </span>
                <span className="ms-auto text-white/70">{t("erp.legacyImport.done", { a: h.summary.added, c: h.summary.changed })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Rows({ title, hint, rows, tone = "", open = false }) {
  const { t } = useLanguage();
  if (!rows.length) return null;
  return (
    <details open={open && rows.length <= 60} className={`rounded-2xl border p-4 ${tone === "amber" ? "border-amber-400/30 bg-amber-400/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
      <summary className="cursor-pointer text-sm font-semibold">
        {title} · {rows.length}
      </summary>
      {hint && <p className="mt-2 text-xs text-white/60">{hint}</p>}
      <ul className="mt-3 divide-y divide-white/5 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-mono text-xs text-white/60" dir="ltr">
              Excel #{r.id}
              {r.number ? ` → #${r.number}` : ""}
              {r.here ? ` ≈ #${r.here}` : ""}
            </span>
            <span className="min-w-0 flex-1">
              {[r.project, r.title].filter(Boolean).join(" · ")}
              {r.revision > 0 && (
                <span className="ms-2 text-xs text-white/60" dir="ltr">
                  R-{String(r.revision).padStart(2, "0")}
                </span>
              )}
            </span>
            <span className="text-white/60">{r.assignee}</span>
            <span className="text-xs text-white/70">
              {r.was && r.was !== r.status ? `${t(`erp.tasks.status.${r.was}`)} → ` : ""}
              {t(`erp.tasks.status.${r.status}`)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Lines({ title, lines }) {
  if (!lines.length) return null;
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {title} · {lines.length}
      </summary>
      <ul className="mt-3 space-y-1 text-sm text-white/70">
        {lines.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </details>
  );
}
