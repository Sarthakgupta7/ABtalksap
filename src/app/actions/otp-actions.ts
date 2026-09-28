"use server";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { writeClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyAccessToken } from "@/lib/msg91";
import { isOtpDevBypassEnabled, otpDevCode } from "@/lib/feature-flags";
import { otpVerifySchema } from "@/lib/validations/otp";
import {
  INDIA_DIALING_CODE,
  indianMobileNumberSchema,
  toE164,
  toWidgetMobile,
} from "@/lib/validations/phone";
import { applyCandidateIdentityChange } from "@/repositories/candidate-identity";

type ActionResult = { ok: true } | { ok: false; message: string };

const PHONE_TAKEN_MESSAGE = "This number is already linked to another account.";

const phoneCheckSchema = z.object({
  countryCode: z.literal(INDIA_DIALING_CODE),
  phoneNumber: indianMobileNumberSchema,
});

/** One verified number per account: true if a different user already holds it verified. */
async function isPhoneTakenByOther(
  db: Prisma.TransactionClient,
  e164: string,
  userId: string,
): Promise<boolean> {
  const [otherVerification, otherProfile] = await Promise.all([
    db.phoneVerification.findFirst({
      where: { phone: e164, verified: true, userId: { not: userId } },
      select: { id: true },
    }),
    db.candidateProfile.findFirst({
      where: { phone: e164, phoneVerified: true, userId: { not: userId } },
      select: { id: true },
    }),
  ]);
  return Boolean(otherVerification || otherProfile);
}

/**
 * Called before Send OTP so no code is sent (and no OTP box shown) for a
 * number another account already holds as verified.
 */
export async function checkPhoneAvailableAction(input: {
  countryCode: string;
  phoneNumber: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Not authenticated" };
  }
  const userId = session.user.id;

  const parsed = phoneCheckSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid 10-digit Indian mobile number" };
  }

  const e164 = toE164(parsed.data.countryCode, parsed.data.phoneNumber);
  try {
    if (await isPhoneTakenByOther(writeClient(), e164, userId)) {
      logger.warn("[otp] send blocked: number verified on another account", { userId });
      return { ok: false, message: PHONE_TAKEN_MESSAGE };
    }
  } catch (e) {
    logger.error("[otp] phone availability check failed", { error: String(e) });
    return { ok: false, message: "Could not send OTP. Please try again." };
  }
  return { ok: true };
}

/**
 * Verify a phone OTP and record the verification.
 *
 * Live: validates the MSG91 widget access token server-side.
 * Dev-bypass: accepts the fixed dev code.
 * Rejects a number that another account already holds as verified.
 * On success, upserts the `PhoneVerification` bridge row (used by registration
 * before a StudentProfile exists) and, if a profile already exists, marks it
 * verified in place.
 */
export async function verifyOtpAction(input: {
  countryCode: string;
  phoneNumber: string;
  accessToken?: string;
  otp?: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Not authenticated" };
  }
  const userId = session.user.id;

  const parsed = otpVerifySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { countryCode, phoneNumber, accessToken, otp } = parsed.data;
  const e164 = toE164(countryCode, phoneNumber);
  const widgetMobile = toWidgetMobile(e164);

  if (isOtpDevBypassEnabled()) {
    if (otp !== otpDevCode()) {
      return { ok: false, message: "Invalid code." };
    }
  } else {
    if (!accessToken) {
      return { ok: false, message: "Missing verification token." };
    }
    const result = await verifyAccessToken(accessToken);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    // If MSG91 echoed the verified mobile, ensure it matches the submitted number.
    if (result.mobile && result.mobile !== widgetMobile) {
      return {
        ok: false,
        message: "Verified number does not match. Please try again.",
      };
    }
  }

  try {
    const claimed = await writeClient().$transaction(async (tx) => {
      // Re-checked here (not just at send time) so a claim that lands between
      // Send OTP and Verify still loses.
      if (await isPhoneTakenByOther(tx, e164, userId)) return false;

      await tx.phoneVerification.upsert({
        where: { userId },
        create: {
          userId,
          phone: e164,
          verified: true,
          verifiedAt: new Date(),
        },
        update: {
          phone: e164,
          verified: true,
          verifiedAt: new Date(),
        },
      });

      const existingCandidate = await tx.candidateProfile.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (existingCandidate) {
        await applyCandidateIdentityChange(tx, userId, {
          phone: e164,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        });
      }
      return true;
    });
    if (!claimed) {
      logger.warn("[otp] number already verified on another account", { userId });
      return {
        ok: false,
        message: PHONE_TAKEN_MESSAGE,
      };
    }
  } catch (e) {
    logger.error("[otp] failed to persist verification", { error: String(e) });
    return { ok: false, message: "Could not save verification. Try again." };
  }

  return { ok: true };
}
