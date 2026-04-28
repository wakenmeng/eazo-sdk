import { getApiBase, getAppId } from "../config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageCredentials {
  /** Presigned PUT URL — upload a file directly to S3 with this URL (PUT, no auth header needed) */
  uploadUrl: string;
  /** Publicly accessible CDN URL for the uploaded object (permanent, no expiry) */
  publicUrl: string;
  /** Full S3 object key: app-contents/{md5(ownerId)}/{path} */
  key: string;
  bucket: string;
  region: string;
  /** ISO timestamp when the uploadUrl expires */
  expiration: string;
}

export interface UploadResult {
  /** Full S3 object key */
  key: string;
  /** Publicly accessible CDN URL */
  url: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchCredentials(path: string): Promise<StorageCredentials> {
  const appId = getAppId();
  if (!appId) {
    throw new Error(
      "@eazo/sdk: missing app id. Set NEXT_PUBLIC_EAZO_APP_ID or call auth.configure({ appId }).",
    );
  }

  const res = await fetch(`${getApiBase()}/api/open/storage-credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId, path }),
  });

  if (!res.ok) {
    let message = `Failed to get storage credentials: ${res.status}`;
    try {
      const body = await res.json() as { message?: string };
      if (body?.message) message = body.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const json = await res.json() as { data: StorageCredentials };
  return json.data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const storage = {
  /**
   * Upload a file to Eazo built-in object storage.
   *
   * Internally this:
   *  1. Requests a presigned PUT URL from portal-agent-server (scoped to your
   *     tenant prefix via STS Session Policy).
   *  2. PUTs the file directly to S3 — no platform bandwidth used.
   *  3. Returns the S3 key and a permanent CDN URL.
   *
   * @param path  Relative object path, e.g. "todos/123/avatar.png"
   * @param file  File or Blob to upload
   * @param options.contentType  MIME type (defaults to file.type)
   */
  async upload(
    path: string,
    file: File | Blob,
    options: { contentType?: string } = {},
  ): Promise<UploadResult> {
    const creds = await fetchCredentials(path);
    const contentType = options.contentType ?? (file instanceof File ? file.type : "application/octet-stream");

    const putRes = await fetch(creds.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    });

    if (!putRes.ok) {
      throw new Error(`Failed to upload file to storage: ${putRes.status}`);
    }

    return { key: creds.key, url: creds.publicUrl };
  },

  /**
   * Low-level: fetch raw storage credentials without uploading.
   * Useful when you need the uploadUrl upfront,
   * or when you want to hand the uploadUrl to a native file picker.
   */
  getCredentials(path: string): Promise<StorageCredentials> {
    return fetchCredentials(path);
  },
};
