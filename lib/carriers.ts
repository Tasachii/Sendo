/**
 * Carrier tracking integration (Thailand) — Phase 3.
 *
 * Each carrier (Flash, Kerry, ไปรษณีย์ไทย, J&T, …) exposes a different tracking API, so we
 * normalize to one `TrackingStatus` shape behind one `CarrierAdapter` interface. Sendo already
 * stores tracking numbers on `Shipment`; this is where live status is pulled in.
 *
 * What's implemented here: the adapter interface, a normalized state mapper, a generic
 * HTTP adapter factory (with an injectable `fetch` so it's testable), and a registry.
 * What still needs real-world wiring: each carrier's real endpoint URL, auth/API key, and the
 * exact response field → state mapping. Those live in `CARRIER_CONFIG` placeholders below and
 * must be filled from each carrier's API docs + credentials (kept in env vars, never committed).
 */

export type CarrierId = "flash" | "kerry" | "thailand_post" | "jt";

export type TrackingState =
  | "created"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "unknown";

export type TrackingStatus = {
  carrier: CarrierId;
  trackingNo: string;
  state: TrackingState;
  description?: string;
  updatedAt?: string; // ISO
};

export interface CarrierAdapter {
  id: CarrierId;
  track(trackingNo: string): Promise<TrackingStatus>;
}

/**
 * Map a carrier's raw status token to our normalized state. Carriers use many spellings
 * ("DELIVERED", "จัดส่งสำเร็จ", "out-for-delivery", …) so we match on normalized substrings.
 */
export function normalizeState(raw: string | null | undefined): TrackingState {
  const s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return "unknown";
  const has = (...keys: string[]) => keys.some((k) => s.includes(k));
  if (has("deliver") && !has("out for", "out-for", "ออกส่ง", "กำลังนำส่ง")) {
    if (has("out for", "out-for")) return "out_for_delivery";
    return "delivered";
  }
  if (has("จัดส่งสำเร็จ", "นำจ่ายสำเร็จ", "success")) return "delivered";
  if (has("out for", "out-for", "ออกนำส่ง", "กำลังนำส่ง", "ออกส่ง")) return "out_for_delivery";
  if (has("transit", "ระหว่างทาง", "ขนส่ง", "received at", "in hub", "departed", "arrived")) return "in_transit";
  if (has("created", "pickup", "รับเข้า", "เตรียมจัดส่ง", "label", "booked")) return "created";
  if (has("fail", "exception", "return", "ตีกลับ", "ผิดพลาด", "ล้มเหลว")) return "exception";
  return "unknown";
}

/** Shape a carrier endpoint is expected to return after we extract the latest event. */
export type RawTrackingEvent = { status?: string; description?: string; timestamp?: string };

/** Narrow an unknown JSON value to an indexable object, or null. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/** Walk a path of object keys through unknown JSON; returns undefined if any hop misses. */
function dig(v: unknown, ...path: string[]): unknown {
  let cur: unknown = v;
  for (const key of path) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[key];
  }
  return cur;
}

/** Last element of an unknown value when it is a non-empty array, shaped as an event. */
function latestEvent(v: unknown): RawTrackingEvent | null {
  return Array.isArray(v) && v.length > 0 ? (v[v.length - 1] as RawTrackingEvent) : null;
}

export type CarrierConfig = {
  endpoint: (trackingNo: string) => string;
  /** Pull the latest event out of the carrier's (varied) JSON response. */
  extractLatest: (json: unknown) => RawTrackingEvent | null;
  /** Extra headers, e.g. an API key from env. */
  headers?: () => Record<string, string>;
};

/**
 * Build an adapter from a config + an injected fetch. Production passes the real `fetch`;
 * tests pass a fake. Network/parse failures degrade to `unknown` rather than throwing, so a
 * flaky carrier API can't take down an invoice view.
 */
