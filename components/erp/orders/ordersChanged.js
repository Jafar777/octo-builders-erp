// Browser event: a request was answered or sent, so the counts (Requests page, sidebar)
// are read again.
export const ORDERS_CHANGED = "octa:orders-changed";
export const ordersChanged = () => window.dispatchEvent(new Event(ORDERS_CHANGED));
