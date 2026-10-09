import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

export const REQUIRED_PREMIUM_MAP_KEYS = Object.freeze([
  'hospital-urgencias',
  'hospital-sala-escucha',
  'hospital-sala-accion',
  'hospital-sala-cierre',
  'comisaria-recepcion',
  'comisaria-consultorio',
  'comisaria-marco',
  'comisaria-cierre',
]);

export const REQUIRED_VISUAL_CATEGORIES = Object.freeze([
  'tileset',
  'furniture',
  'person',
  'object',
  'tool',
  'exit',
  'signal',
  'prompt',
  'hud-frame',
  'hud-icon',
]);

const REQUIRED_VISUAL_ASSET_CONTRACT = Object.freeze([
  ['tileset-rpg-urban', 'tileset', ['tileset:rpg-urban']],
  ['tileset-tiny-dungeon', 'tileset', ['tileset:tiny-dungeon']],
  ['tileset-tiny-town', 'tileset', ['tileset:tiny-town']],
  ['furniture-chair', 'furniture', ['furniture:chair']],
  ['furniture-coffee-table', 'furniture', ['furniture:coffee-table']],
  ['furniture-counter', 'furniture', ['furniture:counter']],
  ['furniture-desk', 'furniture', ['furniture:desk']],
  ['furniture-file-cabinet', 'furniture', ['furniture:file-cabinet']],
  ['furniture-gurney', 'furniture', ['furniture:gurney']],
  ['furniture-plant', 'furniture', ['furniture:plant']],
  ['furniture-shelf', 'furniture', ['furniture:shelf']],
  ['furniture-sofa', 'furniture', ['furniture:sofa']],
  ['furniture-waiting-chairs', 'furniture', ['furniture:waiting-chairs']],
  ['person-cuidadora-familia-vbg', 'person', ['person:familia-duelo', 'person:familia-crisis']],
  ['person-psicologa-hospitalaria', 'person', ['person:psicologa-acompanante']],
  ['person-sobreviviente-vbg', 'person', ['person:sobreviviente-consulta', 'person:sobreviviente-espera']],
  ['person-profesional-psicosocial', 'person', ['person:profesional-psicosocial', 'person:apoyo-psicosocial']],
  ['person-funcionaria-recepcion', 'person', ['person:funcionaria-recepcion']],
  ['person-enfermera-urgencias', 'person', ['person:enfermera-urgencias']],
  ['person-medico-guardia', 'person', ['person:medico-guardia']],
  ['person-psicologa-orientadora', 'person', ['person:psicologa-orientadora']],
  ['person-trabajadora-social', 'person', ['person:trabajadora-social']],
  ['person-orientadora-juridica', 'person', ['person:orientadora-juridica']],
  ['person-madre-acompanante', 'person', ['person:madre-acompanante']],
  ['object_acceso_restringido', 'object', ['object:RES']],
  ['object_cierre', 'object', ['object:FIN']],
  ['object_expediente', 'object', ['object:EXP']],
  ['object_marco_normativo', 'object', ['object:LEY']],
  ['object_registro', 'object', ['object:REG']],
  ['tool_pap', 'tool', ['tool:PAP']],
  ['tool_reflection_journal', 'tool', ['tool:REFLECTION_JOURNAL']],
  ['tool_risk_meter', 'tool', ['tool:RISK_METER']],
  ['tool_safety_route', 'tool', ['tool:SAFETY_ROUTE']],
  ['tool_spikes', 'tool', ['tool:SPIKES']],
  ['door_consultorio', 'exit', ['exit:puerta-consultorio:front']],
  ['door_consultorio_side', 'exit', ['exit:puerta-consultorio:side']],
  ['door_recepcion', 'exit', ['exit:puerta-recepcion:front']],
  ['door_recepcion_side', 'exit', ['exit:puerta-recepcion:side']],
  ['door_sala_escucha', 'exit', ['exit:puerta-sala-escucha:front']],
  ['door_sala_escucha_side', 'exit', ['exit:puerta-sala-escucha:side']],
  ['door_salida_institucional', 'exit', ['exit:salida-institucional:front']],
  ['door_salida_institucional_side', 'exit', ['exit:salida-institucional:side']],
  ['door_urgencias', 'exit', ['exit:puerta-urgencias:front']],
  ['door_urgencias_side', 'exit', ['exit:puerta-urgencias:side']],
  ['signal-person', 'signal', ['signal:person']],
  ['signal-object', 'signal', ['signal:object']],
  ['signal-tool', 'signal', ['signal:tool']],
  ['signal-exit', 'signal', ['signal:exit']],
  ['prompt-interact', 'prompt', ['prompt:interact']],
  ['prompt-locked', 'prompt', ['prompt:locked']],
  ['prompt-keyboard', 'prompt', ['prompt:keyboard']],
  ['prompt-gamepad', 'prompt', ['prompt:gamepad']],
  ['hud-objective-frame', 'hud-frame', ['hud:objective-frame']],
  ['hud-inventory-frame', 'hud-frame', ['hud:inventory-frame']],
  ['interaction-prompt-frame', 'hud-frame', ['hud:interaction-prompt-frame']],
  ['dialogue-frame', 'hud-frame', ['hud:dialogue-frame']],
  ['choice-frame', 'hud-frame', ['hud:choice-frame']],
  ['journal-frame', 'hud-frame', ['hud:journal-frame']],
  ['icon-objective', 'hud-icon', ['hud-icon:objective']],
  ['icon-inventory', 'hud-icon', ['hud-icon:inventory']],
  ['icon-journal', 'hud-icon', ['hud-icon:journal']],
  ['icon-settings', 'hud-icon', ['hud-icon:settings']],
  ['icon-audio', 'hud-icon', ['hud-icon:audio']],
  ['icon-close', 'hud-icon', ['hud-icon:close']],
  ['icon-decision', 'hud-icon', ['hud-icon:decision']],
  ['icon-consequence', 'hud-icon', ['hud-icon:consequence']],
]);

