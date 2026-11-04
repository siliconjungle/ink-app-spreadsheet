#!/usr/bin/env node
// Train the recovery hole in csv.ink, freeze it, and vendor the JavaScript module.
//
//   INK_COMPILER=/path/to/ink node ink/build.mjs
//
// Steps: regenerate the labelled broken files (fixed seeds), fit the hole with
// `ink train --objective recovery`, freeze the trained table with
// `ink build-model --freeze-roots __learned`, score the held-out files, then copy
// the frozen module into src/vendor/csv-recovery/ with a receipt.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const build = join(here, 'build');
const vendor = join(root, 'src/vendor/csv-recovery');
const ink = process.env.INK_COMPILER || 'ink';
const run = (command, args) => execFileSync(command, args, { cwd: here, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
run('python3', ['recovery-data.py', '--seed', '1', '--count', '32', '-o', 'recovery-train.json']);
run('python3', ['recovery-data.py', '--seed', '2', '--count', '32', '-o', 'recovery-heldout.json']);

const receipt = JSON.parse(run(ink, ['train', 'csv.ink', '--objective', 'recovery', '--data', 'recovery-train.json',
  '--budget', process.env.INK_TRAIN_BUDGET || '2000', '-o', join(build, 'model.snapshot')]));
run(ink, ['build-model', 'csv.ink', join(build, 'model.snapshot.trace.json'), '--freeze-roots', '__learned',
  '--target', 'javascript', '-o', join(build, 'frozen')]);

// Held-out rows wrong before and after training, using exact reference execution.
const heldout = JSON.parse(readFileSync(join(here, 'recovery-heldout.json'), 'utf8'));
const script = join(build, 'heldout.json');
writeFileSync(script, JSON.stringify([{ call: '__objective_recovery', args: heldout }]));
const score = (extra) => JSON.parse(run(ink, ['execute', 'csv.ink', script, ...extra]))[0].result;
const before = score([]);
const after = score(['--restore', join(build, 'model.snapshot')]);
const learned = JSON.parse(readFileSync(join(build, 'model.snapshot.trace.json'), 'utf8')).observations[0].args[0];

rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor, { recursive: true });
const files = ['program.mjs', 'program.mjs.source.mjs', 'program.mjs.initial-state.mjs', 'program.mjs.initial.snapshot'];
for (const file of files) copyFileSync(join(build, 'frozen', file), join(vendor, file));
writeFileSync(join(vendor, 'receipt.json'), JSON.stringify({
  schema: 1,
  source: 'ink/csv.ink',
  source_sha256: sha(join(here, 'csv.ink')),
  compiler: run(ink, ['--version']).trim(),
  training: {
    objective: receipt.objective,
    files: 32,
    initial_wrong_rows: receipt.initial_loss,
    final_wrong_rows: receipt.final_loss,
    evaluations: receipt.evaluations,
    seed: receipt.seed,
  },
  heldout: { files: heldout[0].length, wrong_rows_untrained: before, wrong_rows_trained: after },
  learned_table: learned.recover,
  holes: receipt.holes,
  files: Object.fromEntries(files.map((file) => [file, sha(join(vendor, file))])),
}, null, 2) + '\n');
console.log(`trained: ${receipt.initial_loss} -> ${receipt.final_loss} wrong rows; held-out: ${before} -> ${after}`);
