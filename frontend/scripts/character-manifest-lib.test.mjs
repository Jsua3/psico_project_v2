import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import {
  PORTRAIT_STATES,
  SHEET_SPECS,
  assertDerivedArtifact,
  buildCharacterManifest,
  canonicalStringify,
  normalizeClinicalEmotionMap,
  parseCharacterCliArgs,
} from './character-manifest-lib.mjs';

const MASTER_COLORS = [
  '#15131d', '#211e2b', '#302a3b', '#494255', '#6c6376', '#948a9b',
  '#f7dfcc', '#e9bea0', '#cf8f6f', '#a8614c', '#f0c7a5', '#d99a76',
  '#b86f52', '#824735', '#d6a17f', '#b97656', '#92513b', '#623326',
  '#ad7758', '#87543d', '#623b2d', '#40271f', '#774a35', '#563223',
  '#38231d', '#241817', '#2a2630', '#3d3543', '#594957', '#765d68',
  '#5c3928', '#7b4a30', '#a06a40', '#c08a55', '#8a542f', '#b7783e',
  '#d7a957', '#f0d17a', '#552b26', '#79372d', '#a84e36', '#d06c49',
  '#62636c', '#858690', '#adaeb5', '#d2d2d4', '#2d2852', '#433878',
  '#6350a6', '#8a70d3', '#b49bea', '#203d61', '#2c5884', '#3d78a8',
  '#69a2c8', '#a2cbe1', '#29483d', '#3d6a55', '#5b8d70', '#85b294',
  '#bad2be', '#562d3a', '#7b3b4c', '#a95366', '#d47b8b', '#efb0b8',
  '#353a46', '#505866', '#737d8b', '#a3abb5', '#d5d9dd', '#f1f2f4',
  '#ffffff',
];

const EXPECTED_SPECS = {
  idle: { width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 },
  walk: { width: 288, height: 288, frameWidth: 48, frameHeight: 72, columns: 6, rows: 4 },
  talk: { width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 },
  interact: { width: 192, height: 288, frameWidth: 48, frameHeight: 72, columns: 4, rows: 4 },
  turn: { width: 144, height: 288, frameWidth: 48, frameHeight: 72, columns: 3, rows: 4 },
  react: { width: 192, height: 1152, frameWidth: 48, frameHeight: 72, columns: 4, rows: 16 },
  portrait: { width: 384, height: 768, frameWidth: 96, frameHeight: 96, columns: 4, rows: 8 },
};

const VALID_CLINICAL_MAP = {
  schemaVersion: 1,
  mappings: {
    worried: 'concerned',
    sad: 'concerned',
    relieved: 'relieved',
    receptive: 'relief',
    positive: 'relieved',
    neutral: 'neutral',
    negative: 'concerned',
    danger: 'concerned',
    concerned: 'concerned',
    closed: 'rupture',
    calm: 'steady',
    anxious: 'concerned',
  },
};

const EXPECTED_ROSTER = {
  schemaVersion: 1,
  manifestVersion: '1.0.0',
  defaultCharacterId: 'valentina',
  identities: [
    {
      characterId: 'valentina', displayName: 'Valentina',
      summary: 'Serena, observadora y de expresión cálida.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/valentina.png' },
    },
    {
      characterId: 'andres', displayName: 'Andrés',
      summary: 'Sobrio, atento y de postura tranquila.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/andres.png' },
    },
    {
      characterId: 'camila', displayName: 'Camila',
      summary: 'Expresiva, profesional y cercana.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/camila.png' },
    },
    {
      characterId: 'daniela', displayName: 'Daniela',
      summary: 'Reflexiva, precisa y de lenguaje corporal contenido.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/daniela.png' },
    },
    {
      characterId: 'david', displayName: 'David',
      summary: 'Metódico, amable y de silueta reconocible.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/david.png' },
    },
    {
      characterId: 'felipe', displayName: 'Felipe',
      summary: 'Concentrado, humano y de presencia sobria.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/felipe.png' },
    },
    {
      characterId: 'jorge', displayName: 'Jorge',
      summary: 'Adulto, sereno y de porte profesional.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/jorge.png' },
    },
    {
      characterId: 'luisa', displayName: 'Luisa',
      summary: 'Segura, empática y visualmente diferenciada.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/luisa.png' },
    },
    {
      characterId: 'mariana', displayName: 'Mariana',
      summary: 'Atenta, sobria y de expresión sensible.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/mariana.png' },
    },
    {
      characterId: 'mateo', displayName: 'Mateo',
      summary: 'Calmado, accesible y de postura profesional.', logicalScale: 1,
      provenance: { source: 'Remaster original del elenco SIEP', license: 'SIEP-INTERNAL', sourceAsset: 'cast/mateo.png' },
    },
  ],
};

const EXPECTED_ACTOR_ROSTER = {
  schemaVersion: 1,
  visuals: [
    ['cuidadora-familia-vbg', 'Cuidadora de familia VBG', 'cast/npc_madre-vbg.png'],
    ['psicologa-hospitalaria', 'Psicóloga hospitalaria', 'cast/npc_psicologa-hospitalaria.png'],
    ['sobreviviente-vbg', 'Sobreviviente VBG', 'cast/npc_paciente-vbg.png'],
    ['profesional-psicosocial', 'Profesional psicosocial', 'cast/npc_comisaria-profesional.png'],
    ['funcionaria-recepcion', 'Funcionaria de recepción', 'cast/npc_funcionaria-recepcion.png'],
    ['enfermera-urgencias', 'Enfermera de urgencias', 'cast/npc_colega-clinica.png'],
    ['medico-guardia', 'Médico de guardia', 'cast/npc_supervisor-clinico.png'],
    ['psicologa-orientadora', 'Psicóloga orientadora', 'cast/npc_psicologa-hospitalaria.png'],
    ['trabajadora-social', 'Trabajadora social', 'cast/npc_comisaria-profesional.png'],
    ['orientadora-juridica', 'Orientadora jurídica', 'cast/npc_funcionaria-recepcion.png'],
    ['madre-acompanante', 'Madre acompañante', 'cast/npc_madre-vbg.png'],
  ].map(([visualId, displayName, sourceAsset]) => ({
    visualId,
    displayName,
    logicalScale: 1,
    provenance: {
      source: 'Remaster original del elenco SIEP',
      license: 'SIEP-INTERNAL',
      sourceAsset,
    },
  })),
  mappings: [
    ['familia-duelo', 'cuidadora-familia-vbg'],
    ['familia-crisis', 'cuidadora-familia-vbg'],
    ['psicologa-acompanante', 'psicologa-hospitalaria'],
    ['sobreviviente-consulta', 'sobreviviente-vbg'],
    ['sobreviviente-espera', 'sobreviviente-vbg'],
    ['profesional-psicosocial', 'profesional-psicosocial'],
    ['apoyo-psicosocial', 'profesional-psicosocial'],
    ['funcionaria-recepcion', 'funcionaria-recepcion'],
    ['enfermera-urgencias', 'enfermera-urgencias'],
    ['medico-guardia', 'medico-guardia'],
    ['psicologa-orientadora', 'psicologa-orientadora'],
    ['trabajadora-social', 'trabajadora-social'],
    ['orientadora-juridica', 'orientadora-juridica'],
    ['madre-acompanante', 'madre-acompanante'],
  ].map(([actorId, visualId]) => ({ actorId, visualId })),
};

