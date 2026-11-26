// Run with: node --test src/utils/sqlPlaceholders.test.mjs   (from dtfrontend/)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('./sqlPlaceholders.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))

test('dropdownFilterCondition keeps equality / IN for plain columns', () => {
  assert.equal(mod.dropdownFilterCondition('status', 'open'), "status = 'open'")
  assert.equal(mod.dropdownFilterCondition('status', ['a', 'b']), "status IN ('a','b')")
})

test('dropdownFilterCondition uses a {{value}} expression as the whole condition', () => {
  assert.equal(mod.dropdownFilterCondition('{{value}} = ANY(tags)', 'red'), "'red' = ANY(tags)")
  assert.equal(mod.dropdownFilterCondition('has(tags, {{value}})', 'red'), "has(tags, 'red')")
  assert.equal(
    mod.dropdownFilterCondition('hasAny(tags, [{{value}}])', ['red', 'blue']),
    "hasAny(tags, ['red','blue'])"
  )
})

test('dropdownFilterCondition escapes quotes in {{value}} expressions', () => {
  assert.equal(mod.dropdownFilterCondition('{{value}} = ANY(tags)', "O'Brien"), "'O''Brien' = ANY(tags)")
})

test('dropdownFilterCondition returns empty string when nothing is selected', () => {
  assert.equal(mod.dropdownFilterCondition('{{value}} = ANY(tags)', []), '')
  assert.equal(mod.dropdownFilterCondition('{{value}} = ANY(tags)', ''), '')
  assert.equal(mod.dropdownFilterCondition('status', undefined), '')
})
