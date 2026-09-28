"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logger, safeErrorMessage } from "@/lib/logger";
import { requireRecruiterWorkspace } from "@/features/recruiter-workspace/workspace";
import {
  LOGO_MAX_BYTES,
  isAllowedLogoMimeType,
  updateRecruiterProfileSchema,
  type RecruiterProfileDetails,
} from "@/lib/validations/recruiter-profile";
import {
  deleteCompanyLogoBlob,
  isCompanyLogoStorageConfigured,
  isOurCompanyLogoUrl,
  storeCompanyLogoFile,
} from "@/features/hire/org-logo-storage";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Reads the caller's recruiter profile and company identity (T-227).
 * Scoped strictly to the session workspace via requireRecruiterWorkspace().
 * No caller-supplied IDs accepted.
 */
export async function getRecruiterProfileAction(): Promise<
  ActionResult<RecruiterProfileDetails>
> {
  const workspace = await requireRecruiterWorkspace();
  if (!workspace.ok) return workspace;

  const { userId, recruiterProfileId, organizationId } = workspace.data;

  try {
    const [profile, org, user] = await Promise.all([
      prisma.recruiterProfile.findUnique({
        where: { id: recruiterProfileId },
        select: {
          fullName: true,
          phone: true,
          company: true,
        },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
          websiteUrl: true,
          industry: true,
          sizeBucket: true,
          location: true,
          logoUrl: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),
    ]);

    if (!profile) {
      return { ok: false, message: "Recruiter profile not found." };
    }

    return {
      ok: true,
      data: {
        fullName: profile.fullName,
        phone: profile.phone ?? null,
        email: user?.email ?? "",
        companyName: org?.name ?? profile.company,
        website: org?.websiteUrl ?? null,
        industry: org?.industry ?? null,
        companySize: org?.sizeBucket ?? null,
        location: org?.location ?? null,
        logoUrl: org?.logoUrl ?? null,
      },
    };
  } catch (error) {
    logger.error("Failed to read recruiter profile", {
      userId,
      error: safeErrorMessage(error),
    });
    return { ok: false, message: "Could not load profile. Please refresh." };
  }
}

/**
 * Updates the caller's recruiter profile and company identity (T-227).
 * Validates with Zod, ensures RecruiterProfile and Organization update atomically,
 * and synchronizes RecruiterProfile.company with Organization.name.
 * Scoped strictly to the authenticated recruiter's own workspace.
 */
export async function updateRecruiterProfileAction(
  input: unknown,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const parsed = updateRecruiterProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid profile details.",
    };
  }

  const workspace = await requireRecruiterWorkspace();
  if (!workspace.ok) return workspace;

  const { userId, recruiterProfileId, organizationId } = workspace.data;
  const data = parsed.data;

  try {
    await prisma.$transaction(
      async (tx) => {
        // 1. Update RecruiterProfile: fullName, phone, company
        await tx.recruiterProfile.update({
          where: { id: recruiterProfileId },
          data: {
            fullName: data.fullName,
            phone: data.phone,
            company: data.companyName,
          },
        });

        // 2. Update Organization: name, websiteUrl, industry, sizeBucket, location
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            name: data.companyName,
            websiteUrl: data.website,
            industry: data.industry,
            sizeBucket: data.companySize,
            location: data.location,
          },
        });
      },
      { maxWait: 20_000, timeout: 20_000 },
    );

    revalidatePath("/hire/settings");
    revalidatePath("/hire");

    return { ok: true, message: "Profile and company identity saved." };
  } catch (error) {
    logger.error("Failed to update recruiter profile", {
      userId,
      recruiterProfileId,
      organizationId,
      error: safeErrorMessage(error),
    });
    return {
      ok: false,
      message: "Failed to update profile. Please try again.",
    };
  }
}

/**
 * Declared content type is attacker input. This reads the actual leading bytes
 * and the caller then requires the two to agree, so a `.svg` renamed to `.png`
 * is refused before it ever reaches a public store.
 *
 * Deliberately duplicated from `candidate-profile-actions.ts` rather than
 * extracted: that file belongs to the candidate-profile module, and a shared
 * util would couple two owners' upload paths for twenty lines of constants.
 */