const EXPECTED_PALETTE = {
  schemaVersion: 1,
  paletteId: 'siep-master-v1',
  outline: '#15131d',
  masterColors: [...MASTER_COLORS],
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const productionCharactersRoot = path.resolve(scriptDirectory, '..', 'src', 'assets', 'characters');
const productionV1Root = path.join(productionCharactersRoot, 'v1');
const loadProductionJson = (fileName) => JSON.parse(readFileSync(path.join(productionV1Root, fileName), 'utf8'));
const PRODUCTION_PALETTE = loadProductionJson('palette.v1.json');
const PRODUCTION_ROSTER = loadProductionJson('roster.v1.json');
const PRODUCTION_ACTOR_ROSTER = loadProductionJson('actor-roster.v1.json');
const PRODUCTION_CLINICAL_MAP = loadProductionJson('clinical-emotion-map.v1.json');

const roots = new Set();

test.afterEach(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
  roots.clear();
});

function rgba(hex, alpha = 255) {
  const value = hex.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function setPixel(png, x, y, color) {
  const index = (png.width * y + x) * 4;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
}

function getPixel(png, x, y) {
  const index = (png.width * y + x) * 4;
  return [...png.data.subarray(index, index + 4)];
}

function drawRigFrame(png, spec, column, row, {
  headWidth = 19,
  shoulderWidth = 24,
  bodyHeight = 64,
} = {}) {
  const frameX = column * spec.frameWidth;
  const frameY = row * spec.frameHeight;
  const portrait = spec.frameWidth === 96;
  const center = Math.floor(spec.frameWidth / 2);
  const body = rgba(MASTER_COLORS[(row + column) % 8 + 1]);
  const outline = rgba('#15131d');

  if (portrait) {
    for (let y = 12; y <= 82; y += 1) {
      for (let x = center - 9; x <= center + 9; x += 1) {
        const edge = x === center - 9 || x === center + 9 || y === 12 || y === 82;
        setPixel(png, frameX + x, frameY + y, edge ? outline : body);
      }
    }
    setPixel(png, frameX + center + ((row * 3 + column) % 5), frameY + 19, rgba('#ffffff'));
    return;
  }

  const bottom = 67;
  const top = bottom - bodyHeight + 1;
  const torsoWidth = Math.min(16, headWidth, shoulderWidth);
  const mask = new Set();
  for (let localY = top; localY <= bottom; localY += 1) {
    const offset = localY - top;
    const width = offset < 18 ? headWidth : (offset < 28 ? shoulderWidth : torsoWidth);
    const left = center - Math.floor(width / 2);
    for (let localX = left; localX < left + width; localX += 1) mask.add(`${localX},${localY}`);
  }
  for (const point of mask) {
    const [localX, localY] = point.split(',').map(Number);
    const exterior = [
      `${localX - 1},${localY}`, `${localX + 1},${localY}`,
      `${localX},${localY - 1}`, `${localX},${localY + 1}`,
    ].some((neighbor) => !mask.has(neighbor));
    setPixel(png, frameX + localX, frameY + localY, exterior ? outline : body);
  }
  const authoredX = center + ((row * 3 + column) % 3) - 1;
  const authoredY = top + 7;
  if ([
    `${authoredX - 1},${authoredY}`, `${authoredX + 1},${authoredY}`,
    `${authoredX},${authoredY - 1}`, `${authoredX},${authoredY + 1}`,
  ].every((neighbor) => mask.has(neighbor))) {
    setPixel(png, frameX + authoredX, frameY + authoredY, rgba('#ffffff'));
  }
}

function redrawRigFrame(png, spec, column, row, options) {
  clearFrame(png, spec, column, row);
  drawRigFrame(png, spec, column, row, options);
}

function drawValidFrame(png, spec, column, row) {
  drawRigFrame(png, spec, column, row);
}

function makeValidPng(spec) {
  const png = new PNG({ width: spec.width, height: spec.height });
  png.data.fill(0);
  for (let row = 0; row < spec.rows; row += 1) {
    for (let column = 0; column < spec.columns; column += 1) {
      drawValidFrame(png, spec, column, row);
    }
  }
  return PNG.sync.write(png);
}

const VALID_PNGS = Object.fromEntries(
  Object.entries(EXPECTED_SPECS).map(([id, spec]) => [id, makeValidPng(spec)]),
);

function writePng(filePath, buffer) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, buffer);
}

function writeSourcePng(filePath) {
  const png = new PNG({ width: 16, height: 16 });
  png.data.fill(0);
  for (let y = 2; y < 14; y += 1) {
    for (let x = 2; x < 14; x += 1) setPixel(png, x, y, rgba('#15131d'));
  }
  writePng(filePath, PNG.sync.write(png));
}

function writeSheetSet(assetDirectory) {
  for (const [sheetId, bytes] of Object.entries(VALID_PNGS)) {
    writePng(path.join(assetDirectory, `${sheetId}.png`), bytes);
  }
}

