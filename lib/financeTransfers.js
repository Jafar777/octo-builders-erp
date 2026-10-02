const idStr = (v) => (v ? v.toString() : null);

export function serializeTransfer(t) {
  return {
    id: t._id.toString(),
    fromBranch: idStr(t.fromBranch),
    toBranch: idStr(t.toBranch),
    date: t.date,
    method: t.method,
    amountSent: t.amountSent,
    currencySent: t.currencySent,
    rateSent: t.rateSent,
    baseSent: t.baseSent,
    status: t.status,
    amountReceived: t.amountReceived,
    currencyReceived: t.currencyReceived,
    rateReceived: t.rateReceived,
    baseReceived: t.baseReceived,
    receivedAt: t.receivedAt,
    cost: t.status === "received" ? Math.round((t.baseSent - t.baseReceived) * 100) / 100 : null,
    note: t.note,
  };
}
