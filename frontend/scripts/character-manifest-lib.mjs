import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

import { PNG } from 'pngjs';

export const SHEET_SPECS = Object.freeze({
  idle: Object.freeze({ width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 }),
  walk: Object.freeze({ width: 288, height: 288, frameWidth: 48, frameHeight: 72, columns: 6, rows: 4 }),
  talk: Object.freeze({ width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 }),
  interact: Object.freeze({ width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 }),
  turn: Object.freeze({ width: 144, height: 288, frameWidth: 48, frameHeight: 72, columns: 3, rows: 4 }),
  react: Object.freeze({ width: 192, height: 1152, frameWidth: 48, frameHeight: 72, columns: 4, rows: 16 }),
  portrait: Object.freeze({ width: 384, height: 768, frameWidth: 96, frameHeight: 96, columns: 4, rows: 8 }),
});

export const PORTRAIT_STATES = Object.freeze([
  'neutral',
  'focused',
  'concerned',
  'relieved',
  'relief',
  'steady',
  'tension',
  'rupture',
]);

const CHARACTER_SHEET_IDS = Object.freeze(['idle', 'walk', 'talk', 'interact', 'turn', 'react']);
const PORTRAIT_STATE_SET = new Set(PORTRAIT_STATES);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const REQUIRED_OUTLINE = '#15131d';
const RIG_AXIS_X = 24;
const BODY_BAND_RULES = Object.freeze({
  head: Object.freeze({
    offsetTop: 0,
    offsetBottom: 17,
    minWidth: 18,
    maxWidth: 21,
    minConsecutiveRows: 6,
    minTotalRows: 8,
  }),
  shoulder: Object.freeze({
    offsetTop: 18,
    offsetBottom: 27,
    minWidth: 20,
    maxWidth: 27,
    minConsecutiveRows: 3,
    minTotalRows: 4,
  }),
});
const SECONDARY_COMPONENT_RULES = Object.freeze({
  minArea: 4,
  maxArea: 32,
  maxComponents: 2,
  maxTotalArea: 48,
  maxChebyshevDistance: 3,
  minBodyTopOffset: 12,
  maxBodyBottomOffset: 4,
});

const AUTHORITY_HASHES = Object.freeze({
  palette: '540a68a50ebb5ff2a65dbb9680ef6b5eb292935d5afe5be11711172e59792707',
  roster: '8f25953314817c8651dc6f72b86a9d7bd128cef638e75d5571bdd244f24019e9',
  actorRoster: 'e03056c8f50ccef8c3caa3b759c382ddf1372e53bc89ec522ccba5bea13ae998',
  clinicalEmotionMap: '7c8cc5f81a703f3c8c0e52f3fbfa9d7a0b6c88d5a145fb56ec0d56ec2c9afd6a',
});

const CONSEQUENCE_REACTIONS = Object.freeze({
  relief: Object.freeze({ animationId: 'reactRelief', portraitState: 'relief' }),
  steady: Object.freeze({ animationId: 'reactSteady', portraitState: 'steady' }),
  tension: Object.freeze({ animationId: 'reactTension', portraitState: 'tension' }),
  rupture: Object.freeze({ animationId: 'reactRupture', portraitState: 'rupture' }),
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label}: se esperaba un objeto`);
}

function assertExactKeys(value, allowedKeys, label) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}: campo desconocido ${key}`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`${label}: falta ${key}`);
  }
}

function assertNonblank(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}: valor vacío`);
  return value.trim();
}

function assertId(value, label) {
  const id = assertNonblank(value, label);
  if (!ID_PATTERN.test(id)) throw new Error(`${label}: id inválido ${JSON.stringify(value)}`);
  return id;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalPretty(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashCanonical(value) {
  return sha256(Buffer.from(canonicalStringify(value), 'utf8'));
}

function normalizeAuthorityPaths(value) {
  if (Array.isArray(value)) return value.map(normalizeAuthorityPaths);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === 'sourceAsset' && typeof item === 'string'
      ? item.replaceAll('\\', '/')
      : normalizeAuthorityPaths(item),
  ]));
}

function assertExactAuthority(value, expectedHash, label, { normalizePaths = false } = {}) {
  const authorityValue = normalizePaths ? normalizeAuthorityPaths(value) : value;
  if (hashCanonical(authorityValue) !== expectedHash) {
    throw new Error(`${label}: exact authority contract drift`);
  }
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertRelativePath(relativePath, label) {
  const value = assertNonblank(relativePath, label);
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new Error(`${label}: ruta absoluta no permitida ${value}`);
  }
  const segments = value.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label}: path escape no permitido ${value}`);
  }
  return segments.join('/');
}