function createFixture({ materialize = 'selected' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'siep-character-manifest-'));
  roots.add(root);
  const provenanceRoot = path.join(root, 'characters');
  const assetsRoot = path.join(provenanceRoot, 'v1');
  const roster = structuredClone(PRODUCTION_ROSTER);
  const actorRoster = structuredClone(PRODUCTION_ACTOR_ROSTER);
  const palette = structuredClone(PRODUCTION_PALETTE);

  for (const entry of roster.identities) writeSourcePng(path.join(provenanceRoot, entry.provenance.sourceAsset));
  for (const entry of actorRoster.visuals) writeSourcePng(path.join(provenanceRoot, entry.provenance.sourceAsset));

  if (materialize === 'all') {
    for (const entry of roster.identities) writeSheetSet(path.join(assetsRoot, entry.characterId, 'base'));
    for (const entry of actorRoster.visuals) writeSheetSet(path.join(assetsRoot, 'actors', entry.visualId, 'base'));
  } else {
    writeSheetSet(path.join(assetsRoot, 'valentina', 'base'));
  }

  return {
    root,
    assetsRoot,
    provenanceRoot,
    roster,
    actorRoster,
    palette,
    clinicalEmotionMap: structuredClone(PRODUCTION_CLINICAL_MAP),
  };
}

function provenanceEntries(fixture) {
  return [...fixture.roster.identities, ...fixture.actorRoster.visuals];
}

function writeAllCastSources(fixture, castDirectory) {
  for (const entry of provenanceEntries(fixture)) {
    const relative = entry.provenance.sourceAsset.replace(/^cast[\\/]/, '');
    writeSourcePng(path.join(castDirectory, relative));
  }
}

function replaceCastWithJunction(fixture, targetDirectory) {
  const castDirectory = path.join(fixture.provenanceRoot, 'cast');
  rmSync(castDirectory, { force: true, recursive: true });
  writeAllCastSources(fixture, targetDirectory);
  symlinkSync(targetDirectory, castDirectory, process.platform === 'win32' ? 'junction' : 'dir');
}

function buildSelected(fixture, overrides = {}) {
  return buildCharacterManifest({
    ...fixture,
    onlyCharacter: 'valentina',
    ...overrides,
  });
}

function mutatePng(filePath, mutation) {
  const png = PNG.sync.read(readFileSync(filePath));
  mutation(png);
  writeFileSync(filePath, PNG.sync.write(png));
}

function sheetPath(fixture, sheetId, characterId = 'valentina') {
  return path.join(fixture.assetsRoot, characterId, 'base', `${sheetId}.png`);
}

function clearFrame(png, spec, column, row) {
  for (let y = 0; y < spec.frameHeight; y += 1) {
    for (let x = 0; x < spec.frameWidth; x += 1) {
      setPixel(png, column * spec.frameWidth + x, row * spec.frameHeight + y, [0, 0, 0, 0]);
    }
  }
}

function mirrorFrame(png, spec, column, sourceRow, destinationRow) {
  clearFrame(png, spec, column, destinationRow);
  for (let y = 0; y < spec.frameHeight; y += 1) {
    for (let x = 0; x < spec.frameWidth; x += 1) {
      const pixel = getPixel(
        png,
        column * spec.frameWidth + (spec.frameWidth - 1 - x),
        sourceRow * spec.frameHeight + y,
      );
      setPixel(png, column * spec.frameWidth + x, destinationRow * spec.frameHeight + y, pixel);
    }
  }
}

function drawOutlinedRectangle(png, spec, column, row, { left, top, width, height }) {
  const originX = column * spec.frameWidth;
  const originY = row * spec.frameHeight;
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const outline = x === left || x === left + width - 1 || y === top || y === top + height - 1;
      setPixel(png, originX + x, originY + y, rgba(outline ? '#15131d' : '#211e2b'));
    }
  }
}

function drawOutlinedMask(png, spec, column, row, mask) {
  const originX = column * spec.frameWidth;
  const originY = row * spec.frameHeight;
  for (const point of mask) {
    const [x, y] = point.split(',').map(Number);
    const exterior = [
      `${x - 1},${y}`, `${x + 1},${y}`,
      `${x},${y - 1}`, `${x},${y + 1}`,
    ].some((neighbor) => !mask.has(neighbor));
    setPixel(png, originX + x, originY + y, rgba(exterior ? '#15131d' : '#211e2b'));
  }
}

test('production JSON authorities equal the independently pinned character contract', () => {
  assert.deepEqual(PRODUCTION_PALETTE, EXPECTED_PALETTE);
  assert.deepEqual(PRODUCTION_ROSTER, EXPECTED_ROSTER);
  assert.deepEqual(PRODUCTION_ACTOR_ROSTER, EXPECTED_ACTOR_ROSTER);
  assert.deepEqual(PRODUCTION_CLINICAL_MAP, VALID_CLINICAL_MAP);
  assert.equal(PRODUCTION_PALETTE.masterColors.length, 73);
  assert.equal(PRODUCTION_ROSTER.identities.length, 10);
  assert.equal(PRODUCTION_ROSTER.defaultCharacterId, 'valentina');
  assert.equal(PRODUCTION_ACTOR_ROSTER.visuals.length, 11);
  assert.equal(PRODUCTION_ACTOR_ROSTER.mappings.length, 14);
  assert.equal(Object.keys(PRODUCTION_CLINICAL_MAP.mappings).length, 12);
});

test('exports the binding sheet geometry', () => {
  assert.deepEqual(SHEET_SPECS, EXPECTED_SPECS);
});

