import { logLocationEvent } from "@/lib/exam.functions";

export type GeoEventType = "LOGIN" | "EXAM_START" | "EXAM_SUBMIT";

/**
 * Requests a single position from the browser (permission prompt shown by the
 * device) and records ONE geo-tag event. No continuous tracking anywhere.
 */
export async function captureGeoTag(
  eventType: GeoEventType,
  opts: { examId?: string | null; attemptId?: string | null } = {},
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return false;
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      });
    });
    await logLocationEvent({
      data: {
        eventType,
        examId: opts.examId ?? null,
        attemptId: opts.attemptId ?? null,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Records at most one LOGIN geo-tag per browser session. */
export async function captureLoginGeoTag() {
  if (typeof window === "undefined") return;
  const key = "ncc-login-geotag";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  await captureGeoTag("LOGIN");
}