function resolveRealContained(root, relativePath, label) {
  const safeRelative = assertRelativePath(relativePath, label);
  const resolvedRoot = path.resolve(root);
  if (!existsSync(resolvedRoot)) throw new Error(`${label}: root no existe ${resolvedRoot}`);
  if (lstatSync(resolvedRoot).isSymbolicLink()) {
    throw new Error(`${label}: symlink/junction/reparse root no permitido ${resolvedRoot}`);
  }
  const realRoot = realpathSync(resolvedRoot);
  const candidate = path.resolve(resolvedRoot, safeRelative);
  if (!isContained(resolvedRoot, candidate)) throw new Error(`${label}: path escape fuera de root ${safeRelative}`);
  if (!existsSync(candidate)) throw new Error(`${label}: source missing ${candidate}`);
  let current = resolvedRoot;
  for (const segment of safeRelative.split('/')) {
    current = path.join(current, segment);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label}: symlink/junction/reparse path component no permitido ${safeRelative}`);
    }
  }
  const realCandidate = realpathSync(candidate);
  if (!isContained(realRoot, realCandidate)) {
    throw new Error(`${label}: realpath/symlink fuera de root ${safeRelative}`);
  }
  if (!lstatSync(realCandidate).isFile()) throw new Error(`${label}: no es un archivo ${safeRelative}`);
  return realCandidate;
}

function decodePng(bytes, label) {
  try {
    return PNG.sync.read(bytes, { checkCRC: true });
  } catch (error) {
    throw new Error(`${label}: PNG inválido (${error instanceof Error ? error.message : String(error)})`);
  }
}

function validatePalette(palette) {
  assertPlainObject(palette, 'palette');
  assertExactKeys(palette, ['schemaVersion', 'paletteId', 'outline', 'masterColors'], 'palette');
  if (palette.schemaVersion !== 1) throw new Error(`palette schemaVersion inválido: ${palette.schemaVersion}`);
  assertNonblank(palette.paletteId, 'palette.paletteId');
  if (palette.outline !== REQUIRED_OUTLINE) {
    throw new Error(`palette.outline debe ser ${REQUIRED_OUTLINE}`);
  }
  if (!Array.isArray(palette.masterColors) || palette.masterColors.length === 0) {
    throw new Error('palette.masterColors debe ser un arreglo no vacío');
  }
  const seen = new Set();
  for (const color of palette.masterColors) {
    if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
      throw new Error(`palette.masterColors contiene color inválido ${JSON.stringify(color)}`);
    }
    if (seen.has(color)) throw new Error(`palette.masterColors contiene color duplicado ${color}`);
    seen.add(color);
  }
  if (!seen.has(palette.outline)) throw new Error('palette.masterColors no contiene outline');
  assertExactAuthority(palette, AUTHORITY_HASHES.palette, 'palette');
  return seen;
}

function validateProvenance(provenance, ownerId, provenanceRoot) {
  const label = `${ownerId}.provenance`;
  assertPlainObject(provenance, label);
  assertExactKeys(provenance, ['source', 'license', 'sourceAsset'], label);
  const source = assertNonblank(provenance.source, `${ownerId}.source`);
  const license = assertNonblank(provenance.license, `${ownerId}.license`);
  const sourceAsset = assertRelativePath(provenance.sourceAsset, `${ownerId}.sourceAsset`);
  const sourcePath = resolveRealContained(provenanceRoot, sourceAsset, `${ownerId}.sourceAsset`);
  const bytes = readFileSync(sourcePath);
  decodePng(bytes, `${ownerId}.sourceAsset ${sourceAsset}`);
  return { source, license, sourceAsset, sourceSha256: sha256(bytes) };
}

function validateRoster(roster, provenanceRoot) {
  assertPlainObject(roster, 'roster');
  assertExactKeys(roster, ['schemaVersion', 'manifestVersion', 'defaultCharacterId', 'identities'], 'roster');
  if (roster.schemaVersion !== 1) throw new Error(`roster schemaVersion inválido: ${roster.schemaVersion}`);
  assertNonblank(roster.manifestVersion, 'roster.manifestVersion');
  assertId(roster.defaultCharacterId, 'roster.defaultCharacterId');
  if (!Array.isArray(roster.identities)) throw new Error('roster.identities debe ser un arreglo');
  const seen = new Set();
  const provenanceById = new Map();
  for (const [index, identity] of roster.identities.entries()) {
    const label = `roster.identities[${index}]`;
    assertPlainObject(identity, label);
    assertExactKeys(identity, ['characterId', 'displayName', 'summary', 'logicalScale', 'provenance'], label);
    const id = assertId(identity.characterId, `${label}.characterId`);
    if (seen.has(id)) throw new Error(`characterId duplicado: ${id}`);
    seen.add(id);
    assertNonblank(identity.displayName, `${id}.displayName`);
    assertNonblank(identity.summary, `${id}.summary`);
    if (identity.logicalScale !== 1 || !Number.isInteger(identity.logicalScale)) {
      throw new Error(`${id}.logicalScale debe ser el entero 1`);
    }
    provenanceById.set(id, validateProvenance(identity.provenance, id, provenanceRoot));
  }
  if (!seen.has(roster.defaultCharacterId)) {
    throw new Error(`roster.defaultCharacterId desconocido: ${roster.defaultCharacterId}`);
  }
  assertExactAuthority(roster, AUTHORITY_HASHES.roster, 'roster', { normalizePaths: true });
  return { characterIds: seen, provenanceById };
}

function validateActorRoster(actorRoster, provenanceRoot) {
  assertPlainObject(actorRoster, 'actorRoster');
  assertExactKeys(actorRoster, ['schemaVersion', 'visuals', 'mappings'], 'actorRoster');
  if (actorRoster.schemaVersion !== 1) {
    throw new Error(`actorRoster schemaVersion inválido: ${actorRoster.schemaVersion}`);
  }
  if (!Array.isArray(actorRoster.visuals)) throw new Error('actorRoster.visuals debe ser un arreglo');
  if (!Array.isArray(actorRoster.mappings)) throw new Error('actorRoster.mappings debe ser un arreglo');
  const visualIds = new Set();
  const provenanceById = new Map();
  for (const [index, visual] of actorRoster.visuals.entries()) {
    const label = `actorRoster.visuals[${index}]`;
    assertPlainObject(visual, label);
    assertExactKeys(visual, ['visualId', 'displayName', 'logicalScale', 'provenance'], label);
    const visualId = assertId(visual.visualId, `${label}.visualId`);
    if (visualIds.has(visualId)) throw new Error(`visualId duplicado: ${visualId}`);
    visualIds.add(visualId);
    assertNonblank(visual.displayName, `${visualId}.displayName`);
    if (visual.logicalScale !== 1 || !Number.isInteger(visual.logicalScale)) {
      throw new Error(`${visualId}.logicalScale debe ser el entero 1`);
    }
    provenanceById.set(visualId, validateProvenance(visual.provenance, visualId, provenanceRoot));
  }

  const actorIds = new Set();
  const mappedVisuals = new Set();
  for (const [index, mapping] of actorRoster.mappings.entries()) {
    const label = `actorRoster.mappings[${index}]`;
    assertPlainObject(mapping, label);
    assertExactKeys(mapping, ['actorId', 'visualId'], label);
    const actorId = assertId(mapping.actorId, `${label}.actorId`);
    const visualId = assertId(mapping.visualId, `${label}.visualId`);
    if (actorIds.has(actorId)) throw new Error(`actorId duplicado: ${actorId}`);
    actorIds.add(actorId);
    if (!visualIds.has(visualId)) throw new Error(`mapping ${actorId}: visualId unknown ${visualId}`);
    mappedVisuals.add(visualId);
  }
  for (const visualId of visualIds) {
    if (!mappedVisuals.has(visualId)) throw new Error(`visualId unmapped: ${visualId}`);
  }
  assertExactAuthority(actorRoster, AUTHORITY_HASHES.actorRoster, 'actorRoster', { normalizePaths: true });
  return { actorIds, visualIds, provenanceById };
}

export function normalizeClinicalEmotionMap(clinicalEmotionMap) {
  assertPlainObject(clinicalEmotionMap, 'clinical emotion map');
  assertExactKeys(clinicalEmotionMap, ['schemaVersion', 'mappings'], 'clinical emotion map');
  if (clinicalEmotionMap.schemaVersion !== 1) {
    throw new Error(`clinical emotion map schemaVersion inválido: ${clinicalEmotionMap.schemaVersion}`);
  }
  assertPlainObject(clinicalEmotionMap.mappings, 'clinical emotion mappings');
  const entries = Object.entries(clinicalEmotionMap.mappings);
  if (entries.length === 0) throw new Error('clinical emotion mappings no puede estar vacío');
  const normalized = [];
  for (const [rawKey, rawState] of entries) {
    const key = assertNonblank(rawKey, 'clinical emotion mapping key');
    if (key !== rawKey || key !== key.toLowerCase()) {
      throw new Error(`clinical emotion mapping key no normalizada: ${JSON.stringify(rawKey)}`);
    }
    if (typeof rawState !== 'string' || !PORTRAIT_STATE_SET.has(rawState)) {
      throw new Error(`clinical emotion ${key}: PortraitState inválido ${JSON.stringify(rawState)}`);
    }
    normalized.push([key, rawState]);
  }
  normalized.sort(([left], [right]) => left.localeCompare(right));
  assertExactAuthority(clinicalEmotionMap, AUTHORITY_HASHES.clinicalEmotionMap, 'clinical emotion map');
  return Object.fromEntries(normalized);
}

function pixelHex(data, index) {
  return `#${data[index].toString(16).padStart(2, '0')}${data[index + 1].toString(16).padStart(2, '0')}${data[index + 2].toString(16).padStart(2, '0')}`;
}