test('builds deterministic byte-backed geometry, animations, portraits, and provenance', () => {
  const fixture = createFixture();
  const first = buildSelected(fixture);
  const second = buildSelected(fixture);
  const manifest = first.manifest;
  const variant = manifest.identities[0].variants[0];

  assert.deepEqual(first, second);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.manifestVersion, '1.0.0');
  assert.equal(manifest.defaultCharacterId, 'valentina');
  assert.deepEqual(manifest.logicalFrame, { width: 48, height: 72 });
  assert.deepEqual(variant.pivot, { x: 24, y: 68 });
  assert.deepEqual(variant.feetHitbox, { x: -11, y: -16, width: 22, height: 16 });
  assert.equal(variant.logicalScale, 1);
  assert.deepEqual(
    { ...manifest.identities[0].provenance, sourceSha256: undefined },
    { ...fixture.roster.identities[0].provenance, sourceSha256: undefined },
  );
  assert.match(manifest.identities[0].provenance.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.identities[0].summary, 'Serena, observadora y de expresión cálida.');

  for (const sheetId of ['idle', 'walk', 'talk', 'interact', 'turn', 'react']) {
    const expectedHash = createHash('sha256').update(readFileSync(sheetPath(fixture, sheetId))).digest('hex');
    assert.equal(variant.sheets[sheetId].sha256, expectedHash);
    assert.match(variant.sheets[sheetId].src, new RegExp(`/valentina/base/${sheetId}\\.png$`));
  }
  assert.equal(
    variant.portrait.sheet.sha256,
    createHash('sha256').update(readFileSync(sheetPath(fixture, 'portrait'))).digest('hex'),
  );

  assert.deepEqual(variant.animations.idle, {
    id: 'idle', sheetId: 'idle', fps: 4, loop: true,
    directions: { down: [0, 1, 2, 3], left: [4, 5, 6, 7], right: [8, 9, 10, 11], up: [12, 13, 14, 15] },
  });
  assert.deepEqual(variant.animations.walk, {
    id: 'walk', sheetId: 'walk', fps: 10, loop: true,
    directions: {
      down: [0, 1, 2, 3, 4, 5], left: [6, 7, 8, 9, 10, 11],
      right: [12, 13, 14, 15, 16, 17], up: [18, 19, 20, 21, 22, 23],
    },
    contactSequenceIndices: [0, 3],
  });
  assert.equal(variant.animations.talk.fps, 7);
  assert.equal(variant.animations.talk.loop, true);
  assert.equal(variant.animations.interact.fps, 8);
  assert.equal(variant.animations.interact.loop, false);
  assert.equal(variant.animations.turn.fps, 12);
  assert.equal(variant.animations.turn.loop, false);

  const reactionIds = ['reactRelief', 'reactSteady', 'reactTension', 'reactRupture'];
  for (const [block, animationId] of reactionIds.entries()) {
    const animation = variant.animations[animationId];
    assert.equal(animation.sheetId, 'react');
    assert.equal(animation.fps, 7);
    assert.equal(animation.loop, false);
    assert.deepEqual(animation.directions.down, [0, 1, 2, 3].map((frame) => frame + block * 16));
    assert.deepEqual(animation.directions.left, [4, 5, 6, 7].map((frame) => frame + block * 16));
    assert.deepEqual(animation.directions.right, [8, 9, 10, 11].map((frame) => frame + block * 16));
    assert.deepEqual(animation.directions.up, [12, 13, 14, 15].map((frame) => frame + block * 16));
  }

  assert.deepEqual(PORTRAIT_STATES, [
    'neutral', 'focused', 'concerned', 'relieved', 'relief', 'steady', 'tension', 'rupture',
  ]);
  assert.deepEqual(variant.portrait.states, Object.fromEntries(
    PORTRAIT_STATES.map((state, row) => [state, [0, 1, 2, 3].map((frame) => frame + row * 4)]),
  ));
  assert.match(variant.contentHash, /^[a-f0-9]{64}$/);
  assert.match(manifest.manifestHash, /^[a-f0-9]{64}$/);
  assert.equal(canonicalStringify(manifest), canonicalStringify(second.manifest));
  assert.equal(first.readme, second.readme);
  assert.match(first.readme, /valentina/);
  assert.match(first.readme, new RegExp(variant.contentHash));
});

test('emits the independently fixed 7 fps consequence timing', () => {
  const { manifest } = buildSelected(createFixture());
  const animations = manifest.identities[0].variants[0].animations;
  assert.deepEqual(
    ['reactRelief', 'reactSteady', 'reactTension', 'reactRupture'].map((id) => animations[id].fps),
    [7, 7, 7, 7],
  );
});

test('emits the independently fixed centered 26x8 shadow one pixel above the pivot', () => {
  const { manifest } = buildSelected(createFixture());
  assert.deepEqual(manifest.identities[0].variants[0].shadow, {
    offsetX: 0,
    offsetY: -1,
    width: 26,
    height: 8,
  });
});

test('uses exact consequence reactions and rejects clinical authority drift', () => {
  const fixture = createFixture();
  const first = buildSelected(fixture);
  assert.deepEqual(first.manifest.consequenceReactions, {
    relief: { animationId: 'reactRelief', portraitState: 'relief' },
    steady: { animationId: 'reactSteady', portraitState: 'steady' },
    tension: { animationId: 'reactTension', portraitState: 'tension' },
    rupture: { animationId: 'reactRupture', portraitState: 'rupture' },
  });
  assert.deepEqual(Object.keys(first.manifest.clinicalEmotionPortraitStates), [...Object.keys(VALID_CLINICAL_MAP.mappings)].sort());

  const changedMap = structuredClone(fixture.clinicalEmotionMap);
  changedMap.mappings.worried = 'focused';
  assert.throws(
    () => buildSelected(fixture, { clinicalEmotionMap: changedMap }),
    /clinical.*(?:exact|author|drift|12)|(?:exact|author|drift).*clinical/i,
  );
});

test('normalizes only the exact clinical map schema and PortraitState values', () => {
  assert.deepEqual(normalizeClinicalEmotionMap(VALID_CLINICAL_MAP), Object.fromEntries(
    Object.entries(VALID_CLINICAL_MAP.mappings).sort(([left], [right]) => left.localeCompare(right)),
  ));
  for (const invalid of [
    null,
    [],
    {},
    { schemaVersion: 2, mappings: {} },
    { schemaVersion: 1, mappings: {} },
    { schemaVersion: 1, mappings: { ' ': 'neutral' } },
    { schemaVersion: 1, mappings: { neutral: '' } },
    { schemaVersion: 1, mappings: { neutral: 'happy' } },
    { schemaVersion: 1, mappings: { ...VALID_CLINICAL_MAP.mappings, extra: 'neutral' } },
    {
      schemaVersion: 1,
      mappings: Object.fromEntries(Object.entries(VALID_CLINICAL_MAP.mappings).slice(0, -1)),
    },
  ]) {
    assert.throws(() => normalizeClinicalEmotionMap(invalid), /clinical|schema|mapping|PortraitState/i);
  }
});

