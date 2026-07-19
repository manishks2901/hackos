import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object-storage helper shared across services.
 *
 * Works against both AWS S3 (production) and MinIO / any S3-compatible store
 * (local dev) from the same env — the only difference is `S3_ENDPOINT`:
 *   - empty            → real AWS S3 (SDK derives the endpoint from region+bucket)
 *   - http://host:9000 → MinIO / custom store (path-style addressing is forced)
 *
 * An S3 access point alias can be used directly as the bucket name, so
 * `S3_ACCESS_POINT_ALIAS` (when set) takes precedence over `S3_BUCKET`.
 */
export interface StorageConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for MinIO / S3-compatible stores; leave undefined for real AWS S3. */
  endpoint?: string;
  forcePathStyle: boolean;
}

export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const endpoint = env.S3_ENDPOINT?.trim() || undefined;
  const bucket = env.S3_ACCESS_POINT_ALIAS?.trim() || env.S3_BUCKET?.trim() || "";
  return {
    region: env.S3_REGION?.trim() || env.AWS_REGION?.trim() || "ap-south-1",
    bucket,
    accessKeyId: env.S3_ACCESS_KEY?.trim() || "",
    secretAccessKey: env.S3_SECRET_KEY?.trim() || "",
    endpoint,
    // MinIO and most S3-compatible stores require path-style addressing;
    // real AWS S3 uses virtual-hosted style (the default).
    forcePathStyle: Boolean(endpoint),
  };
}

export function createS3Client(cfg: StorageConfig): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

/** Thin wrapper exposing the handful of operations the app actually needs. */
export class Storage {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(
    private readonly cfg: StorageConfig = storageConfigFromEnv(),
    client?: S3Client,
  ) {
    if (!cfg.bucket) throw new Error("Storage: S3_BUCKET (or S3_ACCESS_POINT_ALIAS) is not set");
    if (!cfg.accessKeyId || !cfg.secretAccessKey) {
      throw new Error("Storage: S3_ACCESS_KEY / S3_SECRET_KEY are not set");
    }
    this.client = client ?? createS3Client(cfg);
    this.bucket = cfg.bucket;
  }

  /** Upload bytes directly (server-side). */
  async put(key: string, body: Uint8Array | Buffer | string, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Presigned PUT URL so clients upload straight to S3, bypassing the server. */
  presignUpload(key: string, opts: { expiresIn?: number; contentType?: string } = {}): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType }),
      { expiresIn: opts.expiresIn ?? 900 },
    );
  }

  /** Presigned GET URL for time-limited private downloads. */
  presignDownload(key: string, opts: { expiresIn?: number } = {}): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: opts.expiresIn ?? 900,
    });
  }

  /** Health check — verifies credentials + bucket access at startup. */
  async ping(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
