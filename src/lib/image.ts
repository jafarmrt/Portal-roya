// Photos from phones are often 5–10 MB. Large images are scaled down in the browser before upload,
// which keeps the server disk small and pages fast on phones and the workshop Wi-Fi.

const MAX_SIDE = 1920;
const SKIP_BELOW_BYTES = 300 * 1024;

/** Returns a smaller copy of a JPEG, PNG or WebP image, or the original when shrinking would not help. */
export async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < SKIP_BELOW_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    // JPEG for photos; WebP for PNG and WebP so transparent logos stay transparent.
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
    if (!blob || blob.type !== type || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/jpeg' ? '.jpg' : '.webp');
    return new File([blob], name, { type, lastModified: file.lastModified });
  } catch {
    // Old browsers or unusual files: upload the original as before.
    return file;
  }
}