function centralContiguousWidth(pixels, frameWidth, localY) {
  let runStart = null;
  for (let localX = 0; localX <= frameWidth; localX += 1) {
    const occupied = localX < frameWidth && pixels.has(localY * frameWidth + localX);
    if (occupied && runStart === null) {
      runStart = localX;
      continue;
    }
    if (!occupied && runStart !== null) {
      const runEnd = localX - 1;
      if (runStart <= RIG_AXIS_X && runEnd >= RIG_AXIS_X) return runEnd - runStart + 1;
      runStart = null;
    }
  }
  return 0;
}

function validateBodyBandCoverage(body, spec, rule, bandName, frameLabel) {
  let qualifyingRows = 0;
  let consecutiveRows = 0;
  let longestRun = 0;
  for (
    let localY = body.top + rule.offsetTop;
    localY <= body.top + rule.offsetBottom;
    localY += 1
  ) {
    const width = centralContiguousWidth(body.pixels, spec.frameWidth, localY);
    if (width >= rule.minWidth && width <= rule.maxWidth) {
      qualifyingRows += 1;
      consecutiveRows += 1;
      longestRun = Math.max(longestRun, consecutiveRows);
    } else {
      consecutiveRows = 0;
    }
  }
  if (longestRun < rule.minConsecutiveRows && qualifyingRows < rule.minTotalRows) {
    throw new Error(
      `${frameLabel} ${bandName} coverage ${qualifyingRows} filas, `
      + `${longestRun} consecutivas; requiere ${rule.minConsecutiveRows} consecutivas `
      + `o ${rule.minTotalRows} totales con ancho central ${rule.minWidth}-${rule.maxWidth}`,
    );
  }
}

