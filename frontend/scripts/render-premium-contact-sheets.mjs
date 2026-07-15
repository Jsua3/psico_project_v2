#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const FONT = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  a: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  b: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  c: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  d: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  e: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  f: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  g: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  h: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  i: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  j: ['00001', '00001', '00001', '00001', '10001', '10001', '01110'],
  k: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  l: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  m: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  n: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  o: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  p: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  r: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  s: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  t: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  u: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  v: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  w: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  x: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const CONTACT_SCALES = Object.freeze([1, 2]);
const ZOOM_GAP = 4;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalHash(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function readManifest(filePath, label) {
  if (!existsSync(filePath)) throw new Error(`${label} missing: ${filePath}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} invalid JSON at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(manifest) || manifest.schemaVersion !== 1 || !HASH_PATTERN.test(manifest.manifestHash ?? '')) {
    throw new Error(`${label} is not a validated schemaVersion 1 manifest: ${filePath}`);
  }
  const body = { ...manifest };
  delete body.manifestHash;
  const expectedHash = canonicalHash(body);
  if (manifest.manifestHash !== expectedHash) {
    throw new Error(`${label} manifestHash drift/mismatch: expected ${expectedHash}, received ${manifest.manifestHash}`);
  }
  return manifest;
}

function resolveAsset(assetsRoot, src, label) {
  if (typeof src !== 'string' || src.trim() === '') throw new Error(`${label}: blank src`);
  const rawRelative = src.startsWith('/assets/') ? src.slice('/assets/'.length) : src;
  const relativeSrc = rawRelative.replaceAll('\\', '/');
  const segments = relativeSrc.split('/');
  if (
    path.isAbsolute(relativeSrc) || path.win32.isAbsolute(relativeSrc) || path.posix.isAbsolute(relativeSrc)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error(`${label}: asset path escape ${src}`);
  }
  const root = path.resolve(assetsRoot);
  if (!existsSync(root)) throw new Error(`${label}: assetsRoot missing ${root}`);
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error(`${label}: assetsRoot symlink/junction/reparse root not allowed ${root}`);
  }
  const filePath = path.resolve(root, relativeSrc);
  if (!isContained(root, filePath) || !existsSync(filePath)) {
    throw new Error(`${label}: asset missing or outside root ${filePath}`);
  }
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label}: asset symlink/junction/reparse path component not allowed ${relativeSrc}`);
    }
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(filePath);
  if (!isContained(realRoot, realFile)) throw new Error(`${label}: asset realpath escape ${relativeSrc}`);
  if (!lstatSync(realFile).isFile()) throw new Error(`${label}: asset is not a file ${relativeSrc}`);
  return realFile;
}

