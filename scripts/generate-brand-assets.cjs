#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const cliArgs = process.argv.slice(2);
const macOnly = cliArgs.includes('--mac-only');
const sourceArg = cliArgs.find(arg => !arg.startsWith('--')) || path.join(projectRoot, 'public', 'logo.png');
const sourcePath = path.resolve(projectRoot, sourceArg);
const publicDir = path.join(projectRoot, 'public');
const buildIconDir = path.join(projectRoot, 'build', 'icons');
const pngDir = path.join(buildIconDir, 'png');
const macDir = path.join(buildIconDir, 'mac');
const winDir = path.join(buildIconDir, 'win');
const trayDir = path.join(projectRoot, 'resources', 'tray');
const logoPath = path.join(publicDir, 'logo.png');
const faviconPath = path.join(publicDir, 'favicon.png');
const bannerPath = path.join(publicDir, 'readme-banner.svg');

const appPngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const macIconsetEntries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let crcTable = null;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.status}`;
    throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
  }
}

function requireCommand(command) {
  const result = spawnSync('/usr/bin/which', [command], { stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(`${command} is required to generate brand assets.`);
  }
}

function ensureDirs() {
  for (const dir of [publicDir, pngDir, macDir, winDir, trayDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resizePng(inputPath, outputPath, size) {
  run('sips', ['-z', String(size), String(size), inputPath, '--out', outputPath]);
}

function resizePngTo(inputPath, outputPath, width, height) {
  run('sips', ['-z', String(height), String(width), inputPath, '--out', outputPath]);
}

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function paethPredictor(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upperLeft;
}

function readPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`Source is not a PNG file: ${filePath}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const bytesPerPixel = channels;
  const stride = width * channels;
  const raw = require('zlib').inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * 4);
  let rawOffset = 0;
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const scanline = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const recon = new Uint8Array(stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? recon[x - bytesPerPixel] : 0;
      const up = prev[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      let value = scanline[x];
      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + up) & 0xff;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) value = (value + paethPredictor(left, up, upperLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter: ${filter}`);
      recon[x] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * channels;
      const targetIndex = (y * width + x) * 4;
      pixels[targetIndex] = recon[sourceIndex];
      pixels[targetIndex + 1] = recon[sourceIndex + 1];
      pixels[targetIndex + 2] = recon[sourceIndex + 2];
      pixels[targetIndex + 3] = colorType === 6 ? recon[sourceIndex + 3] : 255;
    }

    prev = recon;
  }

  return { width, height, pixels };
}

function writePng(filePath, image) {
  const { width, height, pixels } = image;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[rawOffset] = 0;
    rawOffset += 1;
    const start = y * stride;
    Buffer.from(pixels.buffer, pixels.byteOffset + start, stride).copy(raw, rawOffset);
    rawOffset += stride;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const compressed = require('zlib').deflateSync(raw, { level: 9 });
  fs.writeFileSync(filePath, Buffer.concat([
    pngSignature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

function getPixel(image, x, y) {
  const index = (y * image.width + x) * 4;
  return [
    image.pixels[index],
    image.pixels[index + 1],
    image.pixels[index + 2],
    image.pixels[index + 3],
  ];
}

function colorDistance(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function mixColor(start, end, amount) {
  return [
    lerp(start[0], end[0], amount),
    lerp(start[1], end[1], amount),
    lerp(start[2], end[2], amount),
  ];
}

function smoothstep(edge0, edge1, value) {
  const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

function sampleBackgroundColor(image) {
  const points = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1],
    [Math.floor(image.width / 2), 0],
    [0, Math.floor(image.height / 2)],
  ];
  const sums = [0, 0, 0];
  for (const [x, y] of points) {
    const pixel = getPixel(image, x, y);
    sums[0] += pixel[0];
    sums[1] += pixel[1];
    sums[2] += pixel[2];
  }
  return sums.map(value => Math.round(value / points.length));
}

function findVisibleBounds(image, alphaThreshold = 8) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = getPixel(image, x, y);
      if (pixel[3] > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function createTransparentCanvas(size) {
  return {
    width: size,
    height: size,
    pixels: new Uint8Array(size * size * 4),
  };
}

function createImage(width, height) {
  return {
    width,
    height,
    pixels: new Uint8Array(width * height * 4),
  };
}

function setPixel(image, x, y, rgba) {
  const index = (y * image.width + x) * 4;
  image.pixels[index] = clampColor(rgba[0]);
  image.pixels[index + 1] = clampColor(rgba[1]);
  image.pixels[index + 2] = clampColor(rgba[2]);
  image.pixels[index + 3] = clampColor(rgba[3]);
}

function compositeImage(target, source, offsetX, offsetY, opacity = 1) {
  for (let y = 0; y < source.height; y += 1) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= target.height) continue;
    for (let x = 0; x < source.width; x += 1) {
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= target.width) continue;
      const sourcePixel = getPixel(source, x, y);
      const sourceAlpha = (sourcePixel[3] / 255) * opacity;
      if (sourceAlpha <= 0) continue;
      const targetPixel = getPixel(target, targetX, targetY);
      const targetAlpha = targetPixel[3] / 255;
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      const output = [0, 0, 0, outputAlpha * 255];
      for (let channel = 0; channel < 3; channel += 1) {
        output[channel] = outputAlpha === 0
          ? 0
          : (sourcePixel[channel] * sourceAlpha + targetPixel[channel] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
      }
      setPixel(target, targetX, targetY, output);
    }
  }
}

function drawEllipse(image, centerX, centerY, radiusX, radiusY, color, alpha) {
  const minX = Math.max(0, Math.floor(centerX - radiusX));
  const maxX = Math.min(image.width - 1, Math.ceil(centerX + radiusX));
  const minY = Math.max(0, Math.floor(centerY - radiusY));
  const maxY = Math.min(image.height - 1, Math.ceil(centerY + radiusY));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      const distance = dx * dx + dy * dy;
      if (distance > 1.08) continue;
      const edgeAlpha = 1 - smoothstep(0.78, 1.08, distance);
      const sourceAlpha = alpha * edgeAlpha;
      const targetPixel = getPixel(image, x, y);
      const targetAlpha = targetPixel[3] / 255;
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      const output = [0, 0, 0, outputAlpha * 255];
      for (let channel = 0; channel < 3; channel += 1) {
        output[channel] = outputAlpha === 0
          ? 0
          : (color[channel] * sourceAlpha + targetPixel[channel] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
      }
      setPixel(image, x, y, output);
    }
  }
}

function copyRegionToCanvas(source, bounds, canvas, offsetX, offsetY) {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((bounds.minY + y) * source.width + bounds.minX + x) * 4;
      const targetIndex = ((offsetY + y) * canvas.width + offsetX + x) * 4;
      canvas.pixels[targetIndex] = source.pixels[sourceIndex];
      canvas.pixels[targetIndex + 1] = source.pixels[sourceIndex + 1];
      canvas.pixels[targetIndex + 2] = source.pixels[sourceIndex + 2];
      canvas.pixels[targetIndex + 3] = source.pixels[sourceIndex + 3];
    }
  }
}

function isOuterBackgroundPixel(pixel, backgroundColor) {
  if (pixel[3] <= 8) return true;
  const distance = colorDistance(pixel, backgroundColor);
  if (distance <= 128) return true;

  const [red, green, blue] = pixel;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const isDarkGreenPlate = (
    red <= 74
    && green <= 94
    && blue <= 88
    && green >= red - 8
    && green >= blue - 10
  );
  const isLowContrastShadow = max <= 62 && max - min <= 34;
  return isDarkGreenPlate || isLowContrastShadow;
}

function isInsideEllipse(x, y, centerX, centerY, radiusX, radiusY) {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function distanceToSegment(x, y, startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - startX, y - startY);
  const t = Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared));
  const projectedX = startX + t * dx;
  const projectedY = startY + t * dy;
  return Math.hypot(x - projectedX, y - projectedY);
}

function isProtectedAgentPixel(pixel, x, y, image) {
  if (pixel[3] <= 8) return false;
  const normalizedX = x / Math.max(1, image.width - 1);
  const normalizedY = y / Math.max(1, image.height - 1);
  const [red, green, blue] = pixel;
  const isDarkAgentMaterial = red <= 92 && green <= 104 && blue <= 98;
  if (!isDarkAgentMaterial) return false;

  return (
    isInsideEllipse(normalizedX, normalizedY, 0.5, 0.70, 0.165, 0.18)
    || distanceToSegment(normalizedX, normalizedY, 0.35, 0.63, 0.27, 0.78) <= 0.04
    || distanceToSegment(normalizedX, normalizedY, 0.65, 0.63, 0.73, 0.78) <= 0.04
    || isInsideEllipse(normalizedX, normalizedY, 0.5, 0.43, 0.31, 0.19)
  );
}

function clearConnectedOuterBackground(image, backgroundColor) {
  const visited = new Uint8Array(image.width * image.height);
  const stack = [];

  const addIfBackground = (x, y) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
    const key = y * image.width + x;
    if (visited[key]) return;
    const pixel = getPixel(image, x, y);
    if (isOuterBackgroundPixel(pixel, backgroundColor) && !isProtectedAgentPixel(pixel, x, y, image)) {
      visited[key] = 1;
      stack.push([x, y]);
    }
  };

  for (let x = 0; x < image.width; x += 1) {
    addIfBackground(x, 0);
    addIfBackground(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    addIfBackground(0, y);
    addIfBackground(image.width - 1, y);
  }

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const index = (y * image.width + x) * 4;
    image.pixels[index] = 0;
    image.pixels[index + 1] = 0;
    image.pixels[index + 2] = 0;
    image.pixels[index + 3] = 0;
    addIfBackground(x + 1, y);
    addIfBackground(x - 1, y);
    addIfBackground(x, y + 1);
    addIfBackground(x, y - 1);
  }
}

function featherTransparentEdges(image) {
  const next = new Uint8Array(image.pixels);
  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const index = (y * image.width + x) * 4;
      if (image.pixels[index + 3] === 0) continue;
      let transparentNeighbors = 0;
      const neighborOffsets = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dx, dy] of neighborOffsets) {
        const neighborIndex = ((y + dy) * image.width + x + dx) * 4;
        if (image.pixels[neighborIndex + 3] === 0) transparentNeighbors += 1;
      }
      if (transparentNeighbors > 0 && image.pixels[index + 3] < 245) {
        next[index + 3] = Math.max(0, image.pixels[index + 3] - transparentNeighbors * 24);
      }
    }
  }
  image.pixels = next;
}

function clearLowAlphaNoise(image) {
  for (let index = 3; index < image.pixels.length; index += 4) {
    if (image.pixels[index] <= 12) {
      image.pixels[index - 3] = 0;
      image.pixels[index - 2] = 0;
      image.pixels[index - 1] = 0;
      image.pixels[index] = 0;
    }
  }
}

function removeSmallVisibleComponents(image, minPixels) {
  const visited = new Uint8Array(image.width * image.height);
  const component = [];
  const stack = [];

  const clearComponent = () => {
    for (const key of component) {
      const index = key * 4;
      image.pixels[index] = 0;
      image.pixels[index + 1] = 0;
      image.pixels[index + 2] = 0;
      image.pixels[index + 3] = 0;
    }
  };

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const key = y * image.width + x;
      if (visited[key]) continue;
      visited[key] = 1;
      const pixel = getPixel(image, x, y);
      if (pixel[3] <= 8) continue;

      component.length = 0;
      component.push(key);
      stack.push([x, y]);

      while (stack.length > 0) {
        const [currentX, currentY] = stack.pop();
        const neighbors = [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ];
        for (const [nextX, nextY] of neighbors) {
          if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) continue;
          const nextKey = nextY * image.width + nextX;
          if (visited[nextKey]) continue;
          visited[nextKey] = 1;
          const nextPixel = getPixel(image, nextX, nextY);
          if (nextPixel[3] > 8) {
            component.push(nextKey);
            stack.push([nextX, nextY]);
          }
        }
      }

      if (component.length < minPixels) {
        clearComponent();
      }
    }
  }
}

function centerVisibleSubject(image, paddingRatio) {
  const bounds = findVisibleBounds(image);
  if (!bounds) return image;

  const subjectWidth = bounds.maxX - bounds.minX + 1;
  const subjectHeight = bounds.maxY - bounds.minY + 1;
  const subjectSize = Math.max(subjectWidth, subjectHeight);
  const padding = Math.round(subjectSize * paddingRatio);
  const canvasSize = subjectSize + padding * 2;
  const canvas = createTransparentCanvas(canvasSize);
  const offsetX = Math.round((canvasSize - subjectWidth) / 2);
  const offsetY = Math.round((canvasSize - subjectHeight) / 2);
  copyRegionToCanvas(image, bounds, canvas, offsetX, offsetY);
  return canvas;
}

function createTransparentAgentIconSource(inputPath, outputPath) {
  const source = readPng(inputPath);
  const image = {
    width: source.width,
    height: source.height,
    pixels: new Uint8Array(source.pixels),
  };
  clearConnectedOuterBackground(image, sampleBackgroundColor(image));
  featherTransparentEdges(image);
  clearLowAlphaNoise(image);
  removeSmallVisibleComponents(image, 1000);
  writePng(outputPath, centerVisibleSubject(image, 0.08));
}

function copySourceLogo() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source icon not found: ${sourcePath}`);
  }
  createTransparentAgentIconSource(sourcePath, logoPath);
}