function componentChebyshevDistance(left, right, frameWidth) {
  let minimum = Number.POSITIVE_INFINITY;
  for (const leftKey of left.pixels) {
    const leftX = leftKey % frameWidth;
    const leftY = Math.floor(leftKey / frameWidth);
    for (const rightKey of right.pixels) {
      const rightX = rightKey % frameWidth;
      const rightY = Math.floor(rightKey / frameWidth);
      minimum = Math.min(minimum, Math.max(Math.abs(leftX - rightX), Math.abs(leftY - rightY)));
      if (minimum <= 1) return minimum;
    }
  }
  return minimum;
}

function validateSecondaryComponents(components, body, spec, frameLabel) {
  const secondary = components.filter((component) => component !== body);
  const footedSecondary = secondary.filter(({ anchoredToFeet }) => anchoredToFeet);
  if (footedSecondary.length > 0) {
    throw new Error(`${frameLabel} secondary component anchored to feet/shadow band 66-68`);
  }
  if (secondary.length > SECONDARY_COMPONENT_RULES.maxComponents) {
    throw new Error(
      `${frameLabel} contiene ${secondary.length} componentes secundarios; `
      + `máximo ${SECONDARY_COMPONENT_RULES.maxComponents}`,
    );
  }
  const totalArea = secondary.reduce((sum, component) => sum + component.pixels.size, 0);
  if (totalArea > SECONDARY_COMPONENT_RULES.maxTotalArea) {
    throw new Error(
      `${frameLabel} secondary component area total ${totalArea}; `
      + `máximo ${SECONDARY_COMPONENT_RULES.maxTotalArea}`,
    );
  }
  const permittedTop = body.top + SECONDARY_COMPONENT_RULES.minBodyTopOffset;
  const permittedBottom = body.bottom - SECONDARY_COMPONENT_RULES.maxBodyBottomOffset;
  for (const component of secondary) {
    const area = component.pixels.size;
    if (area < SECONDARY_COMPONENT_RULES.minArea || area > SECONDARY_COMPONENT_RULES.maxArea) {
      throw new Error(
        `${frameLabel} secondary component area ${area}; `
        + `debe estar entre ${SECONDARY_COMPONENT_RULES.minArea} y ${SECONDARY_COMPONENT_RULES.maxArea}`,
      );
    }
    if (component.top < permittedTop || component.bottom > permittedBottom) {
      throw new Error(
        `${frameLabel} secondary component vertical range ${component.top}-${component.bottom}; `
        + `debe quedar entre ${permittedTop} y ${permittedBottom}`,
      );
    }
    const distance = componentChebyshevDistance(component, body, spec.frameWidth);
    if (distance > SECONDARY_COMPONENT_RULES.maxChebyshevDistance) {
      throw new Error(
        `${frameLabel} secondary component distance ${distance}; `
        + `máximo ${SECONDARY_COMPONENT_RULES.maxChebyshevDistance}`,
      );
    }
  }
}