export function httpCarrierAdapter(
  id: CarrierId,
  config: CarrierConfig,
  fetchImpl: typeof fetch = fetch
): CarrierAdapter {
  return {
    id,
    async track(trackingNo: string): Promise<TrackingStatus> {
      try {
        const res = await fetchImpl(config.endpoint(trackingNo), { headers: config.headers?.() });
        if (!res.ok) {
          return { carrier: id, trackingNo, state: "unknown", description: `HTTP ${res.status}` };
        }
        const json = await res.json();
        const latest = config.extractLatest(json);
        if (!latest) return { carrier: id, trackingNo, state: "unknown", description: "no events" };
        return {
          carrier: id,
          trackingNo,
          state: normalizeState(latest.status ?? latest.description),
          description: latest.description ?? latest.status,
          updatedAt: latest.timestamp,
        };
      } catch (e) {
        return { carrier: id, trackingNo, state: "unknown", description: `error: ${(e as Error).message}` };
      }
    },
  };
}

/**
 * Per-carrier config. Endpoints/keys are PLACEHOLDERS — fill from each carrier's API docs and
 * supply keys via env (CARRIER_<NAME>_KEY). `extractLatest` already encodes the common shape of
 * "newest event in an array"; adjust the field paths per real responses.
 */
export const CARRIER_CONFIG: Record<CarrierId, CarrierConfig> = {
  flash: {
    endpoint: (t) => `https://open-api.flashexpress.com/v1/tracking/${encodeURIComponent(t)}`,
    headers: () => {
      const h: Record<string, string> = {};
      if (process.env.CARRIER_FLASH_KEY) h.Authorization = `Bearer ${process.env.CARRIER_FLASH_KEY}`;
      return h;
    },
    extractLatest: (j) => latestEvent(dig(j, "data", "routes")),
  },
  kerry: {
    endpoint: (t) => `https://th.kerryexpress.com/api/track/${encodeURIComponent(t)}`,
    headers: () => {
      const h: Record<string, string> = {};
      if (process.env.CARRIER_KERRY_KEY) h["x-api-key"] = process.env.CARRIER_KERRY_KEY;
      return h;
    },
    extractLatest: (j) => latestEvent(dig(j, "events")),
  },
  thailand_post: {
    endpoint: (t) => `https://trackapi.thailandpost.co.th/post/api/v1/track/${encodeURIComponent(t)}`,
    headers: () => {
      const h: Record<string, string> = {};
      if (process.env.CARRIER_THP_KEY) h.Authorization = `Token ${process.env.CARRIER_THP_KEY}`;
      return h;
    },
    extractLatest: (j) => {
      const items = asRecord(dig(j, "response", "items"));
      const first = items ? Object.values(items)[0] : undefined;
      return latestEvent(first);
    },
  },
  jt: {
    endpoint: (t) => `https://www.jtexpress.co.th/api/tracking/${encodeURIComponent(t)}`,
    headers: () => {
      const h: Record<string, string> = {};
      if (process.env.CARRIER_JT_KEY) h.Authorization = `Bearer ${process.env.CARRIER_JT_KEY}`;
      return h;
    },
    extractLatest: (j) => latestEvent(dig(j, "data", "details")),
  },
};

/** Registry of live adapters. Empty by default; call `registerCarrier` to wire real ones in. */
export const carrierAdapters: Partial<Record<CarrierId, CarrierAdapter>> = {};

export function registerCarrier(adapter: CarrierAdapter): void {
  carrierAdapters[adapter.id] = adapter;
}

/** Register all carriers using their config + the platform `fetch`. Call once at startup. */
export function registerDefaultCarriers(fetchImpl: typeof fetch = fetch): void {
  (Object.keys(CARRIER_CONFIG) as CarrierId[]).forEach((id) =>
    registerCarrier(httpCarrierAdapter(id, CARRIER_CONFIG[id], fetchImpl))
  );
}

export async function trackShipment(carrier: CarrierId, trackingNo: string): Promise<TrackingStatus> {
  const adapter = carrierAdapters[carrier];
  if (!adapter) {
    // graceful default until an adapter is registered
    return { carrier, trackingNo, state: "unknown", description: "ยังไม่ได้เชื่อมต่อ API ขนส่ง (ยังไม่ได้ลงทะเบียน adapter)" };
  }
  return adapter.track(trackingNo);
}
