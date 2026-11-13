// Run with: node --test src/utils/rowDetailState.test.mjs   (from dtfrontend/)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('./rowDetailState.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))

test('pickTracePanel returns the first enabled tracePanel config', () => {
  const a = { id: 'a', tracePanel: { enabled: false, paramFields: [] } }
  const b = { id: 'b' }
  const c = { id: 'c', tracePanel: { enabled: true, paramFields: ['x'] } }
  const d = { id: 'd', tracePanel: { enabled: true, paramFields: ['y'] } }
  assert.equal(mod.pickTracePanel([a, b, c, d]), c.tracePanel)
  assert.equal(mod.pickTracePanel([a, b]), undefined)
  assert.equal(mod.pickTracePanel(undefined), undefined)
  assert.equal(mod.pickTracePanel([]), undefined)
})

test('isDetailCardEnabled needs enabled flag and a non-blank sql', () => {
  assert.equal(mod.isDetailCardEnabled({ enabled: true, sql: 'SELECT 1' }), true)
  assert.equal(mod.isDetailCardEnabled({ enabled: true, sql: '   ' }), false)
  assert.equal(mod.isDetailCardEnabled({ enabled: false, sql: 'SELECT 1' }), false)
  assert.equal(mod.isDetailCardEnabled(undefined), false)
  assert.equal(mod.isDetailCardEnabled(null), false)
})

test('isSameOrDescendantRowKey matches the key itself and nested children only', () => {
  assert.equal(mod.isSameOrDescendantRowKey('5_1', '5_1'), true)
  assert.equal(mod.isSameOrDescendantRowKey('5_1_3', '5_1'), true)
  assert.equal(mod.isSameOrDescendantRowKey('5_10', '5_1'), false)
  assert.equal(mod.isSameOrDescendantRowKey('5_2_1', '5_1'), false)
  assert.equal(mod.isSameOrDescendantRowKey(null, '5_1'), false)
})

test('isRowKeyOfQuery matches only keys that belong to the query id', () => {
  assert.equal(mod.isRowKeyOfQuery('5_0', 5), true)
  assert.equal(mod.isRowKeyOfQuery('5_0_2', 5), true)
  assert.equal(mod.isRowKeyOfQuery('55_0', 5), false)
  assert.equal(mod.isRowKeyOfQuery(undefined, 5), false)
})

test('createRequestTracker only treats the latest request as current', () => {
  const t = mod.createRequestTracker()
  const first = t.begin()
  assert.equal(t.isCurrent(first), true)
  const second = t.begin()
  assert.equal(t.isCurrent(first), false)
  assert.equal(t.isCurrent(second), true)
  t.invalidate()
  assert.equal(t.isCurrent(second), false)
})
