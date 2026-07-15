#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertDerivedArtifact,
  buildCharacterManifest,
  parseCharacterCliArgs,
} from './character-manifest-lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const charactersRoot = path.join(frontendRoot, 'src', 'assets', 'characters');
const assetsRoot = path.join(charactersRoot, 'v1');

function readJson(fileName, label) {
  const filePath = path.join(assetsRoot, fileName);
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} inválido en ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function run() {
  const options = parseCharacterCliArgs(process.argv.slice(2));
  const result = buildCharacterManifest({
    assetsRoot,
    provenanceRoot: charactersRoot,
    roster: readJson('roster.v1.json', 'roster'),
    actorRoster: readJson('actor-roster.v1.json', 'actor roster'),
    palette: readJson('palette.v1.json', 'palette'),
    clinicalEmotionMap: readJson('clinical-emotion-map.v1.json', 'clinical emotion map'),
    ...(options.onlyCharacter === undefined ? {} : { onlyCharacter: options.onlyCharacter }),
    ...(options.onlyActor === undefined ? {} : { onlyActor: options.onlyActor }),
  });
  const manifestPath = path.join(assetsRoot, 'manifest.json');
  const readmePath = path.join(assetsRoot, 'README.md');

  if (options.mode === 'write') {
    writeFileSync(manifestPath, result.manifestJson);
    writeFileSync(readmePath, result.readme);
    process.stdout.write(`written ${manifestPath}\nwritten ${readmePath}\n`);
    return;
  }
  if (options.mode === 'check') {
    assertDerivedArtifact(manifestPath, result.manifestJson, 'character manifest');
    assertDerivedArtifact(readmePath, result.readme, 'character README');
    process.stdout.write(`character manifest OK ${result.manifest.manifestHash}\n`);
    return;
  }

  for (const identity of result.manifest.identities) {
    process.stdout.write(`character ${identity.characterId} ${identity.variants[0].contentHash}\n`);
  }
  for (const visual of result.manifest.actorVisuals) {
    const actors = Object.entries(result.manifest.actorMappings)
      .filter(([, visualId]) => visualId === visual.visualId)
      .map(([actorId]) => actorId)
      .join(',');
    process.stdout.write(`actor ${actors} -> ${visual.visualId} ${visual.variant.contentHash}\n`);
  }
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