function decodeAsset(assetsRoot, item) {
  const filePath = resolveAsset(assetsRoot, item.src, item.id);
  const bytes = readFileSync(filePath);
  if (!HASH_PATTERN.test(item.sha256 ?? '')) throw new Error(`${item.id}: missing validated sha256`);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== item.sha256) {
    throw new Error(`${item.id}: sha256 drift/mismatch; expected ${item.sha256}, received ${actualSha256}`);
  }
  let source;
  try {
    source = PNG.sync.read(bytes, { checkCRC: true });
  } catch (error) {
    throw new Error(`${item.id}: invalid PNG ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }
  const cropX = item.cropX ?? 0;
  const cropY = item.cropY ?? 0;
  const sourceWidth = item.frameWidth ?? source.width;
  const sourceHeight = item.frameHeight ?? source.height;
  if (!Number.isInteger(cropX) || !Number.isInteger(cropY) || cropX < 0 || cropY < 0
    || !Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight)
    || sourceWidth <= 0 || sourceHeight <= 0
    || cropX + sourceWidth > source.width || cropY + sourceHeight > source.height) {
    throw new Error(`${item.id}: invalid contact-sheet crop ${sourceWidth}x${sourceHeight}`);
  }
  return {
    ...item,
    source,
    cropX,
    cropY,
    sourceWidth,
    sourceHeight,
    sourceSha256: actualSha256,
    scales: [...CONTACT_SCALES],
    displayWidth: sourceWidth * 3 + ZOOM_GAP,
    displayHeight: sourceHeight * 2,
  };
}

function setPixel(png, x, y, rgba) {
  const offset = (y * png.width + x) * 4;
  png.data[offset] = rgba[0];
  png.data[offset + 1] = rgba[1];
  png.data[offset + 2] = rgba[2];
  png.data[offset + 3] = rgba[3];
}

function copyNearest(source, target, targetX, targetY, cropX, cropY, width, height, scale) {
  for (let y = 0; y < height * scale; y += 1) {
    for (let x = 0; x < width * scale; x += 1) {
      const sourceX = cropX + Math.floor(x / scale);
      const sourceY = cropY + Math.floor(y / scale);
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      setPixel(target, targetX + x, targetY + y, source.data.subarray(sourceOffset, sourceOffset + 4));
    }
  }
}

function drawText(png, text, x, y) {
  const normalized = text.toLowerCase();
  for (const [characterIndex, character] of [...normalized].entries()) {
    const glyph = FONT[character];
    if (!glyph) throw new Error(`contact-sheet label contains unsupported character ${JSON.stringify(character)} in ${text}`);
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === '1') setPixel(png, x + characterIndex * 6 + column, y + row, [241, 242, 244, 255]);
      }
    }
  }
}

function prepareSheet(items, outputPath) {
  if (items.length === 0) throw new Error(`${path.basename(outputPath)}: no validated assets to render`);
  const decoded = items.map((item) => decodeAsset(item.assetsRoot, item));
  const columns = Math.min(4, decoded.length);
  const rows = Math.ceil(decoded.length / columns);
  const labelWidths = decoded.map(({ label }) => [...label].length * 6 - 1);
  const cellWidth = Math.max(...decoded.map(({ displayWidth }) => displayWidth), ...labelWidths) + 16;
  const cellHeight = Math.max(...decoded.map(({ displayHeight }) => displayHeight)) + 31;
  const sheet = new PNG({ width: columns * cellWidth, height: rows * cellHeight });
  sheet.data.fill(0);

  for (const [index, item] of decoded.entries()) {
    const cellX = (index % columns) * cellWidth;
    const cellY = Math.floor(index / columns) * cellHeight;
    for (let x = 0; x < cellWidth; x += 1) {
      setPixel(sheet, cellX + x, cellY, [33, 30, 43, 255]);
      setPixel(sheet, cellX + x, cellY + cellHeight - 1, [33, 30, 43, 255]);
    }
    for (let y = 0; y < cellHeight; y += 1) {
      setPixel(sheet, cellX, cellY + y, [33, 30, 43, 255]);
      setPixel(sheet, cellX + cellWidth - 1, cellY + y, [33, 30, 43, 255]);
    }
    const imageX = cellX + Math.floor((cellWidth - item.displayWidth) / 2);
    const imageY = cellY + 8;
    copyNearest(
      item.source, sheet, imageX, imageY,
      item.cropX, item.cropY, item.sourceWidth, item.sourceHeight, 1,
    );
    copyNearest(
      item.source, sheet, imageX + item.sourceWidth + ZOOM_GAP, imageY,
      item.cropX, item.cropY, item.sourceWidth, item.sourceHeight, 2,
    );
    drawText(sheet, item.label, cellX + 8, cellY + cellHeight - 15);
  }

  const bytes = PNG.sync.write(sheet, {
    colorType: 6,
    inputColorType: 6,
    bitDepth: 8,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
  return {
    path: outputPath,
    bytes,
    cells: decoded.map(({
      id, assetId, sampleId, label, sourceWidth, sourceHeight,
      displayWidth, displayHeight, sourceSha256, scales, cropX, cropY,
    }) => ({
      assetId: id,
      ...(assetId === undefined ? {} : { ownerId: assetId }),
      ...(sampleId === undefined ? {} : { sampleId }),
      label,
      sourceWidth,
      sourceHeight,
      displayWidth,
      displayHeight,
      sourceSha256,
      scales,
      cropX,
      cropY,
    })),
  };
}

function verifyVariant(variant, ownerId) {
  if (!isPlainObject(variant) || !HASH_PATTERN.test(variant.contentHash ?? '')) {
    throw new Error(`character manifest entry ${ownerId} has incomplete contentHash`);
  }
  const body = { ...variant };
  delete body.contentHash;
  const expectedHash = canonicalHash(body);
  if (variant.contentHash !== expectedHash) {
    throw new Error(`${ownerId} contentHash drift/mismatch: expected ${expectedHash}, received ${variant.contentHash}`);
  }
}

function frameItem({ assetsRoot, ownerId, variant, sampleId, sheetId, frameIndex }) {
  const sheet = variant.sheets?.[sheetId] ?? (sheetId === 'portrait' ? variant.portrait?.sheet : undefined);
  if (!isPlainObject(sheet) || typeof sheet.src !== 'string' || !HASH_PATTERN.test(sheet.sha256 ?? '')) {
    throw new Error(`${ownerId} ${sampleId}: incomplete ${sheetId} sheet`);
  }
  const { columns, rows, frameWidth, frameHeight } = sheet;
  if (![columns, rows, frameWidth, frameHeight].every((value) => Number.isInteger(value) && value > 0)) {
    throw new Error(`${ownerId} ${sampleId}: invalid ${sheetId} geometry`);
  }
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= columns * rows) {
    throw new Error(`${ownerId} ${sampleId}: frame index ${frameIndex} outside ${sheetId}`);
  }
  const id = `${ownerId}-${sampleId}`;
  return {
    assetsRoot,
    id,
    assetId: ownerId,
    sampleId,
    label: `${id} ${variant.contentHash.slice(0, 12)}`,
    src: sheet.src,
    sha256: sheet.sha256,
    frameWidth,
    frameHeight,
    cropX: (frameIndex % columns) * frameWidth,
    cropY: Math.floor(frameIndex / columns) * frameHeight,
  };
}

function animationFrame(variant, ownerId, animationId, direction, expectedSheetId) {
  const animation = variant.animations?.[animationId];
  const frameIndex = animation?.directions?.[direction]?.[0];
  if (!isPlainObject(animation) || animation.sheetId !== expectedSheetId || !Number.isInteger(frameIndex)) {
    throw new Error(`${ownerId}: animation ${animationId} missing ${direction} representative frame`);
  }
  return frameIndex;
}

function representativeCharacterItems(assetsRoot, ownerId, variant) {
  verifyVariant(variant, ownerId);
  const items = [];
  for (const direction of ['down', 'left', 'right', 'up']) {
    items.push(frameItem({
      assetsRoot,
      ownerId,
      variant,
      sampleId: `idle-${direction}`,
      sheetId: 'idle',
      frameIndex: animationFrame(variant, ownerId, 'idle', direction, 'idle'),
    }));
  }
  for (const animationId of ['walk', 'talk', 'interact', 'turn']) {
    items.push(frameItem({
      assetsRoot,
      ownerId,
      variant,
      sampleId: `${animationId}-down`,
      sheetId: animationId,
      frameIndex: animationFrame(variant, ownerId, animationId, 'down', animationId),
    }));
  }
  for (const [reaction, animationId] of [
    ['relief', 'reactRelief'],
    ['steady', 'reactSteady'],
    ['tension', 'reactTension'],
    ['rupture', 'reactRupture'],
  ]) {
    items.push(frameItem({
      assetsRoot,
      ownerId,
      variant,
      sampleId: `react-${reaction}`,
      sheetId: 'react',
      frameIndex: animationFrame(variant, ownerId, animationId, 'down', 'react'),
    }));
  }
  for (const state of ['neutral', 'focused', 'concerned', 'relieved', 'relief', 'steady', 'tension', 'rupture']) {
    const frameIndex = variant.portrait?.states?.[state]?.[0];
    if (!Number.isInteger(frameIndex)) throw new Error(`${ownerId}: portrait state ${state} missing representative frame`);
    items.push(frameItem({
      assetsRoot,
      ownerId,
      variant,
      sampleId: `portrait-${state}`,
      sheetId: 'portrait',
      frameIndex,
    }));
  }
  return items;
}

function characterItems(manifest, assetsRoot, actors) {
  const records = actors ? manifest.actorVisuals : manifest.identities;
  if (!Array.isArray(records)) throw new Error(`character manifest missing ${actors ? 'actorVisuals' : 'identities'}`);
  return [...records]
    .sort((left, right) => {
      const leftId = actors ? left.visualId : left.characterId;
      const rightId = actors ? right.visualId : right.characterId;
      return String(leftId).localeCompare(String(rightId));
    })
    .flatMap((record) => {
      const variant = actors ? record.variant : record.variants?.[0];
      const id = actors ? record.visualId : record.characterId;
      if (typeof id !== 'string' || id === '') throw new Error('character manifest contains blank character/visual id');
      return representativeCharacterItems(assetsRoot, id, variant);
    });
}

function canonicalAssetSrc(src, label) {
  if (typeof src !== 'string' || src.trim() === '') throw new Error(`${label}: blank src`);
  const relative = src.startsWith('/assets/') ? src.slice('/assets/'.length) : src;
  return relative.replaceAll('\\', '/');
}

function validatePersonActorCrossContract(characterManifest, visualManifest) {
  if (!Array.isArray(characterManifest.actorVisuals)) throw new Error('character manifest missing actorVisuals');
  if (!isPlainObject(characterManifest.actorMappings)) throw new Error('character manifest missing actorMappings');
  if (!Array.isArray(visualManifest.assets)) throw new Error('premium visual manifest missing assets');

  const actorByVisualId = new Map();
  for (const actorVisual of characterManifest.actorVisuals) {
    const { visualId, variant } = actorVisual;
    if (typeof visualId !== 'string' || visualId === '') throw new Error('character manifest contains blank visualId');
    if (actorByVisualId.has(visualId)) throw new Error(`duplicate actor visualId ${visualId}`);
    verifyVariant(variant, visualId);
    actorByVisualId.set(visualId, actorVisual);
  }
  for (const [actorId, visualId] of Object.entries(characterManifest.actorMappings)) {
    if (!actorByVisualId.has(visualId)) throw new Error(`actorMappings ${actorId}: unknown visualId ${visualId}`);
  }

  const personEntries = visualManifest.assets.filter(({ category }) => category === 'person');
  const personByAssetId = new Map();
  for (const entry of personEntries) {
    if (personByAssetId.has(entry.assetId)) throw new Error(`duplicate person assetId ${entry.assetId}`);
    personByAssetId.set(entry.assetId, entry);
  }

  for (const [visualId, actorVisual] of actorByVisualId) {
    const expectedAssetId = `person-${visualId}`;
    const person = personByAssetId.get(expectedAssetId);
    if (!person) throw new Error(`${expectedAssetId}: missing/absent person entry for actor visual ${visualId}`);
    const idle = actorVisual.variant.sheets?.idle;
    if (!isPlainObject(idle) || typeof idle.src !== 'string' || !HASH_PATTERN.test(idle.sha256 ?? '')) {
      throw new Error(`${visualId}: approved idle sheet is incomplete`);
    }
    if (canonicalAssetSrc(person.src, expectedAssetId) !== canonicalAssetSrc(idle.src, `${visualId}.idle`)) {
      throw new Error(`${expectedAssetId}: src mismatch with approved actor idle sheet`);
    }
    if (person.sha256 !== idle.sha256) {
      throw new Error(`${expectedAssetId}: sha256 drift/mismatch with approved actor idle sheet`);
    }
    const expectedBindings = Object.entries(characterManifest.actorMappings)
      .filter(([, mappedVisualId]) => mappedVisualId === visualId)
      .map(([actorId]) => `person:${actorId}`)
      .sort();
    const actualBindings = Array.isArray(person.bindings) ? [...person.bindings].sort() : [];
    if (
      actualBindings.length !== expectedBindings.length
      || actualBindings.some((binding, index) => binding !== expectedBindings[index])
    ) {
      throw new Error(`${expectedAssetId}: bindings drift/mismatch; expected ${expectedBindings.join(', ')}`);
    }
    personByAssetId.delete(expectedAssetId);
  }
  if (personByAssetId.size > 0) {
    throw new Error(`${[...personByAssetId.keys()].sort().join(', ')}: extra/unknown person entries without actor visual`);
  }
}

function visualItems(manifest, assetsRoot, hud) {
  if (!Array.isArray(manifest.assets)) throw new Error('visual manifest missing assets');
  const hudCategories = new Set(['hud-frame', 'hud-icon']);
  return manifest.assets.filter(({ category }) => (
    hud ? hudCategories.has(category) : category !== 'person' && !hudCategories.has(category)
  )).map((entry) => {
    if (!entry.assetId || !entry.src || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) {
      throw new Error(`visual manifest entry ${entry.assetId ?? '?'} is incomplete`);
    }
    return {
      assetsRoot,
      id: entry.assetId,
      assetId: entry.assetId,
      hash: entry.sha256,
      label: `${entry.assetId} ${entry.sha256.slice(0, 12)}`,
      src: entry.src,
      sha256: entry.sha256,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

export function renderPremiumContactSheets({
  assetsRoot,
  characterManifestPath,
  visualManifestPath,
  outputRoot,
}) {
  const characterManifest = readManifest(characterManifestPath, 'character manifest');
  const visualManifest = readManifest(visualManifestPath, 'premium visual manifest');
  validatePersonActorCrossContract(characterManifest, visualManifest);
  const preparations = [
    ['characters.png', characterItems(characterManifest, assetsRoot, false)],
    ['npc.png', characterItems(characterManifest, assetsRoot, true)],
    ['world-assets.png', visualItems(visualManifest, assetsRoot, false)],
    ['hud-assets.png', visualItems(visualManifest, assetsRoot, true)],
  ].map(([name, items]) => [name, prepareSheet(items, path.join(outputRoot, name))]);

  mkdirSync(outputRoot, { recursive: true });
  const outputs = {};
  for (const [name, preparation] of preparations) {
    writeFileSync(preparation.path, preparation.bytes);
    const { bytes: _bytes, ...output } = preparation;
    outputs[name] = output;
  }
  return { outputs };
}

function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const frontendRoot = path.resolve(scriptDirectory, '..');
  const assetsRoot = path.join(frontendRoot, 'src', 'assets');
  const visualRoot = path.join(assetsRoot, 'visual', 'v1');
  renderPremiumContactSheets({
    assetsRoot,
    characterManifestPath: path.join(assetsRoot, 'characters', 'v1', 'manifest.json'),
    visualManifestPath: path.join(visualRoot, 'manifest.json'),
    outputRoot: path.join(visualRoot, 'contact-sheets'),
  });
  process.stdout.write(`contact sheets written to ${path.join(visualRoot, 'contact-sheets')}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