test('full builds require exactly ten selectable identities and include non-selectable actor visuals', () => {
  const fixture = createFixture({ materialize: 'all' });
  const { manifest, readme } = buildCharacterManifest(fixture);

  assert.equal(manifest.identities.length, 10);
  assert.equal(manifest.actorVisuals.length, 11);
  assert.deepEqual(manifest.actorMappings, Object.fromEntries(
    EXPECTED_ACTOR_ROSTER.mappings.map(({ actorId, visualId }) => [actorId, visualId]),
  ));
  assert.match(readme, /14 actor mappings/);
  const reference = manifest.identities[0].variants[0];
  for (const visual of manifest.actorVisuals) {
    assert.equal('selectable' in visual, false);
    assert.deepEqual(visual.variant.pivot, reference.pivot);
    assert.deepEqual(visual.variant.feetHitbox, reference.feetHitbox);
    assert.deepEqual(visual.variant.animations, reference.animations);
    assert.equal(visual.variant.paletteId, reference.paletteId);
  }

  const tooFew = createFixture();
  tooFew.roster.identities.pop();
  assert.throws(() => buildCharacterManifest(tooFew), /identit|exactamente 10|exactly 10|author/i);
});

test('allows mutually exclusive partial identity or actor diagnostics and rejects unknown filters', () => {
  const fixture = createFixture({ materialize: 'all' });
  const character = buildCharacterManifest({ ...fixture, onlyCharacter: 'mateo' }).manifest;
  assert.deepEqual(character.identities.map(({ characterId }) => characterId), ['mateo']);
  assert.equal(character.actorVisuals.length, 0);

  const actorOnly = buildCharacterManifest({ ...fixture, onlyActor: 'cuidadora-familia-vbg' }).manifest;
  assert.equal(actorOnly.identities.length, 0);
  assert.deepEqual(actorOnly.actorVisuals.map(({ visualId }) => visualId), ['cuidadora-familia-vbg']);
  assert.deepEqual(actorOnly.actorMappings, {
    'familia-crisis': 'cuidadora-familia-vbg',
    'familia-duelo': 'cuidadora-familia-vbg',
  });

  assert.throws(() => buildCharacterManifest({ ...fixture, onlyCharacter: 'missing' }), /onlyCharacter.*missing|missing.*character/i);
  assert.throws(
    () => buildCharacterManifest({ ...fixture, onlyActor: 'familia-duelo' }),
    /onlyActor.*visualId.*(?:missing|unknown).*familia-duelo|familia-duelo.*(?:missing|unknown)/i,
  );
  assert.throws(
    () => buildCharacterManifest({ ...fixture, onlyCharacter: 'valentina', onlyActor: 'cuidadora-familia-vbg' }),
    /mutuamente|simultaneous|onlyCharacter.*onlyActor/i,
  );
});

test('rejects duplicate ids, blank actor ids, unknown mappings, and unmapped visuals', () => {
  const cases = [];
  {
    const fixture = createFixture();
    fixture.roster.identities[1].characterId = fixture.roster.identities[0].characterId;
    cases.push([fixture, /characterId.*duplic/i]);
  }
  {
    const fixture = createFixture();
    fixture.actorRoster.visuals[1].visualId = fixture.actorRoster.visuals[0].visualId;
    cases.push([fixture, /visualId.*duplic/i]);
  }
  {
    const fixture = createFixture();
    fixture.actorRoster.mappings[0].actorId = ' ';
    cases.push([fixture, /actorId.*vac|blank actor/i]);
  }
  {
    const fixture = createFixture();
    fixture.actorRoster.mappings[0].visualId = 'unknown';
    cases.push([fixture, /mapping.*unknown|visualId.*unknown/i]);
  }
  {
    const fixture = createFixture();
    fixture.actorRoster.mappings.pop();
    cases.push([fixture, /unmapped|sin mapping|madre-acompanante/i]);
  }
  for (const [fixture, pattern] of cases) assert.throws(() => buildSelected(fixture), pattern);
});

test('rejects fractional logical scales and malformed roster, actor roster, palette, or schemas', () => {
  const mutators = [
    [(fixture) => { fixture.roster.schemaVersion = 2; }, /roster.*schema/i],
    [(fixture) => { fixture.roster.identities = null; }, /identities/i],
    [(fixture) => { fixture.roster.defaultCharacterId = 'unknown'; }, /defaultCharacterId/i],
    [(fixture) => { fixture.roster.identities[0].summary = ' '; }, /summary/i],
    [(fixture) => { fixture.roster.identities[0].logicalScale = 0.5; }, /logicalScale/i],
    [(fixture) => { fixture.actorRoster.schemaVersion = 2; }, /actor.*schema/i],
    [(fixture) => { fixture.actorRoster.visuals[0].logicalScale = 1.5; }, /logicalScale/i],
    [(fixture) => { fixture.palette.schemaVersion = 2; }, /palette.*schema/i],
    [(fixture) => { fixture.palette.paletteId = ' '; }, /paletteId/i],
    [(fixture) => { fixture.palette.outline = '#ffffff'; }, /outline/i],
    [(fixture) => { fixture.palette.masterColors.push('#15131d'); }, /duplic.*color|color.*duplic/i],
    [(fixture) => { fixture.clinicalEmotionMap.schemaVersion = 2; }, /clinical.*schema|schema.*clinical/i],
  ];
  for (const [mutate, expected] of mutators) {
    const fixture = createFixture();
    mutate(fixture);
    assert.throws(() => buildSelected(fixture), expected);
  }
});