function generatePngIcons() {
  for (const size of appPngSizes) {
    resizePng(logoPath, path.join(pngDir, `${size}x${size}.png`), size);
  }
  resizePng(logoPath, faviconPath, 32);
}

function createMacAppIconSource(agentPngPath, outputPath) {
  const size = 1024;
  const image = createImage(size, size);
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.462;
  const exponent = 4.6;
  const topColor = [255, 239, 199];
  const middleColor = [108, 162, 147];
  const bottomColor = [12, 54, 49];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const normalizedX = Math.abs((x - centerX) / radius);
      const normalizedY = Math.abs((y - centerY) / radius);
      const squircleDistance = Math.pow(normalizedX, exponent) + Math.pow(normalizedY, exponent);
      const alpha = (1 - smoothstep(0.985, 1.025, squircleDistance)) * 255;
      if (alpha <= 0) continue;

      const vertical = y / (size - 1);
      let color = vertical < 0.52
        ? mixColor(topColor, middleColor, vertical / 0.52)
        : mixColor(middleColor, bottomColor, (vertical - 0.52) / 0.48);
      const glowX = (x - size * 0.58) / (size * 0.45);
      const glowY = (y - size * 0.22) / (size * 0.36);
      const glow = Math.max(0, 1 - glowX * glowX - glowY * glowY);
      color = mixColor(color, [255, 222, 119], glow * 0.42);
      const edge = Math.pow(Math.max(normalizedX, normalizedY), 2.2);
      color = mixColor(color, [5, 31, 29], Math.max(0, edge - 0.63) * 0.28);
      setPixel(image, x, y, [color[0], color[1], color[2], alpha]);
    }
  }

  drawEllipse(image, size * 0.5, size * 0.79, size * 0.27, size * 0.07, [0, 27, 24], 0.2);
  const agent = readPng(agentPngPath);
  compositeImage(image, agent, Math.round((size - agent.width) / 2), 120);
  writePng(outputPath, image);
}

