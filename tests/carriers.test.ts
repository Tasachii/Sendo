import { describe, it, expect, afterEach } from "vitest";
import {
  normalizeState,
  httpCarrierAdapter,
  trackShipment,
  CARRIER_CONFIG,
  carrierAdapters,
  type CarrierConfig,
  type RawTrackingEvent,
} from "../lib/carriers";

describe("normalizeState", () => {
  it("maps delivered tokens (EN + TH)", () => {
    expect(normalizeState("DELIVERED")).toBe("delivered");
    expect(normalizeState("จัดส่งสำเร็จ")).toBe("delivered");
    expect(normalizeState("นำจ่ายสำเร็จ")).toBe("delivered");
  });

  it("maps out-for-delivery tokens (EN + TH)", () => {
    expect(normalizeState("out for delivery")).toBe("out_for_delivery");
    expect(normalizeState("out-for-delivery")).toBe("out_for_delivery");
    expect(normalizeState("กำลังนำส่ง")).toBe("out_for_delivery");
  });

  it("does not mis-classify 'out for delivery' as delivered (deliver + out-for interaction)", () => {
    // contains 'deliver' but also 'out for' → must be out_for_delivery, not delivered
    expect(normalizeState("Out For Delivery")).toBe("out_for_delivery");
  });

  it("maps in-transit tokens (EN + TH)", () => {
    expect(normalizeState("in transit")).toBe("in_transit");
    expect(normalizeState("ระหว่างทาง")).toBe("in_transit");
    expect(normalizeState("arrived at hub")).toBe("in_transit");
  });

  it("maps created/pickup tokens (EN + TH)", () => {
    expect(normalizeState("pickup")).toBe("created");
    expect(normalizeState("booked")).toBe("created");
    expect(normalizeState("รับเข้า")).toBe("created");
  });

  it("maps exception tokens (EN + TH)", () => {
    expect(normalizeState("failed")).toBe("exception");
    expect(normalizeState("return to sender")).toBe("exception");
    expect(normalizeState("ตีกลับ")).toBe("exception");
  });

  it("returns unknown for empty / null / garbage", () => {
    expect(normalizeState("")).toBe("unknown");
    expect(normalizeState(null)).toBe("unknown");
    expect(normalizeState(undefined)).toBe("unknown");
    expect(normalizeState("zzzqqq")).toBe("unknown");
  });
});

describe("CARRIER_CONFIG header builders (locks the B1 fix)", () => {
  afterEach(() => {
    delete process.env.CARRIER_FLASH_KEY;
    delete process.env.CARRIER_KERRY_KEY;
  });

  it("returns the auth header when the env key is set", () => {
    process.env.CARRIER_FLASH_KEY = "abc";
    expect(CARRIER_CONFIG.flash.headers!()).toEqual({ Authorization: "Bearer abc" });
    process.env.CARRIER_KERRY_KEY = "xyz";
    expect(CARRIER_CONFIG.kerry.headers!()).toEqual({ "x-api-key": "xyz" });
  });

  it("returns an empty object (not undefined props) when the env key is unset", () => {
    expect(CARRIER_CONFIG.flash.headers!()).toEqual({});
    expect(CARRIER_CONFIG.kerry.headers!()).toEqual({});
  });
});

describe("httpCarrierAdapter (graceful degradation)", () => {
  const config: CarrierConfig = {
    endpoint: (t) => `https://example.test/track/${t}`,
    extractLatest: (j) => (j as { events?: RawTrackingEvent[] } | undefined)?.events?.at(-1) ?? null,
  };

  it("maps a successful JSON response to a normalized status", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ events: [{ status: "DELIVERED", description: "ส่งสำเร็จ", timestamp: "2026-01-01T00:00:00Z" }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    const adapter = httpCarrierAdapter("flash", config, fakeFetch);
    const r = await adapter.track("TN1");
    expect(r.state).toBe("delivered");
    expect(r.description).toBe("ส่งสำเร็จ");
    expect(r.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("degrades to unknown with HTTP n when the response is not ok", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const adapter = httpCarrierAdapter("flash", config, fakeFetch);
    const r = await adapter.track("TN1");
    expect(r.state).toBe("unknown");
    expect(r.description).toBe("HTTP 503");
  });

  it("degrades to unknown with error: when fetch throws", async () => {
    const fakeFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const adapter = httpCarrierAdapter("flash", config, fakeFetch);
    const r = await adapter.track("TN1");
    expect(r.state).toBe("unknown");
    expect(r.description).toBe("error: network down");
  });

  it("degrades to unknown 'no events' when there are no events", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ events: [] }), { status: 200 })) as unknown as typeof fetch;
    const adapter = httpCarrierAdapter("flash", config, fakeFetch);
    const r = await adapter.track("TN1");
    expect(r.state).toBe("unknown");
    expect(r.description).toBe("no events");
  });
});

describe("trackShipment", () => {
  afterEach(() => {
    delete carrierAdapters.flash;
  });

  it("returns the Thai not-connected message when no adapter is registered", async () => {
    const r = await trackShipment("flash", "TN1");
    expect(r.state).toBe("unknown");
    expect(r.description).toContain("ยังไม่ได้เชื่อมต่อ");
  });
});