test('rejects any exact authority drift in full, character, and actor modes', () => {
  const cases = [
    ['palette id', (fixture) => { fixture.palette.paletteId = 'other-master'; }, /palette.*(?:exact|author|siep-master-v1)/i],
    ['palette missing color', (fixture) => { fixture.palette.masterColors.pop(); }, /palette.*(?:exact|author|73)/i],
    ['palette extra color', (fixture) => { fixture.palette.masterColors.push('#000000'); }, /palette.*(?:exact|author|73)/i],
    ['palette order', (fixture) => {
      [fixture.palette.masterColors[1], fixture.palette.masterColors[2]] = [
        fixture.palette.masterColors[2], fixture.palette.masterColors[1],
      ];
    }, /palette.*(?:exact|author|order|orden)/i],
    ['default character', (fixture) => { fixture.roster.defaultCharacterId = 'andres'; }, /roster.*(?:exact|author|valentina)/i],
    ['identity id', (fixture) => { fixture.roster.identities[9].characterId = 'paula'; }, /roster.*(?:exact|author)|identit.*author/i],
    ['identity summary', (fixture) => { fixture.roster.identities[0].summary = 'Otra síntesis.'; }, /roster.*(?:exact|author)|identit.*author/i],
    ['identity provenance', (fixture) => { fixture.roster.identities[0].provenance.source = 'Otra fuente'; }, /roster.*(?:exact|author)|provenance.*author/i],
    ['actor visual', (fixture) => {
      fixture.actorRoster.visuals.pop();
      fixture.actorRoster.mappings.pop();
    }, /actor.*(?:exact|author|11|14)/i],
    ['actor mapping', (fixture) => { fixture.actorRoster.mappings.splice(1, 1); }, /actor.*(?:exact|author|14)/i],
    ['clinical missing', (fixture) => { delete fixture.clinicalEmotionMap.mappings.closed; }, /clinical.*(?:exact|author|12)/i],
    ['clinical extra', (fixture) => { fixture.clinicalEmotionMap.mappings.extra = 'neutral'; }, /clinical.*(?:exact|author|12)/i],
    ['clinical remap', (fixture) => { fixture.clinicalEmotionMap.mappings.worried = 'focused'; }, /clinical.*(?:exact|author|12)/i],
  ];
  const modes = [
    ['full', {}],
    ['character', { onlyCharacter: 'valentina' }],
    ['actor', { onlyActor: 'cuidadora-familia-vbg' }],
  ];
  for (const [caseName, mutate, expected] of cases) {
    for (const [modeName, options] of modes) {
      const fixture = createFixture();
      mutate(fixture);
      assert.throws(
        () => buildCharacterManifest({ ...fixture, ...options }),
        expected,
        `${caseName} must fail in ${modeName} mode`,
      );
    }
  }
});

test('requires exact nonblank provenance and a real source contained by provenanceRoot', () => {
  for (const field of ['source', 'license', 'sourceAsset']) {
    const fixture = createFixture();
    fixture.roster.identities[0].provenance[field] = ' ';
    assert.throws(() => buildSelected(fixture), new RegExp(`valentina.*${field}|${field}.*valentina`, 'i'));
  }

  const withoutRoot = createFixture();
  delete withoutRoot.provenanceRoot;
  assert.throws(() => buildSelected(withoutRoot), /provenanceRoot.*(?:required|oblig|vac)|(?:required|oblig).*provenanceRoot/i);

  const absent = createFixture();
  unlinkSync(path.join(absent.provenanceRoot, absent.roster.identities[0].provenance.sourceAsset));
  assert.throws(() => buildSelected(absent), /valentina.*source|source.*valentina/i);

  const escaped = createFixture();
  writeSourcePng(path.join(escaped.root, 'escape.png'));
  escaped.roster.identities[0].provenance.sourceAsset = '../escape.png';
  assert.throws(() => buildSelected(escaped), /escape|fuera|root/i);

  const externalLink = createFixture();
  replaceCastWithJunction(externalLink, path.join(externalLink.root, 'outside-cast'));
  assert.throws(() => buildSelected(externalLink), /junction|symlink|link|reparse/i);

  const internalLink = createFixture();
  replaceCastWithJunction(internalLink, path.join(internalLink.provenanceRoot, 'real-cast'));
  assert.throws(() => buildSelected(internalLink), /junction|symlink|link|reparse/i);
});

test('canonicalizes source paths and hashes real source bytes into provenance and derived hashes', () => {
  const slashFixture = createFixture();
  const slash = buildSelected(slashFixture).manifest;

  const backslashFixture = createFixture();
  backslashFixture.roster.identities[0].provenance.sourceAsset = 'cast\\valentina.png';
  const backslash = buildSelected(backslashFixture).manifest;
  assert.equal(backslash.identities[0].provenance.sourceAsset, 'cast/valentina.png');
  assert.equal(backslash.identities[0].provenance.sourceSha256, slash.identities[0].provenance.sourceSha256);
  assert.equal(backslash.identities[0].variants[0].contentHash, slash.identities[0].variants[0].contentHash);
  assert.equal(backslash.manifestHash, slash.manifestHash);

  const changedFixture = createFixture();
  const before = buildSelected(changedFixture).manifest;
  const sourceFile = path.join(changedFixture.provenanceRoot, 'cast', 'valentina.png');
  mutatePng(sourceFile, (png) => setPixel(png, 3, 3, rgba('#211e2b')));
  const after = buildSelected(changedFixture).manifest;
  assert.notEqual(before.identities[0].provenance.sourceSha256, after.identities[0].provenance.sourceSha256);
  assert.notEqual(before.identities[0].variants[0].contentHash, after.identities[0].variants[0].contentHash);
  assert.notEqual(before.manifestHash, after.manifestHash);
});

test('rejects missing PNGs and wrong dimensions', () => {
  const absent = createFixture();
  unlinkSync(sheetPath(absent, 'idle'));
  assert.throws(() => buildSelected(absent), /valentina.*idle\.png|idle\.png.*valentina/i);

  const wrong = createFixture();
  const spec = EXPECTED_SPECS.idle;
  writePng(sheetPath(wrong, 'idle'), makeValidPng({ ...spec, width: spec.width - 1 }));
  assert.throws(() => buildSelected(wrong), /valentina.*idle.*dimension|idle.*192.*288/i);
});

test('rejects internal or external links under assetsRoot, including portrait', () => {
  for (const location of ['external', 'internal']) {
    const fixture = createFixture();
    const characterDirectory = path.join(fixture.assetsRoot, 'valentina');
    const targetDirectory = location === 'external'
      ? path.join(fixture.root, 'outside-valentina')
      : path.join(fixture.assetsRoot, 'real-valentina');
    renameSync(characterDirectory, targetDirectory);
    symlinkSync(targetDirectory, characterDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => buildSelected(fixture), /junction|symlink|link|reparse/i, `${location} character junction`);
  }

  for (const location of ['external', 'internal']) {
    const fixture = createFixture();
    const portrait = sheetPath(fixture, 'portrait');
    const target = location === 'external'
      ? path.join(fixture.root, 'outside-portrait-target')
      : path.join(fixture.assetsRoot, 'real-portrait-target');
    unlinkSync(portrait);
    mkdirSync(target, { recursive: true });
    symlinkSync(target, portrait, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => buildSelected(fixture), /portrait.*(?:junction|symlink|link|reparse)|(?:junction|symlink|link|reparse).*portrait/i);
  }
});

