import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The portal's app icon: the ringed "O" of the ROYA logo, white on Roya red.
// Phones crop the maskable icon to their own shape and iOS fills transparent corners with black,
// so those two must be fully opaque; the others keep the rounded, transparent corners.
const root = join(__dirname, '..');

function pngInfo(file: string) {
  const buf = readFileSync(join(root, file));
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25] };
}

describe('app icon', () => {
  it.each([
    ['public/icon-512.png', 512, 6],
    ['public/icon-192.png', 192, 6],
    ['public/favicon.png', 32, 6],
    ['public/icon-maskable-512.png', 512, 2],
    ['public/apple-touch-icon.png', 180, 2],
  ])('%s is %i px (colour type %i)', (file, size, colourType) => {
    expect(pngInfo(file)).toEqual({ width: size, height: size, colourType });
  });

  it('is the ringed ROYA "O", not the old red "R"', () => {
    const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8');
    expect(svg).not.toContain('#dc2626');
    expect(svg).toContain('ringed "O" of the ROYA logo');
  });

  it('every icon the manifest names is a file in public/', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const size = Number(icon.sizes.split('x')[0]);
      expect(pngInfo(`public${icon.src}`).width, icon.src).toBe(size);
    }
  });
});
