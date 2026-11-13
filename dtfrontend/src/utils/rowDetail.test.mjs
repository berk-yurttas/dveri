// Run with: node --test src/utils/rowDetail.test.mjs   (from dtfrontend/)
// Zero-dependency: transpiles rowDetail.ts with the project's TypeScript compiler.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('./rowDetail.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))

const columns = ['part_no', 'order', 'qty']
const row = ["mm-0001", "25Y'01", 4]

test('fillRowPlaceholders quotes and escapes injected values', () => {
  const sql = "SELECT * FROM t WHERE p = {{part_no}} AND o = {{order}} AND p2 = {{part_no}}"
  assert.equal(
    mod.fillRowPlaceholders(sql, ['part_no', 'order'], columns, row),
    "SELECT * FROM t WHERE p = 'mm-0001' AND o = '25Y''01' AND p2 = 'mm-0001'"
  )
})

test('fillRowPlaceholders leaves fields that are not in paramFields or columns untouched', () => {
  assert.equal(mod.fillRowPlaceholders('{{qty}} {{missing}}', ['missing'], columns, row), '{{qty}} {{missing}}')
})

test('fillRowPlaceholders handles regex characters in column names and NULL values', () => {
  assert.equal(mod.fillRowPlaceholders('x = {{a.b(1)}}', ['a.b(1)'], ['a.b(1)'], [null]), 'x = NULL')
})

test('fillUrlTemplate URL-encodes column values and keeps unknown placeholders', () => {
  assert.equal(
    mod.fillUrlTemplate('/docs/cmm/{{part_no}}.pdf?o={{order}}&x={{nope}}', columns, row),
    "/docs/cmm/mm-0001.pdf?o=25Y'01&x={{nope}}".replace("25Y'01", encodeURIComponent("25Y'01"))
  )
})

test('isSafeHref allows http(s), relative and blocks javascript/data', () => {
  assert.equal(mod.isSafeHref('https://x.y/a.pdf'), true)
  assert.equal(mod.isSafeHref('/docs/a.pdf'), true)
  assert.equal(mod.isSafeHref('docs/a.pdf'), true)
  assert.equal(mod.isSafeHref(' JavaScript:alert(1)'), false)
  assert.equal(mod.isSafeHref('data:text/html,x'), false)
  assert.equal(mod.isSafeHref(''), false)
})

test('rowToDetailItems maps first result row to label/value pairs and formats null as dash', () => {
  assert.deepEqual(mod.rowToDetailItems(['A', 'B'], [[1, null], [9, 9]]), [
    { label: 'A', value: '1' },
    { label: 'B', value: '-' },
  ])
  assert.deepEqual(mod.rowToDetailItems(['A'], []), [])
})

test('buildOperationSteps uses first column as title and second as subtitle', () => {
  assert.deepEqual(mod.buildOperationSteps(['step', 'note'], [['Malzeme', 'Not alındı'], ['CMM', null]]), [
    { title: 'Malzeme', subtitle: 'Not alındı' },
    { title: 'CMM', subtitle: '' },
  ])
  assert.deepEqual(mod.buildOperationSteps(['only'], [['İşleme']]), [{ title: 'İşleme', subtitle: '' }])
})

test('computeDurationBars: value/total columns give a clamped percent and a "col / col" label', () => {
  assert.deepEqual(mod.computeDurationBars(['Üretim süresi', 'Toplam süre'], [[42, 96]]), [
    { label: 'Üretim süresi / Toplam süre', value: 42, total: 96, percent: 44 },
  ])
  assert.equal(mod.computeDurationBars(['a', 'b'], [[200, 100]])[0].percent, 100)
  assert.equal(mod.computeDurationBars(['a', 'b'], [[5, 0]])[0].percent, 0)
})

test('computeDurationBars: leading text column becomes the label, single number is a percent', () => {
  assert.deepEqual(mod.computeDurationBars(['ad', 'v', 't'], [['Kesme', '3', '12']]), [
    { label: 'Kesme', value: 3, total: 12, percent: 25 },
  ])
  assert.deepEqual(mod.computeDurationBars(['oran'], [[37.6]]), [
    { label: 'oran', value: 37.6, total: 100, percent: 38 },
  ])
  assert.deepEqual(mod.computeDurationBars(['x'], [['abc']]), [])
})
