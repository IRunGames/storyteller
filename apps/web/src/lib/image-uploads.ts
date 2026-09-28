/** The content types the upload route issues tokens for, and the only ones the field offers. */
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/** The largest upload the route will authorise. The field refuses the same size client-side. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * Where one user's uploads live. The user id in the key is not access control
 * — the store is public — it is what lets the delete action prove a blob is
 * the caller's own before it removes anything.
 */
export function uploadPrefix(userId: string): string {
  return `uploads/${userId}/`;
}

/**
 * Whether a stored value is a blob this app uploaded, as opposed to a link a
 * user typed.
 *
 * Deliberately parses rather than testing the raw string. A host such as
 * `public.blob.vercel-storage.com.example.com` contains the store domain, so
 * a substring test would hand an attacker a URL the delete action treats as
 * ours. Parsing first and testing the hostname is what makes the check mean
 * what it says. The hostname is lowercased and a trailing root dot dropped,
 * both of which the URL parser preserves and neither of which changes the
 * host.
 */
export function isUploadedBlobUrl(value: string): boolean {
  const url = parse(value);
  return url !== null && hostname(url).endsWith(BLOB_HOST_SUFFIX);
}

/** As isUploadedBlobUrl, and the key is under this user's own prefix. */
export function isOwnUploadedBlobUrl(value: string, userId: string): boolean {
  const url = parse(value);
  if (url === null || !hostname(url).endsWith(BLOB_HOST_SUFFIX)) return false;
  return url.pathname.startsWith(`/${uploadPrefix(userId)}`);
}

function parse(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // The store is served over https only, so anything else is not ours.
  return url.protocol === "https:" ? url : null;
}

function hostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}
