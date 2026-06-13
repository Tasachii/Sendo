/**
 * Carrier tracking integration — Phase 3 SCAFFOLD ONLY (not wired up).
 *
 * Each Thai carrier (Flash, Kerry, ไปรษณีย์ไทย, J&T, …) exposes a different tracking API,
 * so we define one normalized interface here and would add a small adapter per carrier
 * behind it. Sendo already stores tracking numbers on `Shipment`; this is where live
 * status would be pulled in.
 */

export type CarrierId = "flash" | "kerry" | "thailand_post" | "jt";

export type TrackingStatus = {
  carrier: CarrierId;
  trackingNo: string;
  state: "created" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "unknown";
  description?: string;
  updatedAt?: string; // ISO
};

export interface CarrierAdapter {
  id: CarrierId;
  /** TODO(phase-3): call the carrier API and map its response to TrackingStatus. */
  track(trackingNo: string): Promise<TrackingStatus>;
}

/** Registry of adapters. Empty until Phase 3 wires real carriers in. */
export const carrierAdapters: Partial<Record<CarrierId, CarrierAdapter>> = {};

export async function trackShipment(carrier: CarrierId, trackingNo: string): Promise<TrackingStatus> {
  const adapter = carrierAdapters[carrier];
  if (!adapter) {
    // graceful default until an adapter exists
    return { carrier, trackingNo, state: "unknown", description: "ยังไม่ได้เชื่อมต่อ API ขนส่ง (Phase 3)" };
  }
  return adapter.track(trackingNo);
}
