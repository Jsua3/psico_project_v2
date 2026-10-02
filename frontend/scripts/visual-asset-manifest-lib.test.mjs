import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdtempSync, mkdirSync, readFileSync, renameSync,
  rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import {
  REQUIRED_PREMIUM_MAP_KEYS,
  REQUIRED_VISUAL_CATEGORIES,
  buildPremiumVisualManifest,
  inspectPremiumMapSelection,
  inspectTiledMap,
  inspectVisualPng,
  parsePremiumVisualCliArgs,
} from './visual-asset-manifest-lib.mjs';
import { renderPremiumContactSheets } from './render-premium-contact-sheets.mjs';

const MAP_BINDINGS = {
  'hospital-urgencias': 'hospital-urgencias',
  'hospital-sala-escucha': 'hospital-sala-escucha',
  'hospital-sala-accion': 'hospital-sala-escucha',
  'hospital-sala-cierre': 'hospital-sala-escucha',
  'comisaria-recepcion': 'comisaria-recepcion',
  'comisaria-consultorio': 'comisaria-consultorio',
  'comisaria-marco': 'comisaria-consultorio',
  'comisaria-cierre': 'comisaria-consultorio',
};

const CATEGORIES = [
  'tileset', 'furniture', 'person', 'object', 'tool',
  'exit', 'signal', 'prompt', 'hud-frame', 'hud-icon',
];

const EXPECTED_PRODUCTION_ASSETS = [
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
];

const EXPECTED_MAP_TRIPLES = {
  'hospital-urgencias': ['hospital-urgencias', 'hospital-urgencias', 'game/scenarios/hospital-urgencias.json'],
  'hospital-sala-escucha': ['hospital-sala-escucha', 'hospital-sala-escucha', 'game/scenarios/hospital-sala-escucha.json'],
  'hospital-sala-accion': ['hospital-sala-escucha-accion', 'hospital-sala-escucha', 'game/scenarios/hospital-sala-escucha.json'],
  'hospital-sala-cierre': ['hospital-sala-escucha-cierre', 'hospital-sala-escucha', 'game/scenarios/hospital-sala-escucha.json'],
  'comisaria-recepcion': ['comisaria-recepcion', 'comisaria-recepcion', 'game/scenarios/comisaria-recepcion.json'],
  'comisaria-consultorio': ['comisaria-consultorio', 'comisaria-consultorio', 'game/scenarios/comisaria-consultorio.json'],
  'comisaria-marco': ['comisaria-consultorio-marco', 'comisaria-consultorio', 'game/scenarios/comisaria-consultorio.json'],
  'comisaria-cierre': ['comisaria-consultorio-cierre', 'comisaria-consultorio', 'game/scenarios/comisaria-consultorio.json'],
};

const productionInventoryPath = new URL('../src/assets/visual/v1/inventory.v1.json', import.meta.url);
const productionPalettePath = new URL('../src/assets/characters/v1/palette.v1.json', import.meta.url);
const productionAssetsRoot = path.resolve(path.dirname(fileURLToPath(productionInventoryPath)), '..', '..', '..');

const roots = new Set();

test.afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function rgba(hex, alpha = 255) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    alpha,
  ];
}

function setPixel(png, x, y, color) {
  const offset = (y * png.width + x) * 4;
  png.data[offset] = color[0];
  png.data[offset + 1] = color[1];
  png.data[offset + 2] = color[2];
  png.data[offset + 3] = color[3];
}

function makePng(width = 32, height = 32, color = '#15131d') {
  const png = new PNG({ width, height });
  const pixel = rgba(color);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setPixel(png, x, y, pixel);
  }
  return PNG.sync.write(png);
}

function writePng(filePath, bytes = makePng()) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, bytes);
}

function mutatePng(filePath, mutation) {
  const png = PNG.sync.read(readFileSync(filePath));
  mutation(png);
  writeFileSync(filePath, PNG.sync.write(png));
}

function embeddedMap(image = '../tiles/fixture.png') {
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: 2,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    layers: [{
      id: 1,
      name: 'Floor',
      type: 'tilelayer',
      width: 2,
      height: 2,
      x: 0,
      y: 0,
      offsetx: 0,
      offsety: 0,
      opacity: 1,
      visible: true,
      data: [1, 2, 3, 4],
    }],
    tilesets: [{
      firstgid: 1,
      name: 'fixture',
      image,
      imagewidth: 32,
      imageheight: 32,
      tilewidth: 16,
      tileheight: 16,
      columns: 2,
      tilecount: 4,
      margin: 0,
      spacing: 0,
    }],
  };
}

function pngEntry([assetId, category, bindings], index) {
  const isTileset = category === 'tileset';
  const isPrimaryTileset = index === 0;
  return {
    assetId,
    category,
    src: isPrimaryTileset ? 'tiles/fixture.png' : `contract-assets/${assetId}.png`,
    sourceAsset: isPrimaryTileset ? 'tiles/fixture.png' : `contract-assets/${assetId}.png`,
    license: 'SIEP-INTERNAL',
    expectedDimensions: { width: 32, height: 32 },
    ...(isTileset ? { tileGrid: { tileWidth: 16, tileHeight: 16, columns: 2, rows: 2 } } : {}),
    logicalScale: 1,
    paletteId: 'siep-master-v1',
    bindings: [...bindings],
    reviewStatus: 'candidate',
  };
}