test('rejects nonbinary alpha and out-of-palette colors', () => {
  const alpha = createFixture();
  mutatePng(sheetPath(alpha, 'idle'), (png) => setPixel(png, 24, 12, rgba('#15131d', 128)));
  assert.throws(() => buildSelected(alpha), /valentina.*idle.*alpha|alpha.*binari/i);

  const color = createFixture();
  mutatePng(sheetPath(color, 'idle'), (png) => setPixel(png, 24, 12, [1, 2, 3, 255]));
  assert.throws(() => buildSelected(color), /valentina.*idle.*palette|#010203/i);
});

test('rejects empty frames, feet drift, and opaque frame borders', () => {
  const empty = createFixture();
  mutatePng(sheetPath(empty, 'idle'), (png) => clearFrame(png, EXPECTED_SPECS.idle, 0, 0));
  assert.throws(() => buildSelected(empty), /valentina.*idle.*frame.*64|opaque.*64|incomplete/i);

  const drift = createFixture();
  mutatePng(sheetPath(drift, 'idle'), (png) => {
    clearFrame(png, EXPECTED_SPECS.idle, 0, 0);
    for (let y = 2; y <= 65; y += 1) {
      for (let x = 20; x <= 27; x += 1) setPixel(png, x, y, rgba('#15131d'));
    }
  });
  assert.throws(() => buildSelected(drift), /valentina.*idle.*feet|bottom.*66.*68/i);

  const border = createFixture();
  mutatePng(sheetPath(border, 'idle'), (png) => setPixel(png, 0, 12, rgba('#15131d')));
  assert.throws(() => buildSelected(border), /valentina.*idle.*border|border.*opaque/i);
});

test('rejects sheets using more than 48 allowed colors', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    for (let index = 0; index < 49; index += 1) {
      const x = 18 + (index % 7);
      const y = 8 + Math.floor(index / 7);
      setPixel(png, x, y, rgba(MASTER_COLORS[index]));
    }
  });
  assert.throws(() => buildSelected(fixture), /valentina.*idle.*48|colors.*48/i);
});

test('rejects exact horizontal mirror directions on ordinary sheets', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    for (let column = 0; column < EXPECTED_SPECS.idle.columns; column += 1) {
      mirrorFrame(png, EXPECTED_SPECS.idle, column, 1, 2);
    }
  });
  assert.throws(() => buildSelected(fixture), /valentina.*idle.*mirror|right.*author/i);
});

test('rejects one mirrored left/right frame pair even when the other pairs are authored', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    mirrorFrame(png, EXPECTED_SPECS.idle, 0, 1, 2);
  });
  assert.throws(() => buildSelected(fixture), /valentina.*idle.*(?:mirror|author)|right.*author/i);
});

test('transparent RGB cannot hide a visually exact mirrored direction', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    for (let column = 0; column < EXPECTED_SPECS.idle.columns; column += 1) {
      mirrorFrame(png, EXPECTED_SPECS.idle, column, 1, 2);
    }
    setPixel(png, 1, EXPECTED_SPECS.idle.frameHeight * 2 + 1, [1, 2, 3, 0]);
  });
  assert.throws(() => buildSelected(fixture), /valentina.*idle.*(?:mirror|author)|right.*author/i);
});

test('enforces the 60-66 px opaque body height and required exterior outline', () => {
  const short = createFixture();
  mutatePng(sheetPath(short, 'idle'), (png) => {
    clearFrame(png, EXPECTED_SPECS.idle, 0, 0);
    drawOutlinedRectangle(png, EXPECTED_SPECS.idle, 0, 0, {
      left: 16, top: 64, width: 16, height: 4,
    });
  });
  assert.throws(() => buildSelected(short), /height|altura|60.*66/i);

  const noOutline = createFixture();
  mutatePng(sheetPath(noOutline, 'idle'), (png) => {
    for (let y = 0; y < EXPECTED_SPECS.idle.frameHeight; y += 1) {
      for (let x = 0; x < EXPECTED_SPECS.idle.frameWidth; x += 1) {
        const pixel = getPixel(png, x, y);
        if (pixel[0] === 21 && pixel[1] === 19 && pixel[2] === 29 && pixel[3] === 255) {
          setPixel(png, x, y, rgba('#211e2b'));
        }
      }
    }
  });
  assert.throws(() => buildSelected(noOutline), /outline|contorno|#15131d/i);
});

test('enforces independent 18-21 px head and 20-27 px shoulder spans at exact boundaries', () => {
  for (const options of [
    { headWidth: 18 }, { headWidth: 21 },
    { shoulderWidth: 20 }, { shoulderWidth: 27 },
    { bodyHeight: 60 }, { bodyHeight: 66 },
  ]) {
    const fixture = createFixture();
    mutatePng(sheetPath(fixture, 'idle'), (png) => {
      redrawRigFrame(png, EXPECTED_SPECS.idle, 0, 0, options);
    });
    assert.doesNotThrow(() => buildSelected(fixture), `valid rig boundary ${JSON.stringify(options)}`);
  }

  for (const options of [
    { headWidth: 17 }, { headWidth: 22 },
    { shoulderWidth: 19 }, { shoulderWidth: 28 },
  ]) {
    const fixture = createFixture();
    mutatePng(sheetPath(fixture, 'idle'), (png) => {
      redrawRigFrame(png, EXPECTED_SPECS.idle, 0, 0, options);
    });
    assert.throws(
      () => buildSelected(fixture),
      /head|cabeza|shoulder|hombro|18.*21|20.*27/i,
      `invalid rig boundary ${JSON.stringify(options)}`,
    );
  }

  const fourBySixtyFour = createFixture();
  mutatePng(sheetPath(fourBySixtyFour, 'idle'), (png) => {
    clearFrame(png, EXPECTED_SPECS.idle, 0, 0);
    drawOutlinedRectangle(png, EXPECTED_SPECS.idle, 0, 0, {
      left: 22, top: 4, width: 4, height: 64,
    });
  });
  assert.throws(() => buildSelected(fourBySixtyFour), /head|cabeza|shoulder|hombro|18.*21|20.*27/i);
});

test('rejects disconnected outliers that spoof valid head and shoulder bounding boxes around a 4x64 footed body', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    clearFrame(png, EXPECTED_SPECS.idle, 0, 0);
    drawOutlinedRectangle(png, EXPECTED_SPECS.idle, 0, 0, {
      left: 22, top: 4, width: 4, height: 64,
    });
    for (const [x, y] of [[15, 4], [34, 4], [12, 22], [35, 22]]) {
      setPixel(png, x, y, rgba('#15131d'));
    }
  });

  assert.throws(() => buildSelected(fixture), /disconnected|outlier|componente/i);
});