const REQUIRED_MAP_CONTRACT = Object.freeze({
  'hospital-urgencias': ['hospital-urgencias', 'hospital-urgencias', 'game/scenarios/hospital-urgencias.json'],
  'hospital-sala-escucha': ['hospital-sala-escucha', 'hospital-sala-escucha', 'game/scenarios/hospital-sala-escucha.json'],
  'hospital-sala-accion': ['hospital-sala-escucha-accion', 'hospital-sala-escucha', 'game/scenarios/hospital-sala-escucha.json'],
  'hospital-sala-cierre': ['hospital-sala-escucha-cierre', 'hospital-sala-escucha', 'game/scenarios/hospital-sala-escucha.json'],
  'comisaria-recepcion': ['comisaria-recepcion', 'comisaria-recepcion', 'game/scenarios/comisaria-recepcion.json'],
  'comisaria-consultorio': ['comisaria-consultorio', 'comisaria-consultorio', 'game/scenarios/comisaria-consultorio.json'],
  'comisaria-marco': ['comisaria-consultorio-marco', 'comisaria-consultorio', 'game/scenarios/comisaria-consultorio.json'],
  'comisaria-cierre': ['comisaria-consultorio-cierre', 'comisaria-consultorio', 'game/scenarios/comisaria-consultorio.json'],
});

const REQUIRED_MAP_KEY_SET = new Set(REQUIRED_PREMIUM_MAP_KEYS);
const REQUIRED_CATEGORY_SET = new Set(REQUIRED_VISUAL_CATEGORIES);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const ID_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label}: expected object`);
}

function nonblank(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}: blank value`);
  return value.trim();
}

function identifier(value, label) {
  const id = nonblank(value, label);
  if (!ID_PATTERN.test(id)) throw new Error(`${label}: invalid id ${JSON.stringify(value)}`);
  return id;
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}: expected positive integer, received ${value}`);
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label}: expected nonnegative integer, received ${value}`);
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function prettyCanonical(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalHash(value) {
  return sha256(Buffer.from(canonicalStringify(value), 'utf8'));
}

function normalizeSrc(value) {
  return value.replaceAll('\\', '/');
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function safeRelativePath(value, label) {
  const relative = nonblank(value, label);
  if (path.isAbsolute(relative) || path.win32.isAbsolute(relative) || path.posix.isAbsolute(relative)) {
    throw new Error(`${label}: absolute path not allowed ${relative}`);
  }
  const segments = normalizeSrc(relative).split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label}: path escape not allowed ${relative}`);
  }
  return normalizeSrc(relative);
}

function resolveContained(root, relativePath, label) {
  const safe = safeRelativePath(relativePath, label);
  const resolvedRoot = path.resolve(root);
  if (!existsSync(resolvedRoot)) throw new Error(`${label}: root missing ${resolvedRoot}`);
  if (lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`${label}: symlink/junction/reparse root not allowed ${resolvedRoot}`);
  }
  const candidate = path.resolve(resolvedRoot, safe);
  if (!isContained(resolvedRoot, candidate)) throw new Error(`${label}: path escape outside root ${safe}`);
  if (!existsSync(candidate)) throw new Error(`${label}: missing/absent ${candidate}`);
  let current = resolvedRoot;
  for (const segment of safe.split('/')) {
    current = path.join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label}: symlink/junction/reparse path component not allowed ${safe}`);
    }
  }
  const realRoot = realpathSync(resolvedRoot);
  const realCandidate = realpathSync(candidate);
  if (!isContained(realRoot, realCandidate)) {
    throw new Error(`${label}: realpath/symlink escape outside root ${safe}`);
  }
  if (!lstatSync(realCandidate).isFile()) throw new Error(`${label}: not a file ${safe}`);
  return { absolutePath: realCandidate, src: safe };
}

function decodePng(bytes, label) {
  try {
    return PNG.sync.read(bytes, { checkCRC: true });
  } catch (error) {
    throw new Error(`${label}: invalid PNG (${error instanceof Error ? error.message : String(error)})`);
  }
}

function paletteColors(palette, label = 'palette') {
  assertObject(palette, label);
  if (palette.schemaVersion !== 1) throw new Error(`${label}: schemaVersion must be 1`);
  nonblank(palette.paletteId, `${label}.paletteId`);
  if (!Array.isArray(palette.masterColors) || palette.masterColors.length === 0) {
    throw new Error(`${label}.masterColors must be a nonempty array`);
  }
  const colors = new Set();
  for (const color of palette.masterColors) {
    if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
      throw new Error(`${label}: invalid palette color ${JSON.stringify(color)}`);
    }
    if (colors.has(color)) throw new Error(`${label}: duplicate palette color ${color}`);
    colors.add(color);
  }
  return colors;
}

function validateReviewStatus(value, label) {
  if (value !== 'unreviewed' && value !== 'candidate') {
    throw new Error(`${label}.reviewStatus must be unreviewed or candidate`);
  }
}

function validateBindings(bindings, label) {
  if (!Array.isArray(bindings) || bindings.length === 0) throw new Error(`${label}.bindings must be nonempty`);
  const seen = new Set();
  for (const binding of bindings) {
    const normalized = nonblank(binding, `${label}.bindings`);
    if (seen.has(normalized)) throw new Error(`${label}: duplicate binding ${normalized}`);
    seen.add(normalized);
  }
  return [...seen];
}