function mapEntry(mapKey) {
  const [backendMapKey = mapKey, binding = MAP_BINDINGS[mapKey], scenarioConfig = `scenarios/${mapKey}.json`] = (
    EXPECTED_MAP_TRIPLES[mapKey] ?? []
  );
  return {
    assetId: `map-${mapKey}`,
    category: 'tileset',
    mapKey,
    backendMapKey,
    binding,
    src: `maps/${mapKey}.json`,
    sourceAsset: `maps/${mapKey}.json`,
    scenarioConfig,
    license: 'SIEP-INTERNAL',
    expectedDimensions: { width: 32, height: 32 },
    tileGrid: { tileWidth: 16, tileHeight: 16, columns: 2, rows: 2 },
    logicalScale: 1,
    paletteId: 'siep-master-v1',
    bindings: [mapKey],
    reviewStatus: 'candidate',
  };
}

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'siep-visual-manifest-'));
  roots.add(root);
  const assetsRoot = path.join(root, 'assets');
  const sourceRoot = path.join(root, 'sources');
  mkdirSync(assetsRoot, { recursive: true });
  mkdirSync(sourceRoot, { recursive: true });
  const palette = {
    schemaVersion: 1,
    paletteId: 'siep-master-v1',
    outline: '#15131d',
    masterColors: ['#15131d', '#433878', '#ffffff'],
  };
  const assets = EXPECTED_PRODUCTION_ASSETS.map(pngEntry);
  for (const entry of assets) {
    writePng(path.join(assetsRoot, entry.src));
    writePng(path.join(sourceRoot, entry.sourceAsset));
  }
  const maps = Object.keys(MAP_BINDINGS).map(mapEntry);
  for (const entry of maps) {
    const mapPath = path.join(assetsRoot, entry.src);
    mkdirSync(path.dirname(mapPath), { recursive: true });
    writeFileSync(mapPath, `${JSON.stringify(embeddedMap(), null, 2)}\n`);
    const sourceMapPath = path.join(sourceRoot, entry.sourceAsset);
    mkdirSync(path.dirname(sourceMapPath), { recursive: true });
    writeFileSync(sourceMapPath, readFileSync(mapPath));
    const scenarioPath = path.join(assetsRoot, entry.scenarioConfig);
    mkdirSync(path.dirname(scenarioPath), { recursive: true });
    writeFileSync(scenarioPath, `${JSON.stringify({
      scenarioKey: entry.binding,
      startRoomKey: entry.binding,
      rooms: [{ key: entry.binding, tiledMapKey: entry.binding, tiledJsonPath: '' }],
    }, null, 2)}\n`);
  }
  const inventory = {
    schemaVersion: 1,
    status: 'candidate',
    mapBindings: structuredClone(MAP_BINDINGS),
    maps,
    assets,
    tiledResources: [],
  };
  return { root, assetsRoot, sourceRoot, palette, palettes: [palette], inventory };
}

function build(fixture, overrides = {}) {
  return buildPremiumVisualManifest({
    assetsRoot: fixture.assetsRoot,
    sourceRoot: fixture.sourceRoot,
    inventory: fixture.inventory,
    palettes: fixture.palettes,
    requireCandidate: true,
    ...overrides,
  });
}

function inspectSelectedMap(fixture, mapKey = fixture.inventory.maps[0].backendMapKey) {
  return inspectPremiumMapSelection({
    assetsRoot: fixture.assetsRoot,
    sourceRoot: fixture.sourceRoot,
    inventory: fixture.inventory,
    palettes: fixture.palettes,
    mapKey,
  });
}

function asset(fixture, category) {
  return fixture.inventory.assets.find((entry) => entry.category === category);
}

function mapFile(fixture, index = 0) {
  return path.join(fixture.assetsRoot, fixture.inventory.maps[index].src);
}

function mutateMap(fixture, mutation, index = 0) {
  const filePath = mapFile(fixture, index);
  const map = JSON.parse(readFileSync(filePath, 'utf8'));
  mutation(map);
  writeFileSync(filePath, `${JSON.stringify(map, null, 2)}\n`);
}

test('exports the exact premium map keys and ten required categories', () => {
  assert.deepEqual(REQUIRED_PREMIUM_MAP_KEYS, Object.keys(MAP_BINDINGS));
  assert.deepEqual(REQUIRED_VISUAL_CATEGORIES, CATEGORIES);
});

test('production inventory is the exact independent 66-asset and eight-map authority', () => {
  const inventory = JSON.parse(readFileSync(productionInventoryPath, 'utf8'));
  assert.equal(EXPECTED_PRODUCTION_ASSETS.length, 66);
  assert.deepEqual(
    inventory.assets.map(({ assetId, category, bindings }) => [assetId, category, bindings]),
    EXPECTED_PRODUCTION_ASSETS,
  );
  assert.deepEqual(
    Object.fromEntries(inventory.maps.map(({ mapKey, backendMapKey, binding, scenarioConfig }) => [
      mapKey,
      [backendMapKey, binding, scenarioConfig],
    ])),
    EXPECTED_MAP_TRIPLES,
  );
});

test('builder rejects any drift from the exact production asset and map contracts before candidate gating', () => {
  const palette = JSON.parse(readFileSync(productionPalettePath, 'utf8'));
  const mutators = [
    ['missing asset', (inventory) => { inventory.assets = inventory.assets.filter(({ assetId }) => assetId !== 'furniture-chair'); }],
    ['wrong category', (inventory) => { inventory.assets.find(({ assetId }) => assetId === 'furniture-chair').category = 'object'; }],
    ['wrong binding', (inventory) => { inventory.assets.find(({ assetId }) => assetId === 'furniture-chair').bindings = ['furniture:chair-drift']; }],
    ['swapped backend map keys', (inventory) => {
      const action = inventory.maps.find(({ mapKey }) => mapKey === 'hospital-sala-accion');
      const cierre = inventory.maps.find(({ mapKey }) => mapKey === 'hospital-sala-cierre');
      [action.backendMapKey, cierre.backendMapKey] = [cierre.backendMapKey, action.backendMapKey];
    }],
    ['wrong runtime binding', (inventory) => {
      inventory.mapBindings['hospital-sala-accion'] = 'hospital-urgencias';
      inventory.maps.find(({ mapKey }) => mapKey === 'hospital-sala-accion').binding = 'hospital-urgencias';
    }],
    ['wrong scenario config', (inventory) => {
      inventory.maps.find(({ mapKey }) => mapKey === 'hospital-sala-accion').scenarioConfig = 'game/scenarios/hospital-urgencias.json';
    }],
  ];
  for (const [label, mutate] of mutators) {
    const inventory = JSON.parse(readFileSync(productionInventoryPath, 'utf8'));
    mutate(inventory);
    assert.throws(() => buildPremiumVisualManifest({
      assetsRoot: productionAssetsRoot,
      sourceRoot: productionAssetsRoot,
      inventory,
      palettes: [palette],
      requireCandidate: true,
    }), /premium visual v1 contract|required asset|map contract/i, label);
  }
});