function inspectFrame(png, spec, column, row, label, isPortrait) {
  const originX = column * spec.frameWidth;
  const originY = row * spec.frameHeight;
  let opaque = 0;
  for (let localY = 0; localY < spec.frameHeight; localY += 1) {
    for (let localX = 0; localX < spec.frameWidth; localX += 1) {
      const index = ((originY + localY) * png.width + originX + localX) * 4;
      if (png.data[index + 3] !== 255) continue;
      opaque += 1;
      if (
        localX === 0 || localY === 0
        || localX === spec.frameWidth - 1 || localY === spec.frameHeight - 1
      ) {
        throw new Error(`${label}: frame ${column},${row} tiene border opaque`);
      }
    }
  }
  if (opaque < 64) throw new Error(`${label}: frame ${column},${row} incomplete; requiere 64 opaque pixels`);
  const alphaAt = (localX, localY) => {
    if (localX < 0 || localY < 0 || localX >= spec.frameWidth || localY >= spec.frameHeight) return 0;
    return png.data[((originY + localY) * png.width + originX + localX) * 4 + 3];
  };
  if (!isPortrait) {
    const pixelKey = (localX, localY) => localY * spec.frameWidth + localX;
    const visited = new Set();
    const components = [];
    for (let localY = 0; localY < spec.frameHeight; localY += 1) {
      for (let localX = 0; localX < spec.frameWidth; localX += 1) {
        const startKey = pixelKey(localX, localY);
        if (alphaAt(localX, localY) !== 255 || visited.has(startKey)) continue;
        const stack = [[localX, localY]];
        const pixels = new Set([startKey]);
        visited.add(startKey);
        let top = localY;
        let bottom = localY;
        let anchoredToFeet = localY >= 66 && localY <= 68;
        while (stack.length > 0) {
          const [x, y] = stack.pop();
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          anchoredToFeet ||= y >= 66 && y <= 68;
          for (const [nextX, nextY] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const nextKey = pixelKey(nextX, nextY);
            if (alphaAt(nextX, nextY) !== 255 || visited.has(nextKey)) continue;
            visited.add(nextKey);
            pixels.add(nextKey);
            stack.push([nextX, nextY]);
          }
        }
        components.push({ pixels, top, bottom, anchoredToFeet });
      }
    }
    const body = components
      .filter(({ anchoredToFeet }) => anchoredToFeet)
      .sort((left, right) => right.pixels.size - left.pixels.size)[0];
    if (!body) {
      throw new Error(`${label}: frame ${column},${row} feet component missing; debe terminar entre 66 y 68`);
    }
    if (body.bottom < 66 || body.bottom > 68) {
      throw new Error(`${label}: frame ${column},${row} feet bottom ${body.bottom}; debe estar entre 66 y 68`);
    }
    const frameLabel = `${label}: frame ${column},${row}`;
    validateSecondaryComponents(components, body, spec, frameLabel);
    const bodyHeight = body.bottom - body.top + 1;
    if (bodyHeight < 60 || bodyHeight > 66) {
      throw new Error(`${label}: frame ${column},${row} opaque body height ${bodyHeight}; debe estar entre 60 y 66`);
    }
    validateBodyBandCoverage(body, spec, BODY_BAND_RULES.head, 'head', frameLabel);
    validateBodyBandCoverage(body, spec, BODY_BAND_RULES.shoulder, 'shoulder', frameLabel);
  }
  for (let localY = 0; localY < spec.frameHeight; localY += 1) {
    for (let localX = 0; localX < spec.frameWidth; localX += 1) {
      const index = ((originY + localY) * png.width + originX + localX) * 4;
      if (png.data[index + 3] !== 255) continue;
      const exterior = [
        [localX - 1, localY], [localX + 1, localY],
        [localX, localY - 1], [localX, localY + 1],
      ].some(([x, y]) => alphaAt(x, y) === 0);
      if (exterior && pixelHex(png.data, index) !== REQUIRED_OUTLINE) {
        throw new Error(`${label}: frame ${column},${row} exterior outline debe ser ${REQUIRED_OUTLINE}`);
      }
    }
  }
}

