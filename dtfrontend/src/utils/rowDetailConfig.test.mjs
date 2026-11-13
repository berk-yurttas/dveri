// Run with: node --test src/utils/rowDetailConfig.test.mjs   (from dtfrontend/)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('./rowDetailConfig.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))

test('toggleParamField adds, removes and does not duplicate', () => {
  assert.deepEqual(mod.toggleParamField(['a'], 'b', true), ['a', 'b'])
  assert.deepEqual(mod.toggleParamField(['a', 'b'], 'b', true), ['a', 'b'])
  assert.deepEqual(mod.toggleParamField(['a', 'b'], 'a', false), ['b'])
  assert.deepEqual(mod.toggleParamField(undefined, 'a', true), ['a'])
})

test('missingPlaceholders lists selected fields absent from the SQL', () => {
  assert.deepEqual(mod.missingPlaceholders('SELECT 1 WHERE a = {{a}}', ['a', 'b']), ['b'])
  assert.deepEqual(mod.missingPlaceholders('x {{ a }}', ['a']), [])
  assert.deepEqual(mod.missingPlaceholders(undefined, ['a']), ['a'])
  assert.deepEqual(mod.missingPlaceholders('{{a.b(1)}}', ['a.b(1)']), [])
})

test('parseFieldList splits on commas, trims and dedupes', () => {
  assert.deepEqual(mod.parseFieldList(' a, b ,,a, c'), ['a', 'b', 'c'])
  assert.deepEqual(mod.parseFieldList(''), [])
})

test('setDetailCardEnabled creates a default card and preserves values when toggled', () => {
  assert.deepEqual(mod.setDetailCardEnabled(undefined, true), { enabled: true, sql: '', paramFields: [] })
  const card = { enabled: true, title: 'T', sql: 'S {{a}}', paramFields: ['a'] }
  const off = mod.setDetailCardEnabled(card, false)
  assert.deepEqual(off, { ...card, enabled: false })
  assert.deepEqual(mod.setDetailCardEnabled(off, true), card)
  assert.equal(mod.setDetailCardEnabled(undefined, false), undefined)
})

test('setTracePanelEnabled creates a default panel and preserves values when toggled', () => {
  assert.deepEqual(mod.setTracePanelEnabled(undefined, true), { enabled: true, paramFields: [] })
  const panel = { enabled: true, paramFields: ['a'], operationSql: 'Q', links: [{ id: '1', title: 't', url: 'u' }] }
  const off = mod.setTracePanelEnabled(panel, false)
  assert.deepEqual(off, { ...panel, enabled: false })
  assert.deepEqual(mod.setTracePanelEnabled(off, true), panel)
  assert.equal(mod.setTracePanelEnabled(undefined, false), undefined)
})

test('link helpers add, update and remove immutably', () => {
  const l0 = undefined
  const l1 = mod.addLink(l0, 'id1')
  assert.deepEqual(l1, [{ id: 'id1', title: '', linkText: '', url: '' }])
  const l2 = mod.updateLink(l1, 'id1', { url: '/x/{{a}}' })
  assert.equal(l2[0].url, '/x/{{a}}')
  assert.equal(l1[0].url, '')
  assert.deepEqual(mod.removeLink(l2, 'id1'), [])
  assert.deepEqual(mod.removeLink(l2, 'nope'), l2)
})

test('isSafeLinkTemplate allows only http(s) and relative URLs', () => {
  assert.equal(mod.isSafeLinkTemplate('https://x/{{a}}'), true)
  assert.equal(mod.isSafeLinkTemplate('/docs/{{a}}'), true)
  assert.equal(mod.isSafeLinkTemplate('docs/a.pdf'), true)
  assert.equal(mod.isSafeLinkTemplate('javascript:alert(1)'), false)
  assert.equal(mod.isSafeLinkTemplate(' JavaScript:alert(1)'), false)
  assert.equal(mod.isSafeLinkTemplate('data:text/html,x'), false)
  assert.equal(mod.isSafeLinkTemplate('//evil.com/x'), false)
  assert.equal(mod.isSafeLinkTemplate(''), true)
})

test('sameFieldList compares order-sensitively', () => {
  assert.equal(mod.sameFieldList(['a', 'b'], ['a', 'b']), true)
  assert.equal(mod.sameFieldList(['a'], ['a', 'b']), false)
  assert.equal(mod.sameFieldList(['a', 'b'], ['b', 'a']), false)
  assert.equal(mod.sameFieldList([], []), true)
})

test('staleSelectedFields returns selected fields not in the available list', () => {
  assert.deepEqual(mod.staleSelectedFields(['a', 'x'], ['a', 'b']), ['x'])
  assert.deepEqual(mod.staleSelectedFields(['a'], ['a']), [])
})

test('needsTextResync converges for duplicate / padded / comma-containing selections', () => {
  for (const selected of [['a', 'a'], [' a '], ['a,b'], ['', 'a'], ['a', 'b']]) {
    // After resyncing to selected.join(', '), it must not ask to resync again (else render loop).
    assert.equal(mod.needsTextResync(selected.join(', '), selected), false, JSON.stringify(selected))
  }
  assert.equal(mod.needsTextResync('', ['a']), true)
  assert.equal(mod.needsTextResync('a, ', ['a']), false)
})