test('builds a deterministic valid manifest from real PNG and Tiled bytes', () => {
  const fixture = createFixture();
  const first = build(fixture);
  const second = build(fixture);
  assert.deepEqual(first, second);
  assert.equal(first.manifest.schemaVersion, 1);
  assert.equal(first.manifest.status, 'candidate');
  assert.deepEqual(first.manifest.mapBindings, MAP_BINDINGS);
  assert.equal(first.manifest.maps.length, 8);
  assert.equal(first.manifest.assets.length, 66);
  assert.match(first.manifest.manifestHash, /^[a-f0-9]{64}$/);
  assert.match(first.readme, /hospital-urgencias/);
  assert.match(first.readme, /icon-consequence/);
  assert.match(first.readme, /[a-f0-9]{64}/);
});

test('fails when each one of the exactly ten visual categories is absent', async (t) => {
  for (const category of CATEGORIES) {
    await t.test(category, () => {
      const fixture = createFixture();
      fixture.inventory.assets = fixture.inventory.assets.filter((entry) => entry.category !== category);
      assert.throws(() => build(fixture), /required visual category|required asset missing|requires exactly 66/i);
    });
  }
});

test('rejects missing and extra premium map keys independently', () => {
  const missing = createFixture();
  delete missing.inventory.mapBindings['hospital-sala-cierre'];
  missing.inventory.maps = missing.inventory.maps.filter(({ mapKey }) => mapKey !== 'hospital-sala-cierre');
  assert.throws(() => build(missing), /hospital-sala-cierre.*missing|map key.*hospital-sala-cierre/i);

  const extra = createFixture();
  extra.inventory.mapBindings.extra = 'extra';
  extra.inventory.maps.push({ ...mapEntry('extra'), mapKey: 'extra', binding: 'extra' });
  assert.throws(() => build(extra), /extra.*map key|map key.*extra/i);
});

test('inspectVisualPng rejects absent, absolute, parent-escape, and realpath-escape outputs', () => {
  const absent = createFixture();
  const absentEntry = asset(absent, 'object');
  unlinkSync(path.join(absent.assetsRoot, absentEntry.src));
  assert.throws(
    () => inspectVisualPng({ assetsRoot: absent.assetsRoot, sourceRoot: absent.sourceRoot, entry: absentEntry, palette: absent.palette }),
    /object_acceso_restringido.*absent|missing/i,
  );

  for (const escapedSrc of ['C:\\outside.png', '../outside.png']) {
    const escaped = createFixture();
    const entry = { ...asset(escaped, 'object'), src: escapedSrc };
    assert.throws(
      () => inspectVisualPng({ assetsRoot: escaped.assetsRoot, sourceRoot: escaped.sourceRoot, entry, palette: escaped.palette }),
      /object_acceso_restringido.*absolute|escape|root/i,
    );
  }

  const symlinked = createFixture();
  const entry = asset(symlinked, 'object');
  unlinkSync(path.join(symlinked.assetsRoot, entry.src));
  const outsideDirectory = path.join(symlinked.root, 'outside-assets');
  writePng(path.join(outsideDirectory, path.basename(entry.src)));
  const linkDirectory = path.dirname(path.join(symlinked.assetsRoot, entry.src));
  rmSync(linkDirectory, { recursive: true, force: true });
  symlinkSync(outsideDirectory, linkDirectory, 'junction');
  assert.throws(
    () => inspectVisualPng({ assetsRoot: symlinked.assetsRoot, sourceRoot: symlinked.sourceRoot, entry, palette: symlinked.palette }),
    /object_acceso_restringido.*realpath|symlink|root/i,
  );
});

test('inspectVisualPng rejects broken provenance, wrong dimensions, indivisible grids, alpha, and palette drift', () => {
  {
    const fixture = createFixture();
    const entry = asset(fixture, 'tool');
    unlinkSync(path.join(fixture.sourceRoot, entry.sourceAsset));
    assert.throws(
      () => inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette }),
      /tool_pap.*source.*missing|source.*absent/i,
    );
  }
  {
    const fixture = createFixture();
    const entry = asset(fixture, 'tool');
    writePng(path.join(fixture.assetsRoot, entry.src), makePng(31, 32));
    assert.throws(
      () => inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette }),
      /tool_pap.*dimension|32x32/i,
    );
  }
  {
    const fixture = createFixture();
    const entry = asset(fixture, 'tileset');
    entry.tileGrid.tileWidth = 10;
    assert.throws(
      () => inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette }),
      /tileset-rpg-urban.*divis|tile.*grid/i,
    );
  }
  {
    const fixture = createFixture();
    const entry = asset(fixture, 'person');
    mutatePng(path.join(fixture.assetsRoot, entry.src), (png) => setPixel(png, 2, 2, rgba('#15131d', 128)));
    assert.throws(
      () => inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette }),
      /person-cuidadora-familia-vbg.*alpha.*bin/i,
    );
  }
  {
    const fixture = createFixture();
    const entry = asset(fixture, 'person');
    mutatePng(path.join(fixture.assetsRoot, entry.src), (png) => setPixel(png, 2, 2, [1, 2, 3, 255]));
    assert.throws(
      () => inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette }),
      /person-cuidadora-familia-vbg.*palette|#010203/i,
    );
  }
});

test('inspectVisualPng rejects fractional scale and blank source or license', () => {
  for (const mutate of [
    (entry) => { entry.logicalScale = 0.5; },
    (entry) => { entry.sourceAsset = ' '; },
    (entry) => { entry.license = ' '; },
  ]) {
    const fixture = createFixture();
    const entry = structuredClone(asset(fixture, 'prompt'));
    mutate(entry);
    assert.throws(
      () => inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette }),
      /prompt-interact.*logicalScale|sourceAsset|license|vac|blank/i,
    );
  }
});