function frameIsHorizontalMirror(png, spec, column, leftRow, rightRow) {
  const leftOriginX = column * spec.frameWidth;
  const leftOriginY = leftRow * spec.frameHeight;
  const rightOriginX = column * spec.frameWidth;
  const rightOriginY = rightRow * spec.frameHeight;
  for (let localY = 0; localY < spec.frameHeight; localY += 1) {
    for (let localX = 0; localX < spec.frameWidth; localX += 1) {
      const leftIndex = ((leftOriginY + localY) * png.width + leftOriginX + localX) * 4;
      const rightIndex = (
        (rightOriginY + localY) * png.width
        + rightOriginX + (spec.frameWidth - 1 - localX)
      ) * 4;
      const leftAlpha = png.data[leftIndex + 3];
      const rightAlpha = png.data[rightIndex + 3];
      if (leftAlpha !== rightAlpha) return false;
      if (leftAlpha === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        if (png.data[leftIndex + channel] !== png.data[rightIndex + channel]) return false;
      }
    }
  }
  return true;
}

function validateAuthoredDirections(png, spec, sheetId, ownerId) {
  if (sheetId === 'portrait') return;
  const blockCount = sheetId === 'react' ? 4 : 1;
  for (let block = 0; block < blockCount; block += 1) {
    const leftRow = block * 4 + 1;
    const rightRow = block * 4 + 2;
    for (let column = 0; column < spec.columns; column += 1) {
      if (frameIsHorizontalMirror(png, spec, column, leftRow, rightRow)) {
        throw new Error(`${ownerId} ${sheetId}: right direction debe ser authored; consequence block ${block} frame ${column} es mirror exacto`);
      }
    }
  }
}

function inspectSheet({ filePath, sheetId, ownerId, allowedColors }) {
  const label = `${ownerId} ${sheetId} ${filePath}`;
  if (!existsSync(filePath)) throw new Error(`${label}: PNG absent`);
  const bytes = readFileSync(filePath);
  const png = decodePng(bytes, label);
  const spec = SHEET_SPECS[sheetId];
  if (png.width !== spec.width || png.height !== spec.height) {
    throw new Error(`${label}: dimensions ${png.width}x${png.height}; esperaba ${spec.width}x${spec.height}`);
  }
  const usedColors = new Set();
  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3];
    if (alpha !== 0 && alpha !== 255) throw new Error(`${label}: alpha no binario ${alpha}`);
    if (alpha === 255) {
      const color = pixelHex(png.data, index);
      if (!allowedColors.has(color)) throw new Error(`${label}: color fuera de palette ${color}`);
      usedColors.add(color);
    }
  }
  if (usedColors.size > 48) throw new Error(`${label}: usa ${usedColors.size} colors; máximo 48`);
  const isPortrait = sheetId === 'portrait';
  for (let row = 0; row < spec.rows; row += 1) {
    for (let column = 0; column < spec.columns; column += 1) {
      inspectFrame(png, spec, column, row, label, isPortrait);
    }
  }
  validateAuthoredDirections(png, spec, sheetId, ownerId);
  return { bytes, sha256: sha256(bytes) };
}

function directionRows(columns, rowOffset = 0) {
  return Object.fromEntries(
    ['down', 'left', 'right', 'up'].map((direction, row) => [
      direction,
      Array.from({ length: columns }, (_, frame) => (row + rowOffset) * columns + frame),
    ]),
  );
}

function baseAnimations() {
  const animations = {
    idle: { id: 'idle', sheetId: 'idle', fps: 4, loop: true, directions: directionRows(4) },
    walk: {
      id: 'walk', sheetId: 'walk', fps: 10, loop: true, directions: directionRows(6),
      contactSequenceIndices: [0, 3],
    },
    talk: { id: 'talk', sheetId: 'talk', fps: 7, loop: true, directions: directionRows(4) },
    interact: { id: 'interact', sheetId: 'interact', fps: 8, loop: false, directions: directionRows(4) },
    turn: { id: 'turn', sheetId: 'turn', fps: 12, loop: false, directions: directionRows(3) },
  };
  const reactionIds = ['reactRelief', 'reactSteady', 'reactTension', 'reactRupture'];
  for (const [block, id] of reactionIds.entries()) {
    animations[id] = {
      id,
      sheetId: 'react',
      fps: 7,
      loop: false,
      directions: directionRows(4, block * 4),
    };
  }
  return animations;
}

function toPublicPath(relativePath) {
  return `/assets/characters/v1/${relativePath.split(path.sep).join('/')}`;
}

