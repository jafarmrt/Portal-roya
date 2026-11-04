import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Android draws the small status-bar icon of a notification (the "badge") from its transparency only:
// every pixel that is not fully transparent turns white. An opaque square icon therefore shows as a
// plain white square, so the badge must be a white shape on a transparent background.
const root = join(__dirname, '..');

/** Width, height, bit depth and colour type of a PNG (colour type 6 = RGBA). */
function pngInfo(file: string) {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25] };
}

describe('notification badge', () => {
  it('is a 96×96 PNG with an alpha channel', () => {
    const info = pngInfo(join(root, 'public/badge-96.png'));
    expect(info).toEqual({ width: 96, height: 96, bitDepth: 8, colourType: 6 });
  });

  it('is what both the service worker and the open tab use, not the opaque app icon', () => {
    for (const file of ['public/sw.js', 'src/lib/push.ts']) {
      const text = readFileSync(join(root, file), 'utf8');
      expect(text, file).toContain("badge: '/badge-96.png'");
      expect(text, file).not.toContain("badge: '/icon-192.png'");
    }
  });
});