test('source hashes come from real bytes and change after a permitted source mutation', () => {
  const fixture = createFixture();
  const entry = asset(fixture, 'furniture');
  const before = inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette });
  mutatePng(path.join(fixture.sourceRoot, entry.sourceAsset), (png) => setPixel(png, 1, 1, rgba('#433878')));
  const after = inspectVisualPng({ assetsRoot: fixture.assetsRoot, sourceRoot: fixture.sourceRoot, entry, palette: fixture.palette });
  assert.notEqual(before.sourceSha256, after.sourceSha256);
  assert.equal(before.sha256, after.sha256);
});

test('map provenance bytes come from sourceRoot and participate in deterministic hashes', () => {
  const fixture = createFixture();
  const mapEntryUnderTest = fixture.inventory.maps[0];
  const before = build(fixture).manifest;
  const sourcePath = path.join(fixture.sourceRoot, mapEntryUnderTest.sourceAsset);
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  source.sourceRevision = 2;
  writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  const after = build(fixture).manifest;
  const beforeMap = before.maps.find(({ mapKey }) => mapKey === mapEntryUnderTest.mapKey);
  const afterMap = after.maps.find(({ mapKey }) => mapKey === mapEntryUnderTest.mapKey);
  assert.notEqual(beforeMap.sourceSha256, afterMap.sourceSha256);
  assert.notEqual(beforeMap.contentHash, afterMap.contentHash);
  assert.notEqual(before.manifestHash, after.manifestHash);

  unlinkSync(sourcePath);
  assert.throws(() => build(fixture), /sourceAsset.*missing|source.*absent/i);
});

test('scenario config must canonically match the declared runtime binding', () => {
  const fixture = createFixture();
  const entry = fixture.inventory.maps[0];
  const scenarioPath = path.join(fixture.assetsRoot, entry.scenarioConfig);
  const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));
  scenario.scenarioKey = 'wrong-runtime-key';
  writeFileSync(scenarioPath, `${JSON.stringify(scenario, null, 2)}\n`);
  assert.throws(() => build(fixture), /scenarioConfig.*scenarioKey|runtime binding/i);
});

test('selected-map diagnostics enforce exact inventory, scenario semantics, and junction safety', () => {
  const valid = createFixture();
  const selected = inspectSelectedMap(valid);
  assert.equal(selected.entry.mapKey, valid.inventory.maps[0].mapKey);
  assert.match(selected.sourceSha256, /^[a-f0-9]{64}$/);

  const semanticDrift = createFixture();
  const semanticEntry = semanticDrift.inventory.maps[0];
  const semanticPath = path.join(semanticDrift.assetsRoot, semanticEntry.scenarioConfig);
  const scenario = JSON.parse(readFileSync(semanticPath, 'utf8'));
  scenario.startRoomKey = 'wrong-room';
  writeFileSync(semanticPath, `${JSON.stringify(scenario, null, 2)}\n`);
  assert.throws(() => inspectSelectedMap(semanticDrift, semanticEntry.mapKey), /scenarioConfig.*startRoomKey|runtime binding/i);

  const linked = createFixture();
  const linkedEntry = linked.inventory.maps[0];
  const linkedPath = path.join(linked.assetsRoot, linkedEntry.scenarioConfig);
  const linkedTarget = path.join(linked.assetsRoot, 'scenario-junction-target');
  unlinkSync(linkedPath);
  mkdirSync(linkedTarget, { recursive: true });
  symlinkSync(linkedTarget, linkedPath, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspectSelectedMap(linked, linkedEntry.mapKey), /symlink|junction|reparse/i);
});