function generateMacIcon() {
  const iconsetDir = path.join(macDir, 'icon.iconset');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-mac-icon-'));
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  try {
    const agentPngPath = path.join(tempDir, 'agent.png');
    const macIconSourcePath = path.join(tempDir, 'mac-icon-source.png');
    resizePng(logoPath, agentPngPath, 760);
    createMacAppIconSource(agentPngPath, macIconSourcePath);
    fs.copyFileSync(macIconSourcePath, path.join(macDir, 'icon.png'));

    for (const [name, size] of macIconsetEntries) {
      resizePng(macIconSourcePath, path.join(iconsetDir, name), size);
    }

    run('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(macDir, 'icon.icns')]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(iconsetDir, { recursive: true, force: true });
  }
}

function createIco(source, outputPath, sizes) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-ico-'));
  try {
    const images = sizes.map((size) => {
      const pngPath = path.join(tempDir, `${size}.png`);
      resizePng(source, pngPath, size);
      return { size, data: fs.readFileSync(pngPath) };
    });

    const count = images.length;
    const headerSize = 6;
    const entrySize = 16;
    let offset = headerSize + entrySize * count;
    const entries = images.map((image) => {
      const entry = { ...image, offset };
      offset += image.data.length;
      return entry;
    });

    const ico = Buffer.alloc(offset);
    ico.writeUInt16LE(0, 0);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(count, 4);

    entries.forEach((entry, index) => {
      const entryOffset = headerSize + index * entrySize;
      ico.writeUInt8(entry.size >= 256 ? 0 : entry.size, entryOffset);
      ico.writeUInt8(entry.size >= 256 ? 0 : entry.size, entryOffset + 1);
      ico.writeUInt8(0, entryOffset + 2);
      ico.writeUInt8(0, entryOffset + 3);
      ico.writeUInt16LE(1, entryOffset + 4);
      ico.writeUInt16LE(32, entryOffset + 6);
      ico.writeUInt32LE(entry.data.length, entryOffset + 8);
      ico.writeUInt32LE(entry.offset, entryOffset + 12);
      entry.data.copy(ico, entry.offset);
    });

    fs.writeFileSync(outputPath, ico);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function generateWindowsIcons() {
  createIco(logoPath, path.join(winDir, 'icon.ico'), [16, 24, 32, 48, 64, 128, 256]);
  createIco(logoPath, path.join(trayDir, 'tray-icon.ico'), [16, 32, 48]);
}

function generateTrayIcons() {
  resizePng(logoPath, path.join(trayDir, 'tray-icon-mac.png'), 18);
  resizePng(logoPath, path.join(trayDir, 'tray-icon-mac@2x.png'), 36);
  resizePng(logoPath, path.join(trayDir, 'tray-icon.png'), 22);
}

function generateBanner() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-banner-'));
  try {
    const bannerLogoPath = path.join(tempDir, 'banner-logo.png');
    resizePng(logoPath, bannerLogoPath, 288);
    const logoBase64 = fs.readFileSync(bannerLogoPath).toString('base64');

    const svg = `<svg width="1200" height="420" viewBox="0 0 1200 420" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="420" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#082C28"/>
      <stop offset="0.52" stop-color="#123D36"/>
      <stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(949 103) rotate(132) scale(393 260)">
      <stop stop-color="#FDE68A" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#FDE68A" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="42" y="35" width="350" height="350" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#031E1A" flood-opacity="0.32"/>
    </filter>
  </defs>
  <rect width="1200" height="420" rx="38" fill="url(#bg)"/>
  <rect width="1200" height="420" rx="38" fill="url(#glow)"/>
  <path d="M750 67C880 31 1040 54 1165 144V420H675C657 262 655 94 750 67Z" fill="#F8E7B7" fill-opacity="0.13"/>
  <path d="M760 326C875 286 988 291 1116 342" stroke="#F8E7B7" stroke-opacity="0.22" stroke-width="2"/>
  <g filter="url(#shadow)">
    <image href="data:image/png;base64,${logoBase64}" x="72" y="66" width="288" height="288"/>
  </g>
  <text x="404" y="156" fill="#FFF7DF" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="72" font-weight="800" letter-spacing="0">WeSight</text>
  <text x="408" y="205" fill="#FDE68A" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="24" font-weight="700" letter-spacing="0">Desktop AI Agent Workspace</text>
  <text x="408" y="248" fill="#FFF7DF" fill-opacity="0.86" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="21" font-weight="500" letter-spacing="0">Run Claude Code, Codex, OpenClaw, Hermes Agent, and local CLIs</text>
  <text x="408" y="280" fill="#FFF7DF" fill-opacity="0.78" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="21" font-weight="500" letter-spacing="0">with visual tool execution, skills, memory, and model routing.</text>
  <g font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="17" font-weight="700" letter-spacing="0">
    <rect x="408" y="310" width="124" height="38" rx="19" fill="#FFF7DF" fill-opacity="0.14"/>
    <text x="432" y="335" fill="#FFF7DF">Agent CLI</text>
    <rect x="546" y="310" width="132" height="38" rx="19" fill="#FFF7DF" fill-opacity="0.14"/>
    <text x="570" y="335" fill="#FFF7DF">Runtime UI</text>
    <rect x="692" y="310" width="126" height="38" rx="19" fill="#FFF7DF" fill-opacity="0.14"/>
    <text x="716" y="335" fill="#FFF7DF">Local First</text>
    <rect x="832" y="310" width="152" height="38" rx="19" fill="#FFF7DF" fill-opacity="0.14"/>
    <text x="856" y="335" fill="#FFF7DF">Model Router</text>
  </g>
</svg>
`;
    fs.writeFileSync(bannerPath, svg);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function main() {
  requireCommand('sips');
  requireCommand('iconutil');
  ensureDirs();
  if (macOnly) {
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo not found: ${logoPath}`);
    }
    generateMacIcon();
    console.log(`Generated WeSight macOS icon from ${logoPath}`);
    return;
  }
  copySourceLogo();
  generatePngIcons();
  generateMacIcon();
  generateWindowsIcons();
  generateTrayIcons();
  generateBanner();

  console.log(`Generated WeSight brand assets from ${sourcePath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