function validateCommonEntry(entry, label, { png = true } = {}) {
  assertObject(entry, label);
  identifier(entry.assetId, `${label}.assetId`);
  if (!REQUIRED_CATEGORY_SET.has(entry.category)) throw new Error(`${label}.category invalid: ${entry.category}`);
  safeRelativePath(entry.src, `${entry.assetId}.src`);
  safeRelativePath(entry.sourceAsset, `${entry.assetId}.sourceAsset`);
  nonblank(entry.license, `${entry.assetId}.license`);
  if (!Number.isInteger(entry.logicalScale) || entry.logicalScale < 1) {
    throw new Error(`${entry.assetId}.logicalScale must be an integer >= 1`);
  }
  nonblank(entry.paletteId, `${entry.assetId}.paletteId`);
  validateBindings(entry.bindings, entry.assetId);
  validateReviewStatus(entry.reviewStatus, entry.assetId);
  if (png) {
    assertObject(entry.expectedDimensions, `${entry.assetId}.expectedDimensions`);
    positiveInteger(entry.expectedDimensions.width, `${entry.assetId}.expectedDimensions.width`);
    positiveInteger(entry.expectedDimensions.height, `${entry.assetId}.expectedDimensions.height`);
    if (entry.tileGrid !== undefined) validateTileGrid(entry.tileGrid, entry.expectedDimensions, entry.assetId);
  }
}

function validateTileGrid(tileGrid, dimensions, label) {
  assertObject(tileGrid, `${label}.tileGrid`);
  const tileWidth = positiveInteger(tileGrid.tileWidth, `${label}.tileGrid.tileWidth`);
  const tileHeight = positiveInteger(tileGrid.tileHeight, `${label}.tileGrid.tileHeight`);
  const columns = positiveInteger(tileGrid.columns, `${label}.tileGrid.columns`);
  const rows = positiveInteger(tileGrid.rows, `${label}.tileGrid.rows`);
  if (
    dimensions.width % tileWidth !== 0 || dimensions.height % tileHeight !== 0
    || dimensions.width / tileWidth !== columns || dimensions.height / tileHeight !== rows
  ) {
    throw new Error(`${label}: image dimensions are not divisible by tile grid or columns/rows drift`);
  }
}

function inspectPngPixels(png, colors, label) {
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha !== 0 && alpha !== 255) throw new Error(`${label}: alpha must be binary, got ${alpha}`);
    if (alpha === 255) {
      const color = `#${png.data[offset].toString(16).padStart(2, '0')}${png.data[offset + 1].toString(16).padStart(2, '0')}${png.data[offset + 2].toString(16).padStart(2, '0')}`;
      if (!colors.has(color)) throw new Error(`${label}: color outside palette ${color}`);
    }
  }
}

export function inspectVisualPng({ assetsRoot, sourceRoot, entry, palette }) {
  const label = isPlainObject(entry) && typeof entry.assetId === 'string' ? entry.assetId : 'visual asset';
  validateCommonEntry(entry, label);
  const colors = paletteColors(palette, `${label}.palette`);
  if (entry.paletteId !== palette.paletteId) {
    throw new Error(`${label}: paletteId ${entry.paletteId} does not match ${palette.paletteId}`);
  }
  const output = resolveContained(assetsRoot, entry.src, `${label}.src`);
  const source = resolveContained(sourceRoot, entry.sourceAsset, `${label}.sourceAsset`);
  const outputBytes = readFileSync(output.absolutePath);
  const sourceBytes = readFileSync(source.absolutePath);
  const outputPng = decodePng(outputBytes, `${label}.src ${entry.src}`);
  const sourcePng = decodePng(sourceBytes, `${label}.sourceAsset ${entry.sourceAsset}`);
  const { width, height } = entry.expectedDimensions;
  if (outputPng.width !== width || outputPng.height !== height) {
    throw new Error(`${label}: dimensions ${outputPng.width}x${outputPng.height}; expected ${width}x${height}`);
  }
  inspectPngPixels(outputPng, colors, `${label}.src`);
  inspectPngPixels(sourcePng, colors, `${label}.sourceAsset`);
  if (entry.tileGrid !== undefined) validateTileGrid(entry.tileGrid, entry.expectedDimensions, label);
  return {
    assetId: entry.assetId,
    category: entry.category,
    src: normalizeSrc(entry.src),
    sourceAsset: normalizeSrc(entry.sourceAsset),
    license: entry.license,
    expectedDimensions: { ...entry.expectedDimensions },
    ...(entry.tileGrid === undefined ? {} : { tileGrid: { ...entry.tileGrid } }),
    logicalScale: entry.logicalScale,
    paletteId: entry.paletteId,
    bindings: [...entry.bindings],
    reviewStatus: entry.reviewStatus,
    sha256: sha256(outputBytes),
    sourceSha256: sha256(sourceBytes),
  };
}

