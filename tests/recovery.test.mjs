import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDelimited, parseDelimitedRecovering } from '../src/model.mjs';
import { loadRecovery } from '../src/csv-recovery.mjs';

const recover = await loadRecovery();

test('files PapaParse accepts import exactly as before and report no repairs', () => {
  for (const [text, name] of [
    ['Name,Notes,Value\r\n"James, J","hello\nworld",12\r\nZoë,"""quoted""",=C2*2', 'a.csv'],
    ['a\tb\n1\t2', 'sample.tsv'],
    ['id,name,score\n1,"a ""b"" c",3\n2,d,4\n3,e,5\n', 'escaped.csv'],
  ]) {
    const result = parseDelimitedRecovering(text, name, recover);
    assert.deepEqual(result.rows, parseDelimited(text, name));
    assert.deepEqual(result.recovered, []);
  }
});

test('the Ink parser repairs files a strict parser rejects and says where', () => {
  const inner = parseDelimitedRecovering('Name,Note\nAna,"said "hi" twice"\nKim,ok', 'notes.csv', recover);
  assert.deepEqual(inner.rows, [['Name', 'Note'], ['Ana', 'said "hi" twice'], ['Kim', 'ok']]);
  assert.deepEqual(inner.recovered, [2]);
  const inch = parseDelimitedRecovering('Item,Size\nTV,"55" screen"\nMonitor,27" panel', 'sizes.csv', recover);
  assert.deepEqual(inch.rows.at(-1), ['Monitor', '27" panel']);
  const open = parseDelimitedRecovering('a,b\n1,"unterminated', 'open.csv', recover);
  assert.deepEqual(open.rows, [['a', 'b'], ['1', 'unterminated']]);
  assert.deepEqual(open.recovered, [2]);
  // Without the parser the strict behaviour is unchanged.
  assert.throws(() => parseDelimitedRecovering('a,b\n1,"unterminated', 'open.csv'), /Could not read/);
});

test('held-out broken files are repaired by the trained table', () => {
  const cases = JSON.parse(readFileSync(new URL('../ink/recovery-heldout.json', import.meta.url), 'utf8'))[0];
  let wrong = 0;
  for (const c of cases) {
    const rows = recover(c.text, c.delimiter).rows;
    wrong += JSON.stringify(rows) === JSON.stringify(c.cells) ? 0 : 1;
  }
  assert.equal(wrong, 0, `${wrong} of ${cases.length} held-out files differ from their intended grid`);
});
