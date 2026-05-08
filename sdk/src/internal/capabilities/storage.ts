import { getPlatformApiBase, getAppId } from "../config";

export interface StorageCredentials {
  /** Presigned PUT URL — issue the request without an auth header. */
  uploadUrl: string;
  /** Permanent CDN URL for the uploaded object (no expiry). */
  publicUrl: string;
  /** Full S3 object key, e.g. `app-contents/{md5(ownerId)}/{path}`. */
  key: string;
  bucket: string;
  region: string;
  /** ISO timestamp at which `uploadUrl` expires. */
  expiration: string;
}

export interface UploadResult {
  key: string;
  url: string;
}

async function fetchCredentials(path: string): Promise<StorageCredentials> {
  const appId = getAppId();
  if (!appId) {
    throw new Error(
      "@eazo/sdk: app id not configured. Mount <EazoProvider appId={...}> at the root of your app.",
    );
  }

  const res = await fetch(`${getPlatformApiBase()}/api/open/storage-credentials`, {
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

export const storage = {
  /**
   * Upload a file to Eazo built-in object storage.
   *
   * Two-step: requests a presigned PUT URL (tenant-scoped via STS Session
   * Policy), then PUTs directly to S3 — no platform bandwidth in the
   * critical path. Returns the S3 key and a permanent CDN URL.
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
