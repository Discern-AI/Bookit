import { z } from "zod";
const money = z.number().int().min(0).max(99999999);
export const fundraisingSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("campaign"),
    version: z.number().int().min(0).nullable(),
    charityName: z.string().trim().min(1).max(160),
    targetPence: money.refine((v) => v > 0).nullable(),
  }),
  z
    .object({
      action: z.literal("pledge"),
      id: z.string().uuid(),
      version: z.number().int().min(0),
      label: z.string().trim().min(1).max(100),
      mode: z.enum(["flat", "per_book"]),
      amountPence: money.refine((v) => v > 0),
      capPence: money.refine((v) => v > 0).nullable(),
      receivedPence: money,
    })
    .refine((v) => v.mode !== "flat" || v.capPence === null, {
      message: "Flat pledges do not use a cap.",
    }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid(),
    version: z.number().int().min(0),
  }),
]);
export type PledgeAmounts = {
  mode: string;
  amountPence: number;
  capPence: number | null;
  receivedPence: number;
};
export function pledgeTotals(p: PledgeAmounts, books: number) {
  const raw =
    p.mode === "per_book" ? p.amountPence * Math.max(0, books) : p.amountPence;
  const expectedPence = p.capPence === null ? raw : Math.min(raw, p.capPence);
  return {
    expectedPence,
    outstandingPence: Math.max(0, expectedPence - p.receivedPence),
    excessPence: Math.max(0, p.receivedPence - expectedPence),
  };
}