test('selected-map diagnostics run PNG mechanics and provenance on every linked resource only', () => {
  const sourceMissing = createFixture();
  const linkedTileset = sourceMissing.inventory.assets[0];
  unlinkSync(path.join(sourceMissing.sourceRoot, linkedTileset.sourceAsset));
  assert.throws(() => inspectSelectedMap(sourceMissing), /tileset-rpg-urban.*sourceAsset.*(?:missing|absent)|sourceAsset.*tileset-rpg-urban/i);

  const alpha = createFixture();
  mutatePng(path.join(alpha.assetsRoot, alpha.inventory.assets[0].src), (png) => {
    setPixel(png, 1, 1, rgba('#15131d', 128));
  });
  assert.throws(() => inspectSelectedMap(alpha), /tileset-rpg-urban.*alpha.*128|alpha.*bin/i);

  const palette = createFixture();
  mutatePng(path.join(palette.assetsRoot, palette.inventory.assets[0].src), (png) => {
    setPixel(png, 1, 1, [1, 2, 3, 255]);
  });
  assert.throws(() => inspectSelectedMap(palette), /tileset-rpg-urban.*palette|#010203/i);

  const linkedSource = createFixture();
  const sourceDirectory = path.dirname(path.join(linkedSource.sourceRoot, linkedSource.inventory.assets[0].sourceAsset));
  const sourceTarget = path.join(linkedSource.sourceRoot, 'real-linked-tiles-source');
  renameSync(sourceDirectory, sourceTarget);
  symlinkSync(sourceTarget, sourceDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inspectSelectedMap(linkedSource), /tileset-rpg-urban.*(?:symlink|junction|reparse)|(?:symlink|junction|reparse).*tileset-rpg-urban/i);

  const unrelated = createFixture();
  const unlinked = unrelated.inventory.assets.find(({ assetId }) => assetId === 'object_expediente');
  mutatePng(path.join(unrelated.assetsRoot, unlinked.src), (png) => setPixel(png, 1, 1, rgba('#15131d', 128)));
  assert.doesNotThrow(() => inspectSelectedMap(unrelated));
});

test('selected-map diagnostics run JSON provenance on linked external Tiled resources', () => {
  const fixture = createFixture();
  mutateMap(fixture, (map) => { map.tilesets = [{ firstgid: 1, source: '../tiles/external.tsj' }]; });
  const resource = {
    assetId: 'external-tileset-json',
    category: 'tileset',
    src: 'tiles/external.tsj',
    sourceAsset: 'tiles/external.tsj',
    license: 'SIEP-INTERNAL',
    logicalScale: 1,
    paletteId: 'siep-master-v1',
    bindings: ['external-tileset-json'],
    reviewStatus: 'candidate',
  };
  fixture.inventory.tiledResources.push(resource);
  const bytes = Buffer.from(`${JSON.stringify({
    type: 'tileset', name: 'fixture', image: 'fixture.png',
    imagewidth: 32, imageheight: 32, tilewidth: 16, tileheight: 16,
    columns: 2, tilecount: 4, margin: 0, spacing: 0,
  }, null, 2)}\n`);
  mkdirSync(path.dirname(path.join(fixture.assetsRoot, resource.src)), { recursive: true });
  mkdirSync(path.dirname(path.join(fixture.sourceRoot, resource.sourceAsset)), { recursive: true });
  writeFileSync(path.join(fixture.assetsRoot, resource.src), bytes);
  writeFileSync(path.join(fixture.sourceRoot, resource.sourceAsset), bytes);
  unlinkSync(path.join(fixture.sourceRoot, resource.sourceAsset));
  assert.throws(() => inspectSelectedMap(fixture), /external-tileset-json.*sourceAsset.*(?:missing|absent)|sourceAsset.*external-tileset-json/i);
});

test('visual roots reject internal junctions instead of silently following them', () => {
  const fixture = createFixture();
  const entry = asset(fixture, 'object');
  const originalDirectory = path.dirname(path.join(fixture.assetsRoot, entry.src));
  const internalTarget = path.join(fixture.assetsRoot, 'internal-target');
  writePng(path.join(internalTarget, path.basename(entry.src)));
  rmSync(originalDirectory, { recursive: true, force: true });
  symlinkSync(internalTarget, originalDirectory, 'junction');
  assert.throws(() => inspectVisualPng({
    assetsRoot: fixture.assetsRoot,
    sourceRoot: fixture.sourceRoot,
    entry,
    palette: fixture.palette,
  }), /symlink|junction|reparse/i);
});

test('builder rejects duplicate assetId, src, and binding without overwriting', () => {
  for (const field of ['assetId', 'src', 'binding']) {
    const fixture = createFixture();
    const first = fixture.inventory.assets[0];
    const second = fixture.inventory.assets[1];
    if (field === 'binding') second.bindings = [...first.bindings];
    else second[field] = first[field];
    assert.throws(() => build(fixture), new RegExp(`${field}.*duplic|duplic.*${field}`, 'i'));
  }
});

test('accepts the exact required underscore asset identifiers without alternate interpretation', () => {
  const fixture = createFixture();
  assert.doesNotThrow(() => build(fixture));
});

test('inspectTiledMap rejects malformed JSON and invalid positive integer map geometry', () => {
  const malformed = createFixture();
  writeFileSync(mapFile(malformed), '{not-json');
  assert.throws(
    () => build(malformed),
    /map-hospital-urgencias.*Tiled.*JSON|not-json|invalid/i,
  );

  for (const mutation of [
    (map) => { map.width = 0; },
    (map) => { map.height = 1.5; },
    (map) => { map.tilewidth = -1; },
    (map) => { map.tileheight = 0; },
  ]) {
    const fixture = createFixture();
    mutateMap(fixture, mutation);
    assert.throws(() => build(fixture), /map-hospital-urgencias.*positive integer|width|height|tile/i);
  }
});

test('inspectTiledMap applies common metadata validation in selected-map diagnostics', () => {
  const fixture = createFixture();
  fixture.inventory.maps[0].logicalScale = 0.5;
  assert.throws(() => inspectTiledMap({
    assetsRoot: fixture.assetsRoot,
    mapEntry: fixture.inventory.maps[0],
    inventoryBySrc: new Map(fixture.inventory.assets.map((entry) => [entry.src, entry])),
  }), /map-hospital-urgencias.*logicalScale|logicalScale.*integer/i);
});

test('inspectTiledMap follows embedded and inventoried external tilesets and all images', () => {
  const fixture = createFixture();
  const embedded = inspectTiledMap({
    assetsRoot: fixture.assetsRoot,
    mapEntry: fixture.inventory.maps[0],
    inventoryBySrc: new Map(fixture.inventory.assets.map((entry) => [entry.src, entry])),
  });
  assert.deepEqual(embedded.transitive.map(({ src }) => src), [
    'maps/hospital-urgencias.json',
    'tiles/fixture.png',
  ]);

  mutateMap(fixture, (map) => { map.tilesets = [{ firstgid: 1, source: '../tiles/external.tsj' }]; });
  const resource = {
    assetId: 'external-tileset-json',
    category: 'tileset',
    src: 'tiles/external.tsj',
    sourceAsset: 'tiles/external.tsj',
    license: 'SIEP-INTERNAL',
    logicalScale: 1,
    paletteId: 'siep-master-v1',
    bindings: ['external-tileset-json'],
    reviewStatus: 'candidate',
  };
  fixture.inventory.tiledResources.push(resource);
  writeFileSync(path.join(fixture.assetsRoot, resource.src), `${JSON.stringify({
    type: 'tileset',
    name: 'fixture',
    image: 'fixture.png',
    imagewidth: 32,
    imageheight: 32,
    tilewidth: 16,
    tileheight: 16,
    columns: 2,
    tilecount: 4,
    margin: 0,
    spacing: 0,
  }, null, 2)}\n`);
  writeFileSync(path.join(fixture.sourceRoot, resource.sourceAsset), readFileSync(path.join(fixture.assetsRoot, resource.src)));
  const external = build(fixture).manifest.maps.find(({ mapKey }) => mapKey === 'hospital-urgencias');
  assert.deepEqual(external.transitive.map(({ src }) => src), [
    'maps/hospital-urgencias.json',
    'tiles/external.tsj',
    'tiles/fixture.png',
  ]);
});

test('rejects un-inventoried or broken transitive Tiled paths', () => {
  const unlisted = createFixture();
  writePng(path.join(unlisted.assetsRoot, 'tiles', 'unlisted.png'));
  mutateMap(unlisted, (map) => { map.tilesets[0].image = '../tiles/unlisted.png'; });
  assert.throws(() => build(unlisted), /unlisted\.png.*inventor|inventor.*unlisted\.png/i);

  const broken = createFixture();
  mutateMap(broken, (map) => { map.tilesets[0].image = '../tiles/missing.png'; });
  broken.inventory.assets[0].src = 'tiles/missing.png';
  assert.throws(() => build(broken), /missing\.png.*broken|missing|absent/i);
});

test('rejects fractional Tiled margin, spacing, offset, scale, smoothing, and linear filtering', () => {
  const mutations = [
    (map) => { map.tilesets[0].margin = 0.5; },
    (map) => { map.tilesets[0].spacing = 0.5; },
    (map) => { map.tilesets[0].tileoffset = { x: 0.5, y: 0 }; },
    (map) => { map.layers[0].offsetx = 0.5; },
    (map) => { map.layers[0].scaleX = 0.5; },
    (map) => { map.tilesets[0].smoothing = true; },
    (map) => { map.tilesets[0].filter = 'linear'; },
  ];
  for (const mutation of mutations) {
    const fixture = createFixture();
    mutateMap(fixture, mutation);
    assert.throws(() => build(fixture), /fractional|integer|smoothing|linear|nearest|scale|offset|margin|spacing/i);
  }
});

test('accepts integer Tiled margin and spacing when the PNG geometry is exactly divisible', () => {
  const fixture = createFixture();
  const entry = asset(fixture, 'tileset');
  entry.expectedDimensions = { width: 35, height: 35 };
  delete entry.tileGrid;
  writePng(path.join(fixture.assetsRoot, entry.src), makePng(35, 35));
  writePng(path.join(fixture.sourceRoot, entry.sourceAsset), makePng(35, 35));
  for (let index = 0; index < fixture.inventory.maps.length; index += 1) {
    mutateMap(fixture, (map) => {
      map.tilesets[0].imagewidth = 35;
      map.tilesets[0].imageheight = 35;
      map.tilesets[0].margin = 1;
      map.tilesets[0].spacing = 1;
    }, index);
  }
  assert.doesNotThrow(() => build(fixture));
});

test('rejects Tiled gid ranges and PNG/tile geometry mismatch', () => {
  const gid = createFixture();
  mutateMap(gid, (map) => { map.layers[0].data[0] = 5; });
  assert.throws(() => build(gid), /gid.*5.*range|range.*gid/i);

  const mismatch = createFixture();
  const entry = asset(mismatch, 'tileset');
  entry.expectedDimensions.width = 30;
  entry.tileGrid.columns = 1;
  writePng(path.join(mismatch.assetsRoot, entry.src), makePng(30, 32));
  assert.throws(() => build(mismatch), /fixture\.png.*divis|tile.*geometry|tile.*grid|imagewidth/i);
});

test('rejects unreviewed only at the candidate gate and never mutates reviewStatus', () => {
  const fixture = createFixture();
  fixture.inventory.status = 'unreviewed';
  fixture.inventory.assets[3].reviewStatus = 'unreviewed';
  const before = structuredClone(fixture.inventory);
  assert.doesNotThrow(() => build(fixture, { requireCandidate: false }));
  assert.deepEqual(fixture.inventory, before);
  assert.throws(() => build(fixture, { requireCandidate: true }), /unreviewed|candidate.*asset/i);
  assert.deepEqual(fixture.inventory, before);
});

test('manifest byte hashes change after one permitted output pixel mutation', () => {
  const fixture = createFixture();
  const before = build(fixture).manifest;
  const entry = asset(fixture, 'object');
  mutatePng(path.join(fixture.assetsRoot, entry.src), (png) => setPixel(png, 1, 1, rgba('#433878')));
  const after = build(fixture).manifest;
  const beforeAsset = before.assets.find(({ assetId }) => assetId === entry.assetId);
  const afterAsset = after.assets.find(({ assetId }) => assetId === entry.assetId);
  assert.notEqual(beforeAsset.sha256, afterAsset.sha256);
  assert.notEqual(before.manifestHash, after.manifestHash);
});

test('parses strict mutually exclusive visual validator modes and required values', () => {
  assert.deepEqual(parsePremiumVisualCliArgs(['--asset', 'object-expediente']), {
    mode: 'asset', assetId: 'object-expediente',
  });
  assert.deepEqual(parsePremiumVisualCliArgs(['--map', 'hospital-urgencias']), {
    mode: 'map', mapKey: 'hospital-urgencias',
  });
  assert.deepEqual(parsePremiumVisualCliArgs(['--write']), { mode: 'write' });
  assert.deepEqual(parsePremiumVisualCliArgs(['--check']), { mode: 'check' });
  for (const args of [
    [], ['--asset'], ['--map'], ['--write', '--check'],
    ['--asset', 'a', '--map', 'b'], ['--asset', 'a', '--check'], ['--unknown'],
  ]) {
    assert.throws(() => parsePremiumVisualCliArgs(args), /argument|value|modo|mutuamente|exclusive|unknown/i);
  }
});

function testCanonicalize(value) {
  if (Array.isArray(value)) return value.map(testCanonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, testCanonicalize(value[key])]));
  }
  return value;
}