function sniffImageType(
  bytes: Uint8Array,
): { mime: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

const LOGO_TYPE_MESSAGE = "Please choose a PNG, JPEG, or WebP image.";

/**
 * Stores a company logo and points `Organization.logoUrl` at it (plan 158).
 *
 * Like every other action in this file the workspace is resolved server-side;
 * the FormData carries a file and nothing else. The blob path is built from the
 * server's own organization id and a hash of the bytes, so no part of it is
 * caller-controlled and one workspace cannot overwrite another's logo.
 */
export async function uploadCompanyLogoAction(
  formData: FormData,
): Promise<{ ok: true; message: string; logoUrl: string } | { ok: false; message: string }> {
  const workspace = await requireRecruiterWorkspace();
  if (!workspace.ok) return workspace;

  const { userId, organizationId } = workspace.data;

  if (!isCompanyLogoStorageConfigured()) {
    logger.warn("[org-logo] upload attempted while storage is unconfigured", {
      organizationId,
    });
    return { ok: false, message: "Logo upload is not available right now." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose an image to upload." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return {
      ok: false,
      message: "That file is too large. Please choose an image under 2 MB.",
    };
  }
  if (file.type === "image/svg+xml" || !isAllowedLogoMimeType(file.type)) {
    return { ok: false, message: LOGO_TYPE_MESSAGE };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    logger.error("[org-logo] failed to read upload", {
      userId,
      organizationId,
      error: safeErrorMessage(error),
    });
    return { ok: false, message: "Could not read that file. Please try again." };
  }

  const sniffed = sniffImageType(bytes);
  if (!sniffed || sniffed.mime !== file.type) {
    return { ok: false, message: LOGO_TYPE_MESSAGE };
  }

  const contentHash = createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");

  let url: string;
  try {
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoUrl: true },
    });

    const stored = await storeCompanyLogoFile({
      organizationId,
      contentHash,
      ext: sniffed.ext,
      bytes,
      mimeType: sniffed.mime,
    });
    if (!stored) {
      return { ok: false, message: "Logo upload is not available right now." };
    }
    url = stored;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { logoUrl: url },
      select: { id: true },
    });

    // After the row points at the new file, never before: a stale blob costs
    // nothing, a row pointing at a deleted blob is a broken image.
    if (
      existing?.logoUrl &&
      isOurCompanyLogoUrl(existing.logoUrl) &&
      existing.logoUrl !== url
    ) {
      await deleteCompanyLogoBlob(existing.logoUrl);
    }
  } catch (error) {
    logger.error("[org-logo] upload failed", {
      userId,
      organizationId,
      error: safeErrorMessage(error),
    });
    return { ok: false, message: "Could not save the logo. Please try again." };
  }

  revalidatePath("/hire/settings");
  revalidatePath("/hire");

  return { ok: true, message: "Company logo updated.", logoUrl: url };
}

/** Clears `Organization.logoUrl` and deletes the stored file (plan 158). */
export async function removeCompanyLogoAction(): Promise<
  { ok: true; message: string } | { ok: false; message: string }
> {
  const workspace = await requireRecruiterWorkspace();
  if (!workspace.ok) return workspace;

  const { userId, organizationId } = workspace.data;

  try {
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoUrl: true },
    });
    if (!existing?.logoUrl) {
      return { ok: true, message: "Company logo removed." };
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { logoUrl: null },
      select: { id: true },
    });

    if (isOurCompanyLogoUrl(existing.logoUrl)) {
      await deleteCompanyLogoBlob(existing.logoUrl);
    }
  } catch (error) {
    logger.error("[org-logo] remove failed", {
      userId,
      organizationId,
      error: safeErrorMessage(error),
    });
    return { ok: false, message: "Could not remove the logo. Please try again." };
  }

  revalidatePath("/hire/settings");
  revalidatePath("/hire");

  return { ok: true, message: "Company logo removed." };
}