function buildVariant({ assetsRoot, relativeDirectory, ownerId, palette, paletteHash, allowedColors, sourceSha256 }) {
  const sheets = {};
  for (const sheetId of CHARACTER_SHEET_IDS) {
    const spec = SHEET_SPECS[sheetId];
    const relativePath = path.join(relativeDirectory, `${sheetId}.png`);
    const filePath = resolveRealContained(assetsRoot, relativePath, `${ownerId} ${sheetId}`);
    const inspected = inspectSheet({ filePath, sheetId, ownerId, allowedColors });
    sheets[sheetId] = {
      id: sheetId,
      src: toPublicPath(relativePath),
      ...spec,
      sha256: inspected.sha256,
    };
  }

  const portraitRelativePath = path.join(relativeDirectory, 'portrait.png');
  const portraitPath = resolveRealContained(assetsRoot, portraitRelativePath, `${ownerId} portrait`);
  const portraitInspected = inspectSheet({
    filePath: portraitPath,
    sheetId: 'portrait',
    ownerId,
    allowedColors,
  });
  const portraitSpec = SHEET_SPECS.portrait;
  const portraitStates = Object.fromEntries(
    PORTRAIT_STATES.map((state, row) => [state, Array.from({ length: 4 }, (_, frame) => row * 4 + frame)]),
  );
  const variantBody = {
    variantId: 'base',
    sourceSha256,
    paletteId: palette.paletteId,
    paletteHash,
    logicalScale: 1,
    pivot: { x: 24, y: 68 },
    feetHitbox: { x: -11, y: -16, width: 22, height: 16 },
    shadow: { offsetX: 0, offsetY: -1, width: 26, height: 8 },
    sheets,
    animations: baseAnimations(),
    portrait: {
      sheet: {
        id: 'portrait',
        src: toPublicPath(portraitRelativePath),
        ...portraitSpec,
        sha256: portraitInspected.sha256,
      },
      fps: 6,
      states: portraitStates,
    },
  };
  return { ...variantBody, contentHash: hashCanonical(variantBody) };
}

function generatedReadme(manifest) {
  const lines = [
    '# Character Manifest v1',
    '',
    `Manifest hash: \`${manifest.manifestHash}\``,
    `Palette: \`${manifest.palettes[0].paletteId}\` (\`${manifest.palettes[0].sha256}\`)`,
    '',
    '## Selectable identities',
    '',
  ];
  if (manifest.identities.length === 0) lines.push('- None in this diagnostic build.');
  for (const identity of manifest.identities) {
    lines.push(`- \`${identity.characterId}\` — ${identity.displayName}: \`${identity.variants[0].contentHash}\``);
  }
  lines.push('', '## Actor visuals', '');
  if (manifest.actorVisuals.length === 0) lines.push('- None in this diagnostic build.');
  for (const visual of manifest.actorVisuals) {
    lines.push(`- \`${visual.visualId}\` — ${visual.displayName}: \`${visual.variant.contentHash}\``);
  }
  lines.push('', `Actor mappings: ${Object.keys(manifest.actorMappings).length} actor mappings.`, '');
  lines.push(`Clinical emotion mappings: ${Object.keys(manifest.clinicalEmotionPortraitStates).length}.`, '');
  return `${lines.join('\n')}\n`;
}