function testCanonicalHash(value) {
  return createHash('sha256').update(JSON.stringify(testCanonicalize(value))).digest('hex');
}

function testBytesHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function contactDirections(columns, rowOffset = 0) {
  return Object.fromEntries(['down', 'left', 'right', 'up'].map((direction, row) => [
    direction,
    [(row + rowOffset) * columns],
  ]));
}

const CONTACT_COLORS = ['#15131d', '#433878', '#ffffff'];

function writeContactVariant(assetsRoot, relativeRoot, colorOffset) {
  const sheetShapes = {
    idle: [4, 4], walk: [6, 4], talk: [4, 4], interact: [4, 4], turn: [3, 4], react: [4, 16],
  };
  const sheets = {};
  for (const [index, [sheetId, [columns, rows]]] of Object.entries(sheetShapes).entries()) {
    const src = `${relativeRoot}/${sheetId}.png`;
    const bytes = makePng(columns * 2, rows * 2, CONTACT_COLORS[(colorOffset + index) % CONTACT_COLORS.length]);
    writePng(path.join(assetsRoot, src), bytes);
    sheets[sheetId] = {
      id: sheetId, src: `/assets/${src}`, width: columns * 2, height: rows * 2,
      frameWidth: 2, frameHeight: 2, columns, rows, sha256: testBytesHash(bytes),
    };
  }
  const portraitSrc = `${relativeRoot}/portrait.png`;
  const portraitBytes = makePng(8, 16, CONTACT_COLORS[(colorOffset + 7) % CONTACT_COLORS.length]);
  writePng(path.join(assetsRoot, portraitSrc), portraitBytes);
  const portraitSheet = {
    id: 'portrait', src: `/assets/${portraitSrc}`, width: 8, height: 16,
    frameWidth: 2, frameHeight: 2, columns: 4, rows: 8, sha256: testBytesHash(portraitBytes),
  };
  const variantBody = {
    variantId: 'base',
    sheets,
    animations: {
      idle: { id: 'idle', sheetId: 'idle', directions: contactDirections(4) },
      walk: { id: 'walk', sheetId: 'walk', directions: contactDirections(6) },
      talk: { id: 'talk', sheetId: 'talk', directions: contactDirections(4) },
      interact: { id: 'interact', sheetId: 'interact', directions: contactDirections(4) },
      turn: { id: 'turn', sheetId: 'turn', directions: contactDirections(3) },
      reactRelief: { id: 'reactRelief', sheetId: 'react', directions: contactDirections(4, 0) },
      reactSteady: { id: 'reactSteady', sheetId: 'react', directions: contactDirections(4, 4) },
      reactTension: { id: 'reactTension', sheetId: 'react', directions: contactDirections(4, 8) },
      reactRupture: { id: 'reactRupture', sheetId: 'react', directions: contactDirections(4, 12) },
    },
    portrait: {
      sheet: portraitSheet,
      states: Object.fromEntries([
        'neutral', 'focused', 'concerned', 'relieved', 'relief', 'steady', 'tension', 'rupture',
      ].map((state, row) => [state, [row * 4]])),
    },
  };
  return { ...variantBody, contentHash: testCanonicalHash(variantBody) };
}

function createContactFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'siep-contact-sheets-'));
  roots.add(root);
  const assetsRoot = path.join(root, 'assets');
  const outputRoot = path.join(root, 'contact-sheets');
  const characterManifestPath = path.join(root, 'character-manifest.json');
  const visualManifestPath = path.join(root, 'visual-manifest.json');
  const characterVariant = writeContactVariant(assetsRoot, 'characters/v1/valentina/base', 0);
  const actorVariant = writeContactVariant(assetsRoot, 'characters/v1/actors/cuidadora/base', 3);
  const characterBody = {
    schemaVersion: 1,
    identities: [{ characterId: 'valentina', variants: [characterVariant] }],
    actorVisuals: [{ visualId: 'cuidadora', variant: actorVariant }],
    actorMappings: {
      'familia-crisis': 'cuidadora',
      'familia-duelo': 'cuidadora',
    },
  };
  const characterManifest = { ...characterBody, manifestHash: testCanonicalHash(characterBody) };
  writeFileSync(characterManifestPath, JSON.stringify(characterManifest));

  const visualSpecs = [
    ['chair', 'furniture', 'game/furniture/chair.png'],
    ['dialogue-frame', 'hud-frame', 'game/ui/premium-v1/dialogue-frame.png'],
    ['icon-objective', 'hud-icon', 'game/ui/premium-v1/icon-objective.png'],
  ];
  const assets = visualSpecs.map(([assetId, category, src], index) => {
    const bytes = makePng(8, 8, CONTACT_COLORS[(index + 1) % CONTACT_COLORS.length]);
    writePng(path.join(assetsRoot, src), bytes);
    return { assetId, category, src, sha256: testBytesHash(bytes) };
  });
  assets.push({
    assetId: 'person-cuidadora',
    category: 'person',
    src: actorVariant.sheets.idle.src.slice('/assets/'.length),
    sha256: actorVariant.sheets.idle.sha256,
    bindings: ['person:familia-duelo', 'person:familia-crisis'],
  });
  const visualBody = { schemaVersion: 1, assets };
  const visualManifest = { ...visualBody, manifestHash: testCanonicalHash(visualBody) };
  writeFileSync(visualManifestPath, JSON.stringify(visualManifest));
  return {
    root, assetsRoot, outputRoot, characterManifestPath, visualManifestPath,
    characterManifest, visualManifest,
  };
}

function rewriteValidatedManifest(filePath, mutate) {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8'));
  mutate(manifest);
  const body = { ...manifest };
  delete body.manifestHash;
  manifest.manifestHash = testCanonicalHash(body);
  writeFileSync(filePath, JSON.stringify(manifest));
}

test('renders exact four deterministic contact sheets with complete representative 1x and 2x coverage', () => {
  const fixture = createContactFixture();
  const first = renderPremiumContactSheets(fixture);
  const bytes = Object.fromEntries(Object.entries(first.outputs).map(([name, output]) => [name, readFileSync(output.path)]));
  const second = renderPremiumContactSheets(fixture);

  assert.deepEqual(Object.keys(first.outputs), ['characters.png', 'npc.png', 'world-assets.png', 'hud-assets.png']);
  for (const [name, output] of Object.entries(second.outputs)) {
    assert.equal(existsSync(output.path), true);
    assert.deepEqual(readFileSync(output.path), bytes[name]);
    for (const cell of output.cells) {
      assert.deepEqual(cell.scales, [1, 2]);
      assert.equal(cell.displayWidth, cell.sourceWidth * 3 + 4);
      assert.equal(cell.displayHeight, cell.sourceHeight * 2);
      assert.match(cell.label, /^[a-z0-9_-]+ [a-f0-9]{12}$/);
      assert.match(cell.sourceSha256, /^[a-f0-9]{64}$/);
    }
  }

  const expectedSamples = [
    'idle-down', 'idle-left', 'idle-right', 'idle-up',
    'walk-down', 'talk-down', 'interact-down', 'turn-down',
    'react-relief', 'react-steady', 'react-tension', 'react-rupture',
    'portrait-neutral', 'portrait-focused', 'portrait-concerned', 'portrait-relieved',
    'portrait-relief', 'portrait-steady', 'portrait-tension', 'portrait-rupture',
  ];
  assert.deepEqual(first.outputs['characters.png'].cells.map(({ sampleId }) => sampleId), expectedSamples);
  assert.deepEqual(first.outputs['npc.png'].cells.map(({ sampleId }) => sampleId), expectedSamples);
  assert.deepEqual(first.outputs['world-assets.png'].cells.map(({ assetId }) => assetId), ['chair']);
  assert.deepEqual(first.outputs['hud-assets.png'].cells.map(({ assetId }) => assetId), ['dialogue-frame', 'icon-objective']);
});