function parseJsonBytes(bytes, label) {
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    assertObject(parsed, label);
    return parsed;
  } catch (error) {
    throw new Error(`${label}: invalid Tiled JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

function inventoryMap(inventoryBySrc) {
  if (!(inventoryBySrc instanceof Map)) throw new Error('inventoryBySrc must be a Map');
  return new Map([...inventoryBySrc.entries()].map(([src, entry]) => [normalizeSrc(src), entry]));
}

function relativeFromOwner(ownerSrc, referencedPath, label) {
  const reference = nonblank(referencedPath, label);
  if (path.isAbsolute(reference) || path.win32.isAbsolute(reference) || path.posix.isAbsolute(reference)) {
    throw new Error(`${label}: absolute transitive path not allowed ${reference}`);
  }
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(normalizeSrc(ownerSrc)), normalizeSrc(reference)));
  if (joined === '..' || joined.startsWith('../') || path.posix.isAbsolute(joined)) {
    throw new Error(`${label}: transitive path escape ${reference}`);
  }
  return joined;
}

function validateNoFractionalOrFiltering(value, label) {
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'smoothing' && nested !== false) {
      throw new Error(`${label}.${key}: smoothing is forbidden; use nearest`);
    }
    if ((normalizedKey === 'filter' || normalizedKey === 'filtering') && String(nested).toLowerCase() === 'linear') {
      throw new Error(`${label}.${key}: linear filtering is forbidden; use nearest`);
    }
    if (
      ['margin', 'spacing', 'offsetx', 'offsety', 'x', 'y'].includes(normalizedKey)
      && typeof nested === 'number' && !Number.isInteger(nested)
    ) {
      throw new Error(`${label}.${key}: fractional offset/margin/spacing forbidden`);
    }
    if (['scale', 'scalex', 'scaley'].includes(normalizedKey) && nested !== undefined) {
      if (!Number.isInteger(nested) || nested < 1) throw new Error(`${label}.${key}: scale must be integer >= 1`);
    }
    if (isPlainObject(nested)) validateNoFractionalOrFiltering(nested, `${label}.${key}`);
    if (Array.isArray(nested)) {
      nested.forEach((item, index) => {
        if (isPlainObject(item)) validateNoFractionalOrFiltering(item, `${label}.${key}[${index}]`);
      });
    }
  }
}

function validateTilesetShape(tileset, label) {
  assertObject(tileset, label);
  const tileWidth = positiveInteger(tileset.tilewidth, `${label}.tilewidth`);
  const tileHeight = positiveInteger(tileset.tileheight, `${label}.tileheight`);
  const columns = positiveInteger(tileset.columns, `${label}.columns`);
  const tileCount = positiveInteger(tileset.tilecount, `${label}.tilecount`);
  const margin = tileset.margin === undefined ? 0 : nonnegativeInteger(tileset.margin, `${label}.margin`);
  const spacing = tileset.spacing === undefined ? 0 : nonnegativeInteger(tileset.spacing, `${label}.spacing`);
  if (tileset.tileoffset !== undefined) {
    assertObject(tileset.tileoffset, `${label}.tileoffset`);
    if (!Number.isInteger(tileset.tileoffset.x ?? 0) || !Number.isInteger(tileset.tileoffset.y ?? 0)) {
      throw new Error(`${label}.tileoffset: fractional offset forbidden`);
    }
  }
  validateNoFractionalOrFiltering(tileset, label);
  return { tileWidth, tileHeight, columns, tileCount, margin, spacing };
}

function addTransitiveFile({ assetsRoot, src, label, expectedInventory, transitive }) {
  const inventoried = expectedInventory.get(src);
  if (!inventoried) throw new Error(`${label}: ${src} is not inventoried`);
  const resolved = resolveContained(assetsRoot, src, `${label} ${src}`);
  const bytes = readFileSync(resolved.absolutePath);
  transitive.set(src, { src, sha256: sha256(bytes) });
  return { bytes, inventoried };
}

function validateTilesetImage({ assetsRoot, ownerSrc, imagePath, tileset, shape, label, expectedInventory, transitive }) {
  const imageSrc = relativeFromOwner(ownerSrc, imagePath, `${label}.image`);
  const { bytes, inventoried } = addTransitiveFile({
    assetsRoot,
    src: imageSrc,
    label: `${label}.image`,
    expectedInventory,
    transitive,
  });
  if (inventoried.category !== 'tileset') throw new Error(`${label}.image ${imageSrc}: inventory category must be tileset`);
  const png = decodePng(bytes, `${label}.image ${imageSrc}`);
  const usableWidth = png.width - shape.margin * 2 + shape.spacing;
  const usableHeight = png.height - shape.margin * 2 + shape.spacing;
  if (usableWidth <= 0 || usableHeight <= 0
    || usableWidth % (shape.tileWidth + shape.spacing) !== 0
    || usableHeight % (shape.tileHeight + shape.spacing) !== 0) {
    throw new Error(`${label}.image ${imageSrc}: PNG margin/spacing geometry invalid`);
  }
  if (tileset.imagewidth !== undefined && tileset.imagewidth !== png.width) {
    throw new Error(`${label}.imagewidth ${tileset.imagewidth} does not match PNG ${png.width}`);
  }
  if (tileset.imageheight !== undefined && tileset.imageheight !== png.height) {
    throw new Error(`${label}.imageheight ${tileset.imageheight} does not match PNG ${png.height}`);
  }
  const actualColumns = usableWidth / (shape.tileWidth + shape.spacing);
  const actualRows = usableHeight / (shape.tileHeight + shape.spacing);
  if (shape.columns !== actualColumns || shape.tileCount > actualColumns * actualRows) {
    throw new Error(`${label}: columns/tilecount exceed PNG geometry`);
  }
}

function tileImages(tileset) {
  const images = [];
  if (typeof tileset.image === 'string') images.push(tileset.image);
  if (Array.isArray(tileset.tiles)) {
    for (const tile of tileset.tiles) {
      if (isPlainObject(tile) && typeof tile.image === 'string') images.push(tile.image);
    }
  }
  return images;
}

function layerImages(layers, output = []) {
  if (!Array.isArray(layers)) return output;
  for (const layer of layers) {
    if (!isPlainObject(layer)) continue;
    if (layer.type === 'imagelayer' && typeof layer.image === 'string') output.push({ layer, image: layer.image });
    if (Array.isArray(layer.layers)) layerImages(layer.layers, output);
  }
  return output;
}

function validateLayers(layers, mapWidth, mapHeight, label, gidRanges) {
  if (!Array.isArray(layers)) throw new Error(`${label}.layers must be an array`);
  const visit = (layerList, ownerLabel) => {
    for (const [index, layer] of layerList.entries()) {
      const layerLabel = `${ownerLabel}[${index}]`;
      assertObject(layer, layerLabel);
      validateNoFractionalOrFiltering(layer, layerLabel);
      if (layer.type === 'tilelayer') {
        const width = positiveInteger(layer.width ?? mapWidth, `${layerLabel}.width`);
        const height = positiveInteger(layer.height ?? mapHeight, `${layerLabel}.height`);
        if (!Array.isArray(layer.data) || layer.data.length !== width * height) {
          throw new Error(`${layerLabel}.data length does not match tile geometry`);
        }
        for (const gid of layer.data) {
          if (!Number.isInteger(gid) || gid < 0 || gid > 0xffffffff) throw new Error(`${layerLabel}: invalid gid ${gid}`);
          if (gid === 0) continue;
          const baseGid = (gid >>> 0) & 0x0fffffff;
          if (!gidRanges.some(({ first, last }) => baseGid >= first && baseGid <= last)) {
            throw new Error(`${layerLabel}: gid ${baseGid} outside tileset range`);
          }
        }
      }
      if (Array.isArray(layer.layers)) visit(layer.layers, `${layerLabel}.layers`);
    }
  };
  visit(layers, `${label}.layers`);
}

export function inspectTiledMap({ assetsRoot, mapEntry, inventoryBySrc }) {
  const label = isPlainObject(mapEntry) && typeof mapEntry.assetId === 'string' ? mapEntry.assetId : 'Tiled map';
  validateCommonEntry(mapEntry, label);
  const mapKey = identifier(mapEntry.mapKey, `${label}.mapKey`);
  const expectedInventory = inventoryMap(inventoryBySrc);
  const mapResolved = resolveContained(assetsRoot, mapEntry.src, `${label}.src`);
  const mapBytes = readFileSync(mapResolved.absolutePath);
  const map = parseJsonBytes(mapBytes, `${label} Tiled JSON`);
  if (map.type !== 'map') throw new Error(`${label}: Tiled type must be map`);
  const width = positiveInteger(map.width, `${label}.width`);
  const height = positiveInteger(map.height, `${label}.height`);
  const tileWidth = positiveInteger(map.tilewidth, `${label}.tilewidth`);
  const tileHeight = positiveInteger(map.tileheight, `${label}.tileheight`);
  validateNoFractionalOrFiltering(map, label);
  if (mapEntry.expectedDimensions !== undefined) {
    if (mapEntry.expectedDimensions.width !== width * tileWidth || mapEntry.expectedDimensions.height !== height * tileHeight) {
      throw new Error(`${label}: expected dimensions do not match Tiled geometry`);
    }
  }
  if (mapEntry.tileGrid !== undefined) {
    const expected = {
      tileWidth,
      tileHeight,
      columns: width,
      rows: height,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (mapEntry.tileGrid[key] !== value) throw new Error(`${label}.tileGrid.${key} does not match Tiled JSON`);
    }
  }
  if (!Array.isArray(map.tilesets) || map.tilesets.length === 0) throw new Error(`${label}.tilesets must be nonempty`);

  const transitive = new Map([[normalizeSrc(mapEntry.src), {
    src: normalizeSrc(mapEntry.src),
    sha256: sha256(mapBytes),
  }]]);
  const gidRanges = [];
  for (const [index, reference] of map.tilesets.entries()) {
    const referenceLabel = `${label}.tilesets[${index}]`;
    assertObject(reference, referenceLabel);
    const firstgid = positiveInteger(reference.firstgid, `${referenceLabel}.firstgid`);
    let tileset = reference;
    let ownerSrc = normalizeSrc(mapEntry.src);
    if (typeof reference.source === 'string') {
      const tilesetSrc = relativeFromOwner(mapEntry.src, reference.source, `${referenceLabel}.source`);
      const external = addTransitiveFile({
        assetsRoot,
        src: tilesetSrc,
        label: `${referenceLabel}.source`,
        expectedInventory,
        transitive,
      });
      tileset = parseJsonBytes(external.bytes, `${referenceLabel}.source ${tilesetSrc}`);
      if (tileset.type !== 'tileset') throw new Error(`${referenceLabel}.source ${tilesetSrc}: type must be tileset`);
      ownerSrc = tilesetSrc;
    }
    const shape = validateTilesetShape(tileset, referenceLabel);
    gidRanges.push({ first: firstgid, last: firstgid + shape.tileCount - 1 });
    const images = tileImages(tileset);
    if (images.length === 0) throw new Error(`${referenceLabel}: tileset has no transitive image`);
    for (const imagePath of images) {
      validateTilesetImage({
        assetsRoot,
        ownerSrc,
        imagePath,
        tileset,
        shape,
        label: referenceLabel,
        expectedInventory,
        transitive,
      });
    }
  }
  gidRanges.sort((left, right) => left.first - right.first);
  for (let index = 1; index < gidRanges.length; index += 1) {
    if (gidRanges[index].first <= gidRanges[index - 1].last) throw new Error(`${label}: overlapping tileset gid range`);
  }
  validateLayers(map.layers, width, height, label, gidRanges);
  for (const { image } of layerImages(map.layers)) {
    const imageSrc = relativeFromOwner(mapEntry.src, image, `${label}.imagelayer`);
    const imageFile = addTransitiveFile({
      assetsRoot,
      src: imageSrc,
      label: `${label}.imagelayer`,
      expectedInventory,
      transitive,
    });
    decodePng(imageFile.bytes, `${label}.imagelayer ${imageSrc}`);
  }
  return {
    mapKey,
    src: normalizeSrc(mapEntry.src),
    width,
    height,
    tileWidth,
    tileHeight,
    pixelWidth: width * tileWidth,
    pixelHeight: height * tileHeight,
    transitive: [...transitive.values()].sort((left, right) => left.src.localeCompare(right.src)),
  };
}

function validateMapBindings(mapBindings) {
  assertObject(mapBindings, 'inventory.mapBindings');
  const actual = Object.keys(mapBindings);
  for (const mapKey of REQUIRED_PREMIUM_MAP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(mapBindings, mapKey)) {
      throw new Error(`premium map key ${mapKey} missing`);
    }
    nonblank(mapBindings[mapKey], `inventory.mapBindings.${mapKey}`);
  }
  for (const mapKey of actual) {
    if (!REQUIRED_MAP_KEY_SET.has(mapKey)) throw new Error(`extra premium map key ${mapKey}`);
  }
}

function validateUniqueMetadata(inventory) {
  const allEntries = [...inventory.maps, ...inventory.assets, ...inventory.tiledResources];
  const ids = new Set();
  const sources = new Set();
  const bindings = new Set();
  for (const entry of allEntries) {
    const id = nonblank(entry.assetId, 'assetId');
    if (ids.has(id)) throw new Error(`duplicate assetId ${id}`);
    ids.add(id);
    const src = normalizeSrc(nonblank(entry.src, `${id}.src`));
    if (sources.has(src)) throw new Error(`duplicate src ${src}`);
    sources.add(src);
    for (const binding of validateBindings(entry.bindings, id)) {
      if (bindings.has(binding)) throw new Error(`duplicate binding ${binding}`);
      bindings.add(binding);
    }
  }
}

function validateExactPremiumVisualContract(inventory) {
  if (inventory.assets.length !== REQUIRED_VISUAL_ASSET_CONTRACT.length) {
    throw new Error(`premium visual v1 contract requires exactly ${REQUIRED_VISUAL_ASSET_CONTRACT.length} assets; received ${inventory.assets.length}`);
  }
  const assetsById = new Map(inventory.assets.map((entry) => [entry.assetId, entry]));
  for (const [assetId, category, bindings] of REQUIRED_VISUAL_ASSET_CONTRACT) {
    const entry = assetsById.get(assetId);
    if (!entry) throw new Error(`premium visual v1 contract required asset missing: ${assetId}`);
    if (entry.category !== category) {
      throw new Error(`premium visual v1 contract ${assetId}: category must be ${category}`);
    }
    if (canonicalStringify(entry.bindings) !== canonicalStringify(bindings)) {
      throw new Error(`premium visual v1 contract ${assetId}: bindings drift`);
    }
  }

  const mapsByKey = new Map(inventory.maps.map((entry) => [entry.mapKey, entry]));
  for (const [mapKey, [backendMapKey, binding, scenarioConfig]] of Object.entries(REQUIRED_MAP_CONTRACT)) {
    const entry = mapsByKey.get(mapKey);
    if (!entry) throw new Error(`premium map contract missing ${mapKey}`);
    if (entry.backendMapKey !== backendMapKey) {
      throw new Error(`premium map contract ${mapKey}: backendMapKey must be ${backendMapKey}`);
    }
    if (entry.binding !== binding || inventory.mapBindings[mapKey] !== binding) {
      throw new Error(`premium map contract ${mapKey}: runtime binding must be ${binding}`);
    }
    if (normalizeSrc(entry.scenarioConfig) !== scenarioConfig) {
      throw new Error(`premium map contract ${mapKey}: scenarioConfig must be ${scenarioConfig}`);
    }
  }
}

export function validatePremiumVisualInventory(inventory) {
  assertObject(inventory, 'inventory');
  if (inventory.schemaVersion !== 1) throw new Error(`inventory schemaVersion must be 1`);
  if (inventory.status !== 'unreviewed' && inventory.status !== 'candidate') {
    throw new Error('inventory.status must be unreviewed or candidate');
  }
  validateMapBindings(inventory.mapBindings);
  if (!Array.isArray(inventory.maps)) throw new Error('inventory.maps must be an array');
  if (!Array.isArray(inventory.assets)) throw new Error('inventory.assets must be an array');
  if (!Array.isArray(inventory.tiledResources)) throw new Error('inventory.tiledResources must be an array');
  const mapKeys = new Set();
  for (const entry of inventory.maps) {
    validateCommonEntry(entry, `map ${entry?.assetId ?? '?'}`);
    const mapKey = identifier(entry.mapKey, `${entry.assetId}.mapKey`);
    if (mapKeys.has(mapKey)) throw new Error(`duplicate map key ${mapKey}`);
    mapKeys.add(mapKey);
    if (!REQUIRED_MAP_KEY_SET.has(mapKey)) throw new Error(`extra premium map key ${mapKey}`);
    if (entry.binding !== inventory.mapBindings[mapKey]) throw new Error(`${entry.assetId}: binding drift for ${mapKey}`);
    safeRelativePath(entry.scenarioConfig, `${entry.assetId}.scenarioConfig`);
  }
  for (const mapKey of REQUIRED_PREMIUM_MAP_KEYS) {
    if (!mapKeys.has(mapKey)) throw new Error(`premium map key ${mapKey} missing from inventory.maps`);
  }
  const presentCategories = new Set();
  for (const entry of inventory.assets) {
    validateCommonEntry(entry, `asset ${entry?.assetId ?? '?'}`);
    presentCategories.add(entry.category);
  }
  for (const category of REQUIRED_VISUAL_CATEGORIES) {
    if (!presentCategories.has(category)) throw new Error(`required visual category ${category} missing`);
  }
  for (const entry of inventory.tiledResources) {
    validateCommonEntry(entry, `tiled resource ${entry?.assetId ?? '?'}`, { png: false });
    if (entry.category !== 'tileset') throw new Error(`${entry.assetId}: tiled resource category must be tileset`);
  }
  validateUniqueMetadata(inventory);
  validateExactPremiumVisualContract(inventory);
}

function inspectJsonResource({ assetsRoot, sourceRoot, entry }) {
  const output = resolveContained(assetsRoot, entry.src, `${entry.assetId}.src`);
  const source = resolveContained(sourceRoot, entry.sourceAsset, `${entry.assetId}.sourceAsset`);
  const outputBytes = readFileSync(output.absolutePath);
  const sourceBytes = readFileSync(source.absolutePath);
  parseJsonBytes(outputBytes, `${entry.assetId}.src`);
  parseJsonBytes(sourceBytes, `${entry.assetId}.sourceAsset`);
  return {
    ...canonicalize(entry),
    src: normalizeSrc(entry.src),
    sourceAsset: normalizeSrc(entry.sourceAsset),
    sha256: sha256(outputBytes),
    sourceSha256: sha256(sourceBytes),
  };
}

export function inspectScenarioConfig({ assetsRoot, mapEntry }) {
  const scenario = resolveContained(assetsRoot, mapEntry.scenarioConfig, `${mapEntry.assetId}.scenarioConfig`);
  const bytes = readFileSync(scenario.absolutePath);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${mapEntry.assetId}.scenarioConfig: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!isPlainObject(parsed)) throw new Error(`${mapEntry.assetId}.scenarioConfig: root must be an object`);
  if (parsed.scenarioKey !== mapEntry.binding) {
    throw new Error(`${mapEntry.assetId}.scenarioConfig.scenarioKey must match runtime binding ${mapEntry.binding}`);
  }
  if (parsed.startRoomKey !== mapEntry.binding) {
    throw new Error(`${mapEntry.assetId}.scenarioConfig.startRoomKey must match runtime binding ${mapEntry.binding}`);
  }
  if (!Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    throw new Error(`${mapEntry.assetId}.scenarioConfig.rooms must be a nonempty array`);
  }
  const rootRoom = parsed.rooms.find((room) => isPlainObject(room) && room.key === mapEntry.binding);
  if (!rootRoom || rootRoom.tiledMapKey !== mapEntry.binding) {
    throw new Error(`${mapEntry.assetId}.scenarioConfig room must bind ${mapEntry.binding} to its tiledMapKey`);
  }
  return { scenarioSha256: sha256(bytes), scenario: parsed };
}

export function inspectPremiumMapSelection({ assetsRoot, sourceRoot, inventory, palettes, mapKey }) {
  validatePremiumVisualInventory(inventory);
  if (!Array.isArray(palettes) || palettes.length === 0) throw new Error('palettes must be a nonempty array');
  const paletteById = new Map();
  for (const palette of palettes) {
    assertObject(palette, 'palette');
    nonblank(palette.paletteId, 'palette.paletteId');
    if (paletteById.has(palette.paletteId)) throw new Error(`duplicate paletteId: ${palette.paletteId}`);
    paletteById.set(palette.paletteId, palette);
  }
  const selectedMapKey = nonblank(mapKey, 'mapKey');
  const matches = inventory.maps.filter(({ mapKey: premiumMapKey, backendMapKey }) => (
    premiumMapKey === selectedMapKey || backendMapKey === selectedMapKey
  ));
  if (matches.length !== 1) throw new Error(`mapKey unknown or ambiguous: ${selectedMapKey}`);
  const entry = matches[0];
  const { scenarioSha256, scenario } = inspectScenarioConfig({ assetsRoot, mapEntry: entry });
  const inspectedMap = inspectJsonResource({ assetsRoot, sourceRoot, entry });
  const assetBySrc = new Map(inventory.assets.map((assetEntry) => [normalizeSrc(assetEntry.src), assetEntry]));
  const resourceBySrc = new Map(inventory.tiledResources.map((resourceEntry) => [normalizeSrc(resourceEntry.src), resourceEntry]));
  const inventoryBySrc = new Map([...assetBySrc, ...resourceBySrc]);
  const tiled = inspectTiledMap({ assetsRoot, mapEntry: entry, inventoryBySrc });
  const inspectedTransitive = [];
  for (const { src } of tiled.transitive) {
    if (src === normalizeSrc(entry.src)) continue;
    const assetEntry = assetBySrc.get(src);
    if (assetEntry) {
      const palette = paletteById.get(assetEntry.paletteId);
      if (!palette) throw new Error(`${assetEntry.assetId}: unknown paletteId ${assetEntry.paletteId}`);
      inspectedTransitive.push(inspectVisualPng({ assetsRoot, sourceRoot, entry: assetEntry, palette }));
      continue;
    }
    const resourceEntry = resourceBySrc.get(src);
    if (!resourceEntry) throw new Error(`${entry.assetId}: transitive resource not inventoried ${src}`);
    inspectedTransitive.push(inspectJsonResource({ assetsRoot, sourceRoot, entry: resourceEntry }));
  }
  return {
    entry,
    scenario,
    scenarioSha256,
    sourceSha256: inspectedMap.sourceSha256,
    tiled,
    inspectedTransitive,
  };
}

function visualReadme(manifest) {
  const lines = [
    '# Premium Visual Asset Manifest v1',
    '',
    `Manifest hash: \`${manifest.manifestHash}\``,
    `Status: \`${manifest.status}\``,
    '',
    '## Maps',
    '',
  ];
  for (const entry of manifest.maps) {
    lines.push(`- \`${entry.mapKey}\` -> \`${entry.binding}\`: \`${entry.contentHash}\``);
  }
  lines.push('', '## Assets', '');
  for (const entry of manifest.assets) lines.push(`- \`${entry.assetId}\` (${entry.category}): \`${entry.sha256}\``);
  if (manifest.tiledResources.length > 0) {
    lines.push('', '## External Tiled resources', '');
    for (const entry of manifest.tiledResources) lines.push(`- \`${entry.assetId}\`: \`${entry.sha256}\``);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function buildPremiumVisualManifest({
  assetsRoot,
  sourceRoot,
  inventory,
  palettes,
  requireCandidate = true,
}) {
  validatePremiumVisualInventory(inventory);
  if (!Array.isArray(palettes) || palettes.length === 0) throw new Error('palettes must be a nonempty array');
  const paletteById = new Map();
  for (const [index, palette] of palettes.entries()) {
    paletteColors(palette, `palettes[${index}]`);
    if (paletteById.has(palette.paletteId)) throw new Error(`duplicate paletteId ${palette.paletteId}`);
    paletteById.set(palette.paletteId, palette);
  }

  if (requireCandidate) {
    const unreviewed = [
      ...inventory.maps,
      ...inventory.assets,
      ...inventory.tiledResources,
    ].filter(({ reviewStatus }) => reviewStatus !== 'candidate').map(({ assetId }) => assetId);
    if (inventory.status !== 'candidate' || unreviewed.length > 0) {
      throw new Error(`candidate gate failed; unreviewed assetIds: ${unreviewed.join(', ') || '(inventory status)'}`);
    }
  }

  const inspectedAssets = inventory.assets.map((entry) => {
    const palette = paletteById.get(entry.paletteId);
    if (!palette) throw new Error(`${entry.assetId}: unknown paletteId ${entry.paletteId}`);
    return inspectVisualPng({ assetsRoot, sourceRoot, entry, palette });
  }).sort((left, right) => left.assetId.localeCompare(right.assetId));
  const inspectedResources = inventory.tiledResources.map((entry) => {
    if (!paletteById.has(entry.paletteId)) throw new Error(`${entry.assetId}: unknown paletteId ${entry.paletteId}`);
    return inspectJsonResource({ assetsRoot, sourceRoot, entry });
  }).sort((left, right) => left.assetId.localeCompare(right.assetId));

  const inventoryBySrc = new Map([
    ...inventory.assets.map((entry) => [normalizeSrc(entry.src), entry]),
    ...inventory.tiledResources.map((entry) => [normalizeSrc(entry.src), entry]),
  ]);
  const inspectedMaps = inventory.maps.map((entry) => {
    if (!paletteById.has(entry.paletteId)) throw new Error(`${entry.assetId}: unknown paletteId ${entry.paletteId}`);
    const tiled = inspectTiledMap({ assetsRoot, mapEntry: entry, inventoryBySrc });
    const source = resolveContained(sourceRoot, entry.sourceAsset, `${entry.assetId}.sourceAsset`);
    const sourceSha256 = sha256(readFileSync(source.absolutePath));
    const { scenarioSha256 } = inspectScenarioConfig({ assetsRoot, mapEntry: entry });
    const body = {
      ...canonicalize(entry),
      src: normalizeSrc(entry.src),
      sourceAsset: normalizeSrc(entry.sourceAsset),
      scenarioConfig: normalizeSrc(entry.scenarioConfig),
      sourceSha256,
      scenarioSha256,
      ...tiled,
    };
    return { ...body, contentHash: canonicalHash(body) };
  }).sort((left, right) => left.mapKey.localeCompare(right.mapKey));

  const manifestBody = {
    schemaVersion: 1,
    status: inventory.status,
    mapBindings: canonicalize(inventory.mapBindings),
    palettes: [...paletteById.values()].map((palette) => ({
      paletteId: palette.paletteId,
      sha256: canonicalHash(palette),
    })).sort((left, right) => left.paletteId.localeCompare(right.paletteId)),
    maps: inspectedMaps,
    assets: inspectedAssets,
    tiledResources: inspectedResources,
  };
  const manifest = { ...manifestBody, manifestHash: canonicalHash(manifestBody) };
  return {
    manifest,
    manifestJson: prettyCanonical(manifest),
    readme: visualReadme(manifest),
  };
}

/** El artefacto derivado (manifiesto, README) debe existir y coincidir byte a byte con lo que se genera hoy. */
export function assertDerivedArtifact(filePath, expectedBytes, label = path.basename(filePath)) {
  if (!existsSync(filePath)) throw new Error(`${label}: derived artifact missing ${filePath}`);
  const actual = readFileSync(filePath);
  const expected = Buffer.isBuffer(expectedBytes) ? expectedBytes : Buffer.from(expectedBytes, 'utf8');
  if (!actual.equals(expected)) throw new Error(`${label}: derived artifact drift en ${filePath}`);
}

export function parsePremiumVisualCliArgs(args) {
  if (!Array.isArray(args) || args.length === 0) throw new Error('visual validator requires one mode argument');
  let parsed;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (parsed !== undefined) throw new Error(`visual validator modes are mutually exclusive: ${args.join(' ')}`);
    if (argument === '--write' || argument === '--check') {
      parsed = { mode: argument.slice(2) };
      continue;
    }
    if (argument === '--asset' || argument === '--map') {
      const value = args[index + 1];
      if (typeof value !== 'string' || value.startsWith('--') || value.trim() === '') {
        throw new Error(`${argument} requires a value`);
      }
      parsed = argument === '--asset'
        ? { mode: 'asset', assetId: value }
        : { mode: 'map', mapKey: value };
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${argument}`);
  }
  return parsed;
}
