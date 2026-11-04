"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, EyeOff, Link2, Unlink, Upload } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { api, errorText } from "@/lib/clientApi";
import { formatMoney } from "@/components/erp/intake/MoneyFields";
import { Button, Card, ErrorText, Select } from "@/components/erp/ui/fields";

// Splits one CSV line, honouring quotes.
function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if ((ch === "," || ch === ";" || ch === "\t") && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// 31/12/2026, 2026-12-31, 12/31/2026 (when the day is over 12) → 2026-12-31
function toIsoDate(s) {
  const v = String(s || "").trim();
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [day, month] = b > 12 ? [b, a] : [a, b];
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}
const toNumber = (s) => Number(String(s || "").replace(/[^\d.-]/g, "")) || 0;

// Import a bank statement (CSV from the bank's website) and tick off each line against
// the payments and expenses already recorded.
export default function BankMatching({ lookups }) {
  const { t, lang } = useLanguage();
  const [branch, setBranch] = useState("");
  const [data, setData] = useState(null);
  const [csv, setCsv] = useState(null); // { header, rows }
  const [map, setMap] = useState({ date: 0, description: 1, amount: 2, out: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    if (!branch) return;
    api(`/api/finance/bank?branch=${branch}`).then(setData).catch((err) => setError(errorText(t, err)));
  }, [branch, t]);
  useEffect(() => {
    load();
  }, [load]);

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return setError(t("erp.bank.emptyFile"));
      const header = splitCsv(lines[0]);
      setCsv({ header, rows: lines.slice(1).map(splitCsv) });
      const find = (re) => header.findIndex((h) => re.test(h));
      setMap({
        date: Math.max(0, find(/date|تاريخ/i)),
        description: Math.max(0, find(/desc|detail|narr|بيان|وصف/i)),
        amount: Math.max(0, find(/amount|مبلغ|credit|دائن/i)),
        out: find(/debit|withdraw|مدين|سحب/i) >= 0 ? String(find(/debit|withdraw|مدين|سحب/i)) : "",
      });
    };
    reader.readAsText(file);
  }

  async function importCsv() {
    setError("");
    const lines = csv.rows.map((r) => ({
      date: toIsoDate(r[map.date]),
      description: r[map.description] || "",
      amount: map.out !== "" && toNumber(r[Number(map.out)]) ? -Math.abs(toNumber(r[Number(map.out)])) : toNumber(r[map.amount]),
    }));
    try {
      const res = await api("/api/finance/bank", { method: "POST", body: { branch, lines } });
      setNotice(t("erp.bank.imported", { added: res.added, skipped: res.skipped }));
      setCsv(null);
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  async function act(line, body) {
    setError("");
    try {
      await api(`/api/finance/bank/${line.id}`, { method: "PATCH", body });
      load();
    } catch (err) {
      setError(errorText(t, err));
    }
  }

  const cols = csv?.header.map((h, i) => ({ value: i, label: h || `#${i + 1}` })) || [];
  const matched = data?.lines.filter((l) => l.entry || l.ignored).length || 0;
  const categories = lookups.settings?.finance.expenseCategories || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select label={t("erp.invoices.branch")} value={branch} onChange={setBranch} placeholder="—" options={lookups.branches.map((b) => ({ value: b.id, label: b.name?.[lang] }))} />
        </div>
        {branch && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">
            <Upload size={15} /> {t("erp.bank.import")}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </label>
        )}
        {data && <p className="text-xs text-white/60">{t("erp.bank.progress", { done: matched, total: data.lines.length })}</p>}
      </div>
      {!branch && <p className="text-sm text-white/60">{t("erp.bank.pickBranch")}</p>}
      <ErrorText>{error}</ErrorText>
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {csv && (
        <Card>
          <p className="mb-3 text-sm font-semibold">{t("erp.bank.mapTitle", { n: csv.rows.length })}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label={t("erp.bank.colDate")} value={map.date} onChange={(v) => setMap((m) => ({ ...m, date: Number(v) }))} options={cols} />
            <Select label={t("erp.bank.colDescription")} value={map.description} onChange={(v) => setMap((m) => ({ ...m, description: Number(v) }))} options={cols} />
            <Select label={t("erp.bank.colAmount")} value={map.amount} onChange={(v) => setMap((m) => ({ ...m, amount: Number(v) }))} options={cols} />
            <Select label={t("erp.bank.colOut")} value={map.out} onChange={(v) => setMap((m) => ({ ...m, out: v }))} placeholder={t("erp.bank.noOutColumn")} options={cols} />
          </div>
          <p className="mt-2 text-xs text-white/60">
            {t("erp.bank.preview")}: {toIsoDate(csv.rows[0]?.[map.date]) || "?"} · {csv.rows[0]?.[map.description]} · {csv.rows[0]?.[map.amount]}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCsv(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={importCsv}>{t("erp.bank.importNow")}</Button>
          </div>
        </Card>
      )}

      {data?.lines.length > 0 && (
        <Card>
          <ul className="divide-y divide-white/5">
            {data.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
                <span className="w-24 tabular-nums text-white/55">{l.date}</span>
                <span className="min-w-0 flex-1 break-words">{l.description}</span>
                <span className={`w-32 text-end font-semibold tabular-nums ${l.amount > 0 ? "text-emerald-300" : "text-red-300"}`}>{formatMoney(l.amount, l.currency, lang)}</span>
                <div className="w-full sm:w-auto sm:min-w-72">
                  {l.entry ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <Check size={14} /> {l.entry.date} · {l.entry.description || t(`erp.bank.kind.${l.entry.kind}`)}
                      <button type="button" aria-label={t("erp.bank.unmatch")} onClick={() => act(l, { unmatch: true })} className="ms-auto text-white/60 hover:text-white">
                        <Unlink size={13} />
                      </button>
                    </div>
                  ) : l.ignored ? (
                    <button type="button" onClick={() => act(l, { ignore: false })} className="text-xs text-white/60 hover:text-white">
                      {t("erp.bank.ignored")}
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      {l.candidates.map((c) => (
                        <button key={c.id} type="button" onClick={() => act(l, { entry: c.id })} className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-2 py-1 text-start text-xs hover:bg-white/5">
                          <Link2 size={12} className="text-sky-300" /> {c.date} · {c.description || t(`erp.bank.kind.${c.kind}`)}
                        </button>
                      ))}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {l.amount < 0 && categories.length > 0 && (
                          <select
                            defaultValue=""
                            aria-label={t("erp.bank.bookExpense")}
                            onChange={(e) => e.target.value && act(l, { createExpense: { category: e.target.value } })}
                            className="rounded-lg border border-white/10 bg-transparent px-2 py-1 [&>option]:bg-brand-navy"
                          >
                            <option value="">{t("erp.bank.bookExpense")}</option>
                            {categories.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.name?.[lang]}
                              </option>
                            ))}
                          </select>
                        )}
                        <button type="button" onClick={() => act(l, { ignore: true })} className="flex items-center gap-1 text-white/60 hover:text-white">
                          <EyeOff size={12} /> {t("erp.bank.ignore")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
