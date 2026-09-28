import "server-only";
import { del, put } from "@vercel/blob";
import { logger } from "@/lib/logger";

/**
 * Company logo storage on Vercel Blob (plan 158).
 *
 * **Public only.** The settings card renders `<img src>` directly, and every
 * surface a logo is eventually wanted on — outreach, job posts — is a place a
 * signed-out or third-party reader loads the image from. A private store would
 * need a proxy route for a file that carries no private data.
 *
 * **It reuses the avatar store.** `logo_READ_WRITE_TOKEN` is checked first so
 * the two can be split later without touching a caller, but the fallback is the
 * already-provisioned PUBLIC avatar store. That is deliberate: a dedicated
 * store would mean the feature silently does nothing in production until
 * somebody remembers to create it. The résumé store is PRIVATE and must never
 * be used here — résumés stay private.
 *
 * **Project-specific env names.** Same reason as `features/resume/storage.ts`
 * and `features/profile/avatar-storage.ts`: mixed-case names, read via
 * `process.env[NAME]` so they survive build-time env substitution, token passed
 * explicitly so the SDK does not fall back to `BLOB_READ_WRITE_TOKEN`.
 *
 * Pathname is `org-logos/<organizationId>/<sha256>.<ext>` — content-addressed
 * and built only from server-resolved values, so no caller can steer it at
 * another organization's prefix.
 */

/** Preferred first, then the existing public avatar store. Do not rename. */
const TOKEN_ENVS = ["logo_READ_WRITE_TOKEN", "avatar_READ_WRITE_TOKEN"] as const;

function blobToken(): string | undefined {
  for (const name of TOKEN_ENVS) {
    const value = process.env[name];
    if (value && value.length > 0) return value;
  }
  return undefined;
}

export function isCompanyLogoStorageConfigured(): boolean {
  return Boolean(blobToken());
}

export function companyLogoPathname(
  organizationId: string,
  contentHash: string,
  ext: string,
): string {
  return `org-logos/${organizationId}/${contentHash}.${ext}`;
}

export function isOurCompanyLogoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes("/org-logos/");
  } catch {
    return url.includes("/org-logos/");
  }
}

function options() {
  return { token: blobToken() };
}

export async function storeCompanyLogoFile({
  organizationId,
  contentHash,
  ext,
  bytes,
  mimeType,
}: {
  organizationId: string;
  contentHash: string;
  ext: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string | null> {
  if (!isCompanyLogoStorageConfigured()) {
    logger.warn(
      `[org-logo] none of ${TOKEN_ENVS.join(" / ")} is set — file not stored`,
    );
    return null;
  }

  const pathname = companyLogoPathname(organizationId, contentHash, ext);
  try {
    const result = await put(pathname, Buffer.from(bytes), {
      ...options(),
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return result.url;
  } catch (error) {
    const message = String(error);
    if (message.includes("public access on a private store")) {
      logger.error(
        "[org-logo] the blob store is PRIVATE — company logos cannot be stored. " +
          "Settings renders <img src> directly, so the store must have PUBLIC " +
          `access and one of ${TOKEN_ENVS.join(" / ")} must point at it. ` +
          "Do not widen the résumé store — résumés stay private.",
      );
      return null;
    }
    logger.error("[org-logo] blob upload failed", { error: message });
    return null;
  }
}

export async function deleteCompanyLogoBlob(url: string): Promise<void> {
  if (!isCompanyLogoStorageConfigured()) return;
  try {
    await del(url, options());
  } catch (error) {
    logger.warn("[org-logo] blob delete failed", { error: String(error) });
  }
}