test('rejects connected one-pixel tendrils that spoof band bounding boxes without valid contiguous row widths', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    clearFrame(png, EXPECTED_SPECS.idle, 0, 0);
    drawOutlinedRectangle(png, EXPECTED_SPECS.idle, 0, 0, {
      left: 22, top: 4, width: 4, height: 64,
    });
    const outline = rgba('#15131d');
    for (const [x, startY, endY] of [[15, 4, 32], [34, 4, 33], [12, 22, 34], [35, 22, 35]]) {
      for (let y = startY; y <= endY; y += 1) setPixel(png, x, y, outline);
    }
    for (const [y, startX, endX] of [[32, 15, 22], [33, 25, 34], [34, 12, 22], [35, 25, 35]]) {
      for (let x = startX; x <= endX; x += 1) setPixel(png, x, y, outline);
    }
  });

  assert.throws(() => buildSelected(fixture), /head|cabeza|18.*21/i);
});

test('rejects a narrow footed body with only one qualifying head row and one qualifying shoulder row', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    clearFrame(png, EXPECTED_SPECS.idle, 0, 0);
    const mask = new Set();
    for (let y = 4; y <= 67; y += 1) {
      for (let x = 22; x <= 25; x += 1) mask.add(`${x},${y}`);
    }
    for (let x = 15; x <= 32; x += 1) mask.add(`${x},10`);
    for (let x = 14; x <= 33; x += 1) mask.add(`${x},24`);
    drawOutlinedMask(png, EXPECTED_SPECS.idle, 0, 0, mask);
  });

  assert.throws(
    () => buildSelected(fixture),
    /head|cabeza|shoulder|hombro|continu|rows|filas|18.*21|20.*27/i,
  );
});

test('accepts a small outlined detached hand near the arm without including it in body geometry', () => {
  const fixture = createFixture();
  mutatePng(sheetPath(fixture, 'idle'), (png) => {
    drawOutlinedRectangle(png, EXPECTED_SPECS.idle, 0, 0, {
      left: 34, top: 36, width: 3, height: 3,
    });
  });

  assert.doesNotThrow(() => buildSelected(fixture));
});

test('rejects detached components that are noise, far away, oversized, or anchored to feet', () => {
  const cases = [
    ['single-pixel noise', { left: 33, top: 36, width: 1, height: 1 }],
    ['far component', { left: 3, top: 36, width: 3, height: 3 }],
    ['oversized component', { left: 34, top: 36, width: 6, height: 6 }],
    ['feet component', { left: 40, top: 66, width: 2, height: 2 }],
  ];
  for (const [caseName, rectangle] of cases) {
    const fixture = createFixture();
    mutatePng(sheetPath(fixture, 'idle'), (png) => {
      drawOutlinedRectangle(png, EXPECTED_SPECS.idle, 0, 0, rectangle);
    });
    assert.throws(
      () => buildSelected(fixture),
      /component|componente|outlier|noise|ruido|feet|pies|size|area|distancia|distance/i,
      caseName,
    );
  }
});

test('checks authored right direction in every react consequence block', () => {
  for (const block of [0, 1, 2, 3]) {
    const fixture = createFixture();
    mutatePng(sheetPath(fixture, 'react'), (png) => {
      for (let column = 0; column < EXPECTED_SPECS.react.columns; column += 1) {
        mirrorFrame(png, EXPECTED_SPECS.react, column, block * 4 + 1, block * 4 + 2);
      }
    });
    assert.throws(
      () => buildSelected(fixture),
      new RegExp(`valentina.*react.*(block|consequence).*${block}|react.*mirror|right.*author`, 'i'),
    );
  }
});

test('hashes real bytes and changes all derived hashes after a permitted pixel mutation', () => {
  const fixture = createFixture();
  const before = buildSelected(fixture).manifest;
  mutatePng(sheetPath(fixture, 'idle'), (png) => setPixel(png, 24, 12, rgba('#433878')));
  const after = buildSelected(fixture).manifest;
  assert.notEqual(before.identities[0].variants[0].sheets.idle.sha256, after.identities[0].variants[0].sheets.idle.sha256);
  assert.notEqual(before.identities[0].variants[0].contentHash, after.identities[0].variants[0].contentHash);
  assert.notEqual(before.manifestHash, after.manifestHash);
});

test('assertDerivedArtifact accepts exact bytes and fails closed on drift or absence', () => {
  const fixture = createFixture();
  const derived = path.join(fixture.root, 'README.md');
  writeFileSync(derived, 'estable\n');
  assert.doesNotThrow(() => assertDerivedArtifact(derived, 'estable\n', 'README'));
  assert.throws(() => assertDerivedArtifact(derived, 'deriva\n', 'README'), /README.*drift|deriva/i);
  assert.throws(() => assertDerivedArtifact(path.join(fixture.root, 'missing.json'), '{}\n', 'manifest'), /manifest.*missing|no existe/i);
});

test('parses strict mutually exclusive character CLI modes and required values', () => {
  assert.deepEqual(parseCharacterCliArgs([]), { mode: 'diagnostic' });
  assert.deepEqual(parseCharacterCliArgs(['--character', 'valentina']), {
    mode: 'diagnostic',
    onlyCharacter: 'valentina',
  });
  assert.deepEqual(parseCharacterCliArgs(['--actor', 'cuidadora-familia-vbg']), {
    mode: 'diagnostic',
    onlyActor: 'cuidadora-familia-vbg',
  });
  assert.deepEqual(parseCharacterCliArgs(['--write']), { mode: 'write' });
  assert.deepEqual(parseCharacterCliArgs(['--check']), { mode: 'check' });
  for (const args of [
    ['--character'],
    ['--actor'],
    ['--character', '--check'],
    ['--actor', '--write'],
    ['--write', '--check'],
    ['--character', 'valentina', '--actor', 'cuidadora-familia-vbg'],
    ['--unknown'],
    ['positional'],
  ]) {
    assert.throws(() => parseCharacterCliArgs(args), /argument|value|modo|mutuamente|unknown/i);
  }
});
