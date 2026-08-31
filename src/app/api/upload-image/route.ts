import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// Server-only: uploads a launch coin's image/banner to Supabase Storage via its
// S3-compatible API, then hands back the public URL that gets stored as
// RoundMetadata.image_url on-chain (cairo/src/lib.cairo). Credentials never reach the
// client — this route is the only thing that reads SUPABASE_S3_*.
const MAX_BYTES = 15 * 1024 * 1024; // matches the "Image - max 15mb" reference copy
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const EXT_FOR_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function s3Client() {
  const endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const region = process.env.SUPABASE_S3_REGION;
  const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function POST(req: NextRequest) {
  const bucket = process.env.SUPABASE_S3_BUCKET;
  const publicBase = process.env.SUPABASE_PUBLIC_URL_BASE;
  const client = s3Client();
  if (!client || !bucket || !publicBase) {
    return NextResponse.json(
      { error: "Image storage isn't configured on this deployment (missing SUPABASE_S3_* env vars)." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type — use PNG, JPG, GIF, or WEBP." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large — max 15MB." }, { status: 400 });
  }

  const ext = EXT_FOR_TYPE[file.type];
  const key = `${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: file.type,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Upload failed." }, { status: 502 });
  }

  return NextResponse.json({ url: `${publicBase}/${key}` });
}
