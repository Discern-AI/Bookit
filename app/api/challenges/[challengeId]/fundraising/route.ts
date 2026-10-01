import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { sameOriginJson } from "@/lib/book-journal";
import { fundraisingSchema } from "@/lib/fundraising";
import { z } from "zod";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function PATCH(
  request: Request,
  { params }: { params: { challengeId: string } },
) {
  const session = await auth();
  if (!session?.user.id) return reply({ error: "Sign in first." }, 401);
  if (!sameOriginJson(request))
    return reply({ error: "Invalid request." }, 403);
  const input = fundraisingSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (
    !input.success ||
    !z.string().uuid().safeParse(params.challengeId).success
  )
    return reply(
      {
        error:
          "Check the charity or sponsor details and positive amounts, using at most two decimal places.",
      },
      400,
    );
  const d = input.data,
    challengeId = params.challengeId;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
      const challenge = await tx.readingChallenge.findFirst({
        where: {
          id: challengeId,
          userId: session.user.id,
          deletedAt: null,
          kind: "count",
        },
      });
      if (!challenge)
        return reply({ error: "Book-count challenge not found." }, 404);
      const campaign = await tx.charityCampaign.findUnique({
        where: { challengeId },
      });
      const stale = () =>
        reply(
          {
            error:
              "These details changed elsewhere. Your draft is kept. Reload tracking before trying again.",
          },
          409,
        );
      if (d.action === "campaign") {
        if (!campaign) {
          if (d.version !== null) return stale();
          await tx.charityCampaign.create({
            data: {
              challengeId,
              charityName: d.charityName,
              targetPence: d.targetPence,
            },
          });
          return reply({ ok: true }, 201);
        }
        const same =
          campaign.charityName === d.charityName &&
          campaign.targetPence === d.targetPence;
        if (d.version === null)
          return same && campaign.version === 0 ? reply({ ok: true }) : stale();
        if (campaign.version !== d.version) {
          return same && campaign.version === d.version + 1
            ? reply({ ok: true })
            : stale();
        }
        if (!same)
          await tx.charityCampaign.update({
            where: { challengeId },
            data: {
              charityName: d.charityName,
              targetPence: d.targetPence,
              version: { increment: 1 },
            },
          });
        return reply({ ok: true });
      }
      if (!campaign)
        return reply({ error: "Set up charity tracking first." }, 409);
      const old = await tx.sponsorPledge.findUnique({ where: { id: d.id } });
      if (old && old.campaignId !== challengeId)
        return reply({ error: "Pledge not found." }, 404);
      if (d.action === "delete") {
        if (!old) return reply({ error: "Pledge not found." }, 404);
        if (old.deletedAt) return reply({ ok: true });
        if (old.version !== d.version) return stale();
        await tx.sponsorPledge.update({
          where: { id: d.id },
          data: {
            deletedAt: new Date(),
            label: "",
            amountPence: 0,
            capPence: null,
            receivedPence: 0,
            version: { increment: 1 },
          },
        });
        return reply({ ok: true });
      }
      if (old?.deletedAt) return stale();
      const fields = {
        label: d.label,
        mode: d.mode,
        amountPence: d.amountPence,
        capPence: d.capPence,
        receivedPence: d.receivedPence,
      };
      if (!old) {
        if (d.version !== 0) return stale();
        await tx.sponsorPledge.create({
          data: { id: d.id, campaignId: challengeId, ...fields },
        });
        return reply({ ok: true }, 201);
      }
      const same =
        old.label === d.label &&
        old.mode === d.mode &&
        old.amountPence === d.amountPence &&
        old.capPence === d.capPence &&
        old.receivedPence === d.receivedPence;
      if (old.version !== d.version)
        return same && old.version === d.version + 1
          ? reply({ ok: true })
          : stale();
      if (!same)
        await tx.sponsorPledge.update({
          where: { id: d.id },
          data: { ...fields, version: { increment: 1 } },
        });
      return reply({ ok: true });
    });
  } catch {
    return reply(
      {
        error:
          "Could not save charity tracking. Your draft is kept; try again.",
      },
      503,
    );
  }
}
