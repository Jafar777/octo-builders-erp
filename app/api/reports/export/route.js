import ExcelJS from "exceljs";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { runReport } from "@/lib/reports";

// The report as an Excel workbook: the rows, and the grouped totals when grouped.
// { ...config, labels: { column: heading }, title }
export async function POST(request) {
  const user = await requirePermission("reports.build");
  if (!user || user.limited) return forbidden();
  const body = await readJson(request);
  const out = await runReport(user, body);
  if (out.error) return fail(out.error, 403);
  const labels = body.labels || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = "Octa Builders";
  const ws = wb.addWorksheet(String(body.title || "Report").slice(0, 30));
  ws.columns = out.columns.map((c) => ({ header: labels[c.key] || c.key, key: c.key, width: c.type === "text" ? 28 : 14 }));
  ws.getRow(1).font = { bold: true };
  for (const r of out.rows) ws.addRow(r);
  if (out.groups) {
    const g = wb.addWorksheet("Summary");
    g.columns = [
      { header: labels._group || "Group", key: "key", width: 30 },
      { header: labels._value || "Value", key: "value", width: 16 },
      { header: labels._count || "Count", key: "count", width: 10 },
    ];
    g.getRow(1).font = { bold: true };
    for (const row of out.groups) g.addRow(row);
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="report-${body.dataset || "data"}.xlsx"`,
    },
  });
}
