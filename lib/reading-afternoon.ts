import { z } from "zod";

export const weatherChoices = ["sunny", "cloudy", "rainy", "snowy", "indoors"] as const;
export const paceChoices = ["slow", "steady", "focused", "immersive"] as const;
export const placeChoices = ["home", "garden", "cafe", "park", "library", "other"] as const;

export const readingAfternoonSchema = z.object({
  date: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(720),
  place: z.enum(placeChoices),
  weather: z.enum(weatherChoices),
  pace: z.enum(paceChoices),
  workId: z.string().min(1).max(100).nullable().default(null),
  kitId: z.string().uuid().nullable().default(null),
  notes: z.string().trim().max(2000).default(""),
  status: z.enum(["planned", "completed", "cancelled"]).default("planned"),
});

export function estimateReadingPages(durationMinutes: number, pace: typeof paceChoices[number], averagePagesPerHour = 25) {
  const paceMultiplier = { slow: 0.7, steady: 1, focused: 1.25, immersive: 1.5 }[pace];
  return Math.max(0, Math.round((durationMinutes / 60) * averagePagesPerHour * paceMultiplier));
}

export function weatherPlaceSuggestion(weather: typeof weatherChoices[number], place: typeof placeChoices[number]) {
  if (place === "home" && weather === "rainy") return "Settle by an indoor window; keep a blanket and drink within reach.";
  if (place === "park" || place === "garden") return weather === "sunny" ? "Use shade and sun protection; take water." : "Choose a sheltered spot and bring an extra layer.";
  if (place === "cafe") return "Choose a quiet table away from doors and avoid overstaying busy periods.";
  if (place === "library") return "Check opening hours and use a comfortable, permitted reading area.";
  return weather === "snowy" ? "Allow extra travel time and keep warm indoors where possible." : "Choose a comfortable, quiet place and keep the session within your available time.";
}
