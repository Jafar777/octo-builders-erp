"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import Avatar from "@/components/erp/ui/Avatar";
import { Button, Card, ErrorText } from "@/components/erp/ui/fields";

// The CEO's monthly rating of the executive office (roles scored "on office work"):
// 1–5 on each criterion. It's one part of their KPI (lib/kpi/office.js).
export default function OfficeRating({ month }) {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api(`/api/office/rating?month=${month}`)
      .then(setData)
      .catch((err) => setError(errorText(t, err)));
  }, [month, t]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data || !data.people.length) return error ? <ErrorText>{error}</ErrorText> : null;
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t("erp.office.rating.title")}</h2>
        <p className="text-xs text-white/55">{t("erp.office.rating.subtitle")}</p>
      </div>
      <ErrorText>{error}</ErrorText>
      {data.people.map((p) => (
        <PersonRating key={`${p.id}-${month}-${p.rating?.percent ?? "x"}`} person={p} data={data} month={month} lang={lang} onSaved={load} />
      ))}
    </div>
  );
}

function PersonRating({ person, data, month, lang, onSaved }) {
  const { t } = useLanguage();
  const [scores, setScores] = useState(person.rating?.scores || {});
  const [note, setNote] = useState(person.rating?.note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const complete = data.criteria.every((c) => scores[c.key] >= 1);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/office/rating", { method: "PUT", body: { month, userId: person.id, scores, note } });
      onSaved();
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} src={person.avatarUrl} size={40} />
        <p className="flex-1 font-semibold">{person.name}</p>
        {person.rating && <span className="text-2xl font-bold text-amber-200">{person.rating.percent}%</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.criteria.map((c) => (
          <div key={c.key}>
            <p className="mb-1 text-xs text-white/65">{c.name?.[lang] || c.name?.en}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={data.closed}
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                  className={`h-8 w-8 rounded-lg text-sm ${scores[c.key] === n ? "bg-brand-orange text-white" : "bg-white/5 text-white/60 hover:bg-white/10"} disabled:opacity-50`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={data.closed}
        rows={2}
        placeholder={t("erp.office.rating.note")}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40"
      />
      <ErrorText>{error}</ErrorText>
      {data.closed ? (
        <p className="text-xs text-white/50">{t("erp.hr.closed")}</p>
      ) : (
        <Button loading={busy} disabled={!complete} onClick={save}>
          {t("common.save")}
        </Button>
      )}
    </Card>
  );
}
