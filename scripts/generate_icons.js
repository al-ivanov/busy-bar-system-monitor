import fs from 'node:fs';
import zlib from 'node:zlib';

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(body);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, body, crcBuf]);
}

function makePng(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8 bits per channel
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // deflate
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace 0

  // Filter 0 prefix on each scanline
  const scanlines = [];
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    scanlines.push(Buffer.from([0])); // Filter type 0
    scanlines.push(rgbaBuffer.subarray(y * rowBytes, (y + 1) * rowBytes));
  }
  const rawData = Buffer.concat(scanlines);
  const compressed = zlib.deflateSync(rawData);

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// 1. Front icon: 8x8 Steam / Controller / Bar style
// Using dark slate + neon green accents
const front8 = Buffer.alloc(8 * 8 * 4, 0); // transparent background

function setPixel(buf, w, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= w || y < 0 || y >= w) return;
  const idx = (y * w + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

// Draw a stylized gaming / gauge icon for 8x8:
// Outer ring in dark slate, core in bright green
const pattern8 = [
  '  ####  ',
  ' #....# ',
  '#.G..G.#',
  '#......#',
  '#.GGGG.#',
  '#.G..G.#',
  ' #....# ',
  '  ####  '
];

for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const ch = pattern8[y][x];
    if (ch === '#') setPixel(front8, 8, x, y, 70, 80, 95);
    else if (ch === '.') setPixel(front8, 8, x, y, 30, 35, 45);
    else if (ch === 'G') setPixel(front8, 8, x, y, 34, 197, 94); // #22c55e
  }
}

// 2. Back icon: 11x11 monochrome icon (#888888)
const back11 = Buffer.alloc(11 * 11 * 4, 0);
const pattern11 = [
  '   #####   ',
  '  #.....#  ',
  ' #.......# ',
  '#...#.#...#',
  '#.........#',
  '#...###...#',
  '#...#.#...#',
  '#.........#',
  ' #.......# ',
  '  #.....#  ',
  '   #####   '
];

for (let y = 0; y < 11; y++) {
  for (let x = 0; x < 11; x++) {
    const ch = pattern11[y][x];
    if (ch === '#') setPixel(back11, 11, x, y, 136, 136, 136); // #888888
    else if (ch === '.') setPixel(back11, 11, x, y, 40, 40, 40);
  }
}

fs.writeFileSync('src/appmeta/icon_front_8x8.png', makePng(8, 8, front8));
fs.writeFileSync('src/appmeta/icon_back_11x11.png', makePng(11, 11, back11));
console.log('Generated src/appmeta/icon_front_8x8.png and icon_back_11x11.png');