export function buildCharacterManifest({
  assetsRoot,
  provenanceRoot,
  roster,
  actorRoster,
  palette,
  clinicalEmotionMap,
  onlyCharacter,
  onlyActor,
}) {
  if (onlyCharacter !== undefined && onlyActor !== undefined) {
    throw new Error('onlyCharacter y onlyActor son mutuamente excluyentes');
  }
  const resolvedAssetsRoot = path.resolve(assertNonblank(assetsRoot, 'assetsRoot'));
  if (!existsSync(resolvedAssetsRoot)) throw new Error(`assetsRoot no existe: ${resolvedAssetsRoot}`);
  if (lstatSync(resolvedAssetsRoot).isSymbolicLink()) {
    throw new Error(`assetsRoot: symlink/junction/reparse root no permitido ${resolvedAssetsRoot}`);
  }
  const resolvedProvenanceRoot = path.resolve(assertNonblank(provenanceRoot, 'provenanceRoot'));
  if (!existsSync(resolvedProvenanceRoot)) throw new Error(`provenanceRoot no existe: ${resolvedProvenanceRoot}`);
  if (lstatSync(resolvedProvenanceRoot).isSymbolicLink()) {
    throw new Error(`provenanceRoot: symlink/junction/reparse root no permitido ${resolvedProvenanceRoot}`);
  }
  const allowedColors = validatePalette(palette);
  const { characterIds, provenanceById: characterProvenance } = validateRoster(roster, resolvedProvenanceRoot);
  const { visualIds, provenanceById: actorProvenance } = validateActorRoster(actorRoster, resolvedProvenanceRoot);
  const normalizedClinicalMap = normalizeClinicalEmotionMap(clinicalEmotionMap);

  if (onlyCharacter !== undefined && !characterIds.has(onlyCharacter)) {
    throw new Error(`onlyCharacter missing/unknown: ${onlyCharacter}`);
  }
  if (onlyActor !== undefined && !visualIds.has(onlyActor)) {
    throw new Error(`onlyActor visualId missing/unknown: ${onlyActor}`);
  }
  const fullBuild = onlyCharacter === undefined && onlyActor === undefined;
  if (fullBuild && roster.identities.length !== 10) {
    throw new Error(`full build requiere exactamente 10 selectable identities; recibió ${roster.identities.length}`);
  }

  const paletteHash = hashCanonical(palette);
  const selectedIdentities = onlyActor !== undefined
    ? []
    : roster.identities.filter((entry) => onlyCharacter === undefined || entry.characterId === onlyCharacter);
  const selectedMappings = onlyCharacter !== undefined
    ? []
    : actorRoster.mappings.filter((mapping) => onlyActor === undefined || mapping.visualId === onlyActor);
  const selectedVisualIds = new Set(selectedMappings.map(({ visualId }) => visualId));
  const selectedVisuals = actorRoster.visuals.filter(({ visualId }) => selectedVisualIds.has(visualId));

  const identities = selectedIdentities.map((identity) => ({
    characterId: identity.characterId,
    displayName: identity.displayName,
    summary: identity.summary,
    provenance: characterProvenance.get(identity.characterId),
    variants: [buildVariant({
      assetsRoot: resolvedAssetsRoot,
      relativeDirectory: path.join(identity.characterId, 'base'),
      ownerId: identity.characterId,
      palette,
      paletteHash,
      allowedColors,
      sourceSha256: characterProvenance.get(identity.characterId).sourceSha256,
    })],
  }));
  const actorVisuals = selectedVisuals.map((visual) => ({
    visualId: visual.visualId,
    displayName: visual.displayName,
    provenance: actorProvenance.get(visual.visualId),
    variant: buildVariant({
      assetsRoot: resolvedAssetsRoot,
      relativeDirectory: path.join('actors', visual.visualId, 'base'),
      ownerId: visual.visualId,
      palette,
      paletteHash,
      allowedColors,
      sourceSha256: actorProvenance.get(visual.visualId).sourceSha256,
    }),
  }));
  const actorMappings = Object.fromEntries(
    selectedMappings
      .map(({ actorId, visualId }) => [actorId, visualId])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const manifestBody = {
    schemaVersion: 1,
    manifestVersion: roster.manifestVersion,
    defaultCharacterId: roster.defaultCharacterId,
    logicalFrame: { width: 48, height: 72 },
    consequenceReactions: canonicalize(CONSEQUENCE_REACTIONS),
    clinicalEmotionPortraitStates: normalizedClinicalMap,
    palettes: [{
      paletteId: palette.paletteId,
      src: '/assets/characters/v1/palette.v1.json',
      sha256: paletteHash,
    }],
    identities,
    actorVisuals,
    actorMappings,
  };
  const manifest = { ...manifestBody, manifestHash: hashCanonical(manifestBody) };
  return {
    manifest,
    manifestJson: canonicalPretty(manifest),
    readme: generatedReadme(manifest),
  };
}

export function assertDerivedArtifact(filePath, expectedBytes, label = path.basename(filePath)) {
  if (!existsSync(filePath)) throw new Error(`${label}: derived artifact missing ${filePath}`);
  const actual = readFileSync(filePath);
  const expected = Buffer.isBuffer(expectedBytes) ? expectedBytes : Buffer.from(expectedBytes, 'utf8');
  if (!actual.equals(expected)) throw new Error(`${label}: derived artifact drift en ${filePath}`);
}

export function parseCharacterCliArgs(args) {
  if (!Array.isArray(args)) throw new Error('argument list inválida');
  let mode = 'diagnostic';
  let onlyCharacter;
  let onlyActor;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--write' || argument === '--check') {
      if (mode !== 'diagnostic' || onlyCharacter !== undefined || onlyActor !== undefined) {
        throw new Error(`modos mutuamente excluyentes: ${args.join(' ')}`);
      }
      mode = argument.slice(2);
      continue;
    }
    if (argument === '--character' || argument === '--actor') {
      if (mode !== 'diagnostic' || onlyCharacter !== undefined || onlyActor !== undefined) {
        throw new Error(`modos mutuamente excluyentes: ${args.join(' ')}`);
      }
      const value = args[index + 1];
      if (typeof value !== 'string' || value.startsWith('--') || value.trim() === '') {
        throw new Error(`${argument} requiere un value`);
      }
      assertId(value, `${argument} argument`);
      if (argument === '--character') onlyCharacter = value;
      else onlyActor = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return {
    mode,
    ...(onlyCharacter === undefined ? {} : { onlyCharacter }),
    ...(onlyActor === undefined ? {} : { onlyActor }),
  };
}