test('contact sheets fail closed on missing, extra, src, hash, or binding person-to-actor drift', () => {
  const cases = [
    ['missing person', (manifest) => {
      manifest.assets = manifest.assets.filter(({ assetId }) => assetId !== 'person-cuidadora');
    }, /person-cuidadora.*(?:missing|absent)|(?:missing|absent).*person-cuidadora/i],
    ['extra person', (manifest) => {
      manifest.assets.push({
        assetId: 'person-inventado', category: 'person', src: 'missing/person.png',
        sha256: 'a'.repeat(64), bindings: ['person:actor-inventado'],
      });
    }, /person-inventado.*(?:extra|unknown|actor)|(?:extra|unknown).*person-inventado/i],
    ['src mismatch', (manifest) => {
      const person = manifest.assets.find(({ assetId }) => assetId === 'person-cuidadora');
      person.src = 'missing/person.png';
      person.sha256 = 'b'.repeat(64);
    }, /person-cuidadora.*(?:src|idle)|(?:src|idle).*person-cuidadora/i],
    ['hash mismatch', (manifest) => {
      manifest.assets.find(({ assetId }) => assetId === 'person-cuidadora').sha256 = 'c'.repeat(64);
    }, /person-cuidadora.*sha256.*(?:drift|mismatch)|sha256.*person-cuidadora/i],
    ['binding mismatch', (manifest) => {
      manifest.assets.find(({ assetId }) => assetId === 'person-cuidadora').bindings = ['person:familia-duelo'];
    }, /person-cuidadora.*bindings.*(?:drift|mismatch)|bindings.*person-cuidadora/i],
  ];
  for (const [name, mutate, expected] of cases) {
    const fixture = createContactFixture();
    rewriteValidatedManifest(fixture.visualManifestPath, mutate);
    assert.throws(() => renderPremiumContactSheets(fixture), expected, name);
    assert.equal(existsSync(fixture.outputRoot), false, `${name} must not write output`);
  }
});

test('contact sheets reject fake manifest, variant, and asset hashes before writing any output', () => {
  const fakeManifest = createContactFixture();
  const parsed = JSON.parse(readFileSync(fakeManifest.characterManifestPath, 'utf8'));
  parsed.manifestHash = 'f'.repeat(64);
  writeFileSync(fakeManifest.characterManifestPath, JSON.stringify(parsed));
  assert.throws(() => renderPremiumContactSheets(fakeManifest), /character manifest.*manifestHash.*(?:drift|mismatch)|manifestHash.*character/i);
  assert.equal(existsSync(fakeManifest.outputRoot), false);

  const fakeVariant = createContactFixture();
  rewriteValidatedManifest(fakeVariant.characterManifestPath, (manifest) => {
    manifest.identities[0].variants[0].contentHash = 'e'.repeat(64);
  });
  assert.throws(() => renderPremiumContactSheets(fakeVariant), /valentina.*contentHash.*(?:drift|mismatch)|contentHash.*valentina/i);
  assert.equal(existsSync(fakeVariant.outputRoot), false);

  const staleAsset = createContactFixture();
  const hud = staleAsset.visualManifest.assets.find(({ assetId }) => assetId === 'icon-objective');
  writePng(path.join(staleAsset.assetsRoot, hud.src), makePng(8, 8, '#ffffff'));
  assert.throws(() => renderPremiumContactSheets(staleAsset), /icon-objective.*sha256.*(?:drift|mismatch)|sha256.*icon-objective/i);
  assert.equal(existsSync(staleAsset.outputRoot), false);
});

test('contact sheets reject assetsRoot and asset-path junctions, internal or external', () => {
  const linkedRoot = createContactFixture();
  const realAssets = path.join(linkedRoot.root, 'real-assets');
  renameSync(linkedRoot.assetsRoot, realAssets);
  symlinkSync(realAssets, linkedRoot.assetsRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => renderPremiumContactSheets(linkedRoot), /assetsRoot.*(?:symlink|junction|reparse)|(?:symlink|junction|reparse).*assetsRoot/i);

  for (const location of ['internal', 'external']) {
    const linkedAsset = createContactFixture();
    const entry = linkedAsset.visualManifest.assets.find(({ assetId }) => assetId === 'chair');
    const assetPath = path.join(linkedAsset.assetsRoot, entry.src);
    const target = location === 'internal'
      ? path.join(linkedAsset.assetsRoot, 'linked-chair-target')
      : path.join(linkedAsset.root, 'linked-chair-target');
    unlinkSync(assetPath);
    mkdirSync(target, { recursive: true });
    symlinkSync(target, assetPath, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => renderPremiumContactSheets(linkedAsset), /chair.*(?:symlink|junction|reparse)|(?:symlink|junction|reparse).*chair/i);
    assert.equal(existsSync(linkedAsset.outputRoot), false);
  }
});

test('contact sheet renderer fails clearly when a validated manifest is absent', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'siep-contact-sheets-missing-'));
  roots.add(root);
  assert.throws(() => renderPremiumContactSheets({
    assetsRoot: root,
    characterManifestPath: path.join(root, 'missing-character.json'),
    visualManifestPath: path.join(root, 'missing-visual.json'),
    outputRoot: path.join(root, 'out'),
  }), /character manifest.*missing|missing-character/i);
});
