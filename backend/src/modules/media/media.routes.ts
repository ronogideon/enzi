import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/error";
import { requireStaff } from "../../middleware/auth";

export const mediaRouter = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch(next);

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB per image after browser-side downscale

/**
 * Uploads arrive as base64 data URLs rather than multipart. The admin resizes
 * each photo on a canvas before sending (max 1600px, JPEG q0.82), so a 6 MB
 * phone snap lands here as ~250 KB — small enough that JSON is the simpler,
 * dependency-free transport, and it keeps the whole flow inside the one
 * Bearer-token auth path the rest of the API already uses.
 *
 * Bytes go into Postgres deliberately: Railway containers have an ephemeral
 * filesystem, so anything written to disk disappears on the next deploy. This
 * avoids needing an S3 bucket to launch. If the catalogue ever grows past a
 * few hundred photos, swap this module for object storage — nothing else in
 * the codebase needs to change, because products only ever store a URL.
 */
const uploadSchema = z.object({
  filename: z.string().max(200).optional(),
  // "data:image/jpeg;base64,/9j/4AA..."
  data: z.string().min(16),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

function parseDataUrl(data: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/s.exec(data.trim());
  if (!match) throw new HttpError(400, "Image must be a base64 data URL");
  const [, mimeType, b64] = match;
  if (!ALLOWED.has(mimeType))
    throw new HttpError(400, `Unsupported image type: ${mimeType}. Use JPEG, PNG, WebP or GIF.`);

  const buffer = Buffer.from(b64, "base64");
  if (buffer.length === 0) throw new HttpError(400, "Image data was empty");
  if (buffer.length > MAX_BYTES)
    throw new HttpError(413, `Image is too large (${Math.round(buffer.length / 1024)} KB, max 4 MB)`);
  return { mimeType, buffer };
}

/** Upload one image. Returns the URL to store on the product. */
mediaRouter.post(
  "/",
  requireStaff,
  wrap(async (req, res) => {
    const body = uploadSchema.parse(req.body);
    const { mimeType, buffer } = parseDataUrl(body.data);

    const asset = await prisma.mediaAsset.create({
      data: {
        filename: (body.filename ?? "upload").slice(0, 200),
        mimeType,
        bytes: buffer,
        size: buffer.length,
        width: body.width,
        height: body.height,
      },
      select: { id: true, filename: true, mimeType: true, size: true, width: true, height: true },
    });

    res.status(201).json({ ...asset, url: `/api/media/${asset.id}` });
  })
);

/** Upload several at once — the product form sends the whole batch. */
mediaRouter.post(
  "/batch",
  requireStaff,
  wrap(async (req, res) => {
    const { images } = z.object({ images: z.array(uploadSchema).min(1).max(12) }).parse(req.body);

    const created = [];
    for (const img of images) {
      const { mimeType, buffer } = parseDataUrl(img.data);
      const asset = await prisma.mediaAsset.create({
        data: {
          filename: (img.filename ?? "upload").slice(0, 200),
          mimeType,
          bytes: buffer,
          size: buffer.length,
          width: img.width,
          height: img.height,
        },
        select: { id: true, filename: true, mimeType: true, size: true },
      });
      created.push({ ...asset, url: `/api/media/${asset.id}` });
    }
    res.status(201).json(created);
  })
);

/**
 * Serve an image. Public — product photos appear on the storefront, and the
 * cuid is unguessable, so there's nothing to gate. Cached hard because the
 * bytes at a given id never change.
 */
mediaRouter.get(
  "/:id",
  wrap(async (req, res) => {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) throw new HttpError(404, "Image not found");

    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Content-Length", String(asset.size));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.end(Buffer.from(asset.bytes));
  })
);

mediaRouter.delete(
  "/:id",
  requireStaff,
  wrap(async (req, res) => {
    const stillUsed = await prisma.productImage.count({ where: { mediaId: req.params.id } });
    if (stillUsed > 0)
      throw new HttpError(409, "That image is still attached to a product");
    await prisma.mediaAsset.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);
