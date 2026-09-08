import { z } from "zod";
import { validDate, shiftDay } from "@/lib/reading";
export const sessionSchema = z
  .object({
    userBookId: z.string().min(1).max(100),
    requestId: z.string().uuid(),
    expectedLastSessionId: z.string().nullable(),
    date: z
      .string()
      .refine(validDate, "Choose a valid reading date.")
      .refine(
        (value) => value <= shiftDay(new Date().toISOString().slice(0, 10), 1),
        "Choose today or an earlier date.",
      ),
    pageStart: z.number().int().min(0).max(100000),
    pageEnd: z.number().int().min(1).max(100000),
    note: z.string().max(5000).default(""),
    finished: z.boolean().default(false),
    timeStart: z.string().datetime().nullable().default(null),
    timeEnd: z.string().datetime().nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.pageEnd <= value.pageStart)
      context.addIssue({
        code: "custom",
        message: "The end page must be after the start page.",
        path: ["pageEnd"],
      });
    if (Boolean(value.timeStart) !== Boolean(value.timeEnd))
      context.addIssue({
        code: "custom",
        message: "Enter both session times, or leave both blank.",
        path: ["timeEnd"],
      });
    if (
      value.timeStart &&
      value.timeEnd &&
      (Date.parse(value.timeEnd) <= Date.parse(value.timeStart) ||
        Date.parse(value.timeEnd) - Date.parse(value.timeStart) > 86400000)
    )
      context.addIssue({
        code: "custom",
        message:
          "The end time must follow the start time by no more than a day.",
        path: ["timeEnd"],
      });
  });
