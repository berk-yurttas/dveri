"use client"

import React, { useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { RowDetailCardConfig, TracePanelConfig } from '@/types/reports'
import {
  addLink,
  isSafeLinkTemplate,
  missingPlaceholders,
  parseFieldList,
  removeLink,
  needsTextResync,
  setDetailCardEnabled,
  setTracePanelEnabled,
  staleSelectedFields,
  toggleParamField,
  updateLink,
} from '@/utils/rowDetailConfig'

const inputClass =
  'w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none'
const textareaClass = `${inputClass} min-h-[80px] font-mono`
const labelClass = 'text-xs font-semibold text-slate-700'

function ParamFieldPicker({
  idPrefix,
  labelledBy,
  fields,
  selected,
  onChange,
}: {
  idPrefix: string
  labelledBy: string
  fields: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  // Free-text fallback when the available columns are unknown (e.g. SELECT * nested queries).
  const [text, setText] = useState(selected.join(', '))
  // Resync when the selection changed elsewhere (e.g. switching from checkbox mode).
  if (needsTextResync(text, selected)) setText(selected.join(', '))

  if (fields.length === 0) {
    return (
      <div className="space-y-1">
        <input
          type="text"
          aria-labelledby={labelledBy}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            onChange(parseFieldList(e.target.value))
          }}
          placeholder="parca_no, siparis_no"
          className={inputClass}
        />
        <p className="text-[10px] text-slate-500">
          Kolonlar bilinmiyor; alan adlarını virgülle ayırarak yazın.
        </p>
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="space-y-1 max-h-32 overflow-y-auto bg-white p-2 rounded border border-slate-200"
    >
      {[...fields, ...staleSelectedFields(selected, fields)].map((field) => (
        <div key={field} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`${idPrefix}-${field}`}
            checked={selected.includes(field)}
            onChange={(e) => onChange(toggleParamField(selected, field, e.target.checked))}
            className="w-4 h-4 text-blue-600 border-slate-300 rounded"
          />
          <label htmlFor={`${idPrefix}-${field}`} className="text-xs flex-1 text-slate-700">
            {field}{fields.includes(field) ? '' : " (SQL'de yok)"}
          </label>
          <code className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{'{{' + field + '}}'}</code>
        </div>
      ))}
    </div>
  )
}

function PlaceholderHint({ sql, paramFields }: { sql?: string; paramFields: string[] }) {
  if (paramFields.length === 0) return null
  const missing = missingPlaceholders(sql, paramFields)
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-slate-500">
        SQL içinde kullanın: {paramFields.map((f) => `{{${f}}}`).join(', ')}
      </p>
      {missing.length > 0 && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Uyarı: SQL içinde bulunmayan yer tutucular: {missing.map((f) => `{{${f}}}`).join(', ')}
        </p>
      )}
    </div>
  )
}

export function DetailCardConfigEditor({
  value,
  availableFields,
  onChange,
}: {
  value?: RowDetailCardConfig
  availableFields: string[]
  onChange: (next: RowDetailCardConfig | undefined) => void
}) {
  const id = useId()
  const enabled = value?.enabled ?? false
  const update = (updates: Partial<RowDetailCardConfig>) =>
    onChange({ enabled: true, sql: '', paramFields: [], ...value, ...updates })

  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center gap-2 bg-indigo-50 px-2 py-1.5 rounded border border-indigo-200/50">
        <input
          type="checkbox"
          id={`${id}-enabled`}
          checked={enabled}
          onChange={(e) => onChange(setDetailCardEnabled(value, e.target.checked))}
          className="w-4 h-4 text-blue-600 border-slate-300 rounded"
        />
        <label htmlFor={`${id}-enabled`} className="text-xs font-semibold text-slate-800">
          Satır Detay Kartı
        </label>
      </div>

      {enabled && (
        <div className="space-y-2 p-2 bg-slate-50 rounded border border-slate-200">
          <div className="space-y-1">
            <label htmlFor={`${id}-title`} className={labelClass}>Başlık</label>
            <input
              id={`${id}-title`}
              type="text"
              value={value?.title ?? ''}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Seçili Satır Detay Kartı"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <span id={`${id}-fields-label`} className={labelClass}>Sorguya Aktarılacak Alanlar</span>
            <ParamFieldPicker
              idPrefix={`${id}-field`}
              labelledBy={`${id}-fields-label`}
              fields={availableFields}
              selected={value?.paramFields ?? []}
              onChange={(paramFields) => update({ paramFields })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-sql`} className={labelClass}>Detay SQL Sorgusu</label>
            <textarea
              id={`${id}-sql`}
              value={value?.sql ?? ''}
              onChange={(e) => update({ sql: e.target.value })}
              placeholder="SELECT ... WHERE parca_no = {{parca_no}}"
              className={textareaClass}
            />
            <p className="text-[10px] text-slate-500">
              Seçilen satırın değerleri yer tutuculara aktarılır; sonucun ilk satırındaki kolonlar kartta gösterilir.
            </p>
            <PlaceholderHint sql={value?.sql} paramFields={value?.paramFields ?? []} />
          </div>
        </div>
      )}
    </div>
  )
}

export function TracePanelConfigEditor({
  value,
  availableFields,
  onChange,
}: {
  value?: TracePanelConfig
  availableFields: string[]
  onChange: (next: TracePanelConfig | undefined) => void
}) {
  const id = useId()
  const enabled = value?.enabled ?? false
  const update = (updates: Partial<TracePanelConfig>) =>
    onChange({ enabled: true, paramFields: [], ...value, ...updates })
  const paramFields = value?.paramFields ?? []
  const sqlForHint = `${value?.operationSql ?? ''}\n${value?.durationSql ?? ''}`

  return (
    <div className="space-y-2 pt-3 border-t border-gray-300">
      <div className="flex items-center gap-2 bg-teal-50 px-2 py-1.5 rounded border border-teal-200/50">
        <input
          type="checkbox"
          id={`${id}-enabled`}
          checked={enabled}
          onChange={(e) => onChange(setTracePanelEnabled(value, e.target.checked))}
          className="w-4 h-4 text-blue-600 border-slate-300 rounded"
        />
        <label htmlFor={`${id}-enabled`} className="text-xs font-semibold text-slate-800">
          Operasyon, CMM ve Test İzleri
        </label>
      </div>

      {enabled && (
        <div className="space-y-2 p-2 bg-white rounded border border-slate-200">
          <div className="space-y-1">
            <label htmlFor={`${id}-title`} className={labelClass}>Başlık</label>
            <input
              id={`${id}-title`}
              type="text"
              value={value?.title ?? ''}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Operasyon, CMM ve Test İzleri"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <span id={`${id}-fields-label`} className={labelClass}>Tıklanan Satırdan Aktarılacak Alanlar</span>
            <ParamFieldPicker
              idPrefix={`${id}-field`}
              labelledBy={`${id}-fields-label`}
              fields={availableFields}
              selected={paramFields}
              onChange={(next) => update({ paramFields: next })}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-op`} className={labelClass}>Operasyon Akışı sorgusu</label>
            <textarea
              id={`${id}-op`}
              value={value?.operationSql ?? ''}
              onChange={(e) => update({ operationSql: e.target.value })}
              placeholder="SELECT adim_adi, aciklama FROM operasyonlar WHERE parca_no = {{parca_no}}"
              className={textareaClass}
            />
            <p className="text-[10px] text-slate-500">Her satır bir adım: 1. kolon başlık, 2. kolon alt başlık.</p>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${id}-dur`} className={labelClass}>Süre Dağılımı sorgusu</label>
            <textarea
              id={`${id}-dur`}
              value={value?.durationSql ?? ''}
              onChange={(e) => update({ durationSql: e.target.value })}
              placeholder="SELECT etiket, sure, toplam FROM sureler WHERE parca_no = {{parca_no}}"
              className={textareaClass}
            />
            <p className="text-[10px] text-slate-500">
              Kolonlar: [değer, toplam], [etiket, değer, toplam] veya tek bir yüzde kolonu.
            </p>
            <PlaceholderHint sql={sqlForHint} paramFields={paramFields} />
          </div>

          <div className="space-y-1">
            <span className={labelClass}>Doküman Linkleri</span>
            {(value?.links ?? []).map((link, i) => (
              <div key={link.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_2fr_auto] gap-1.5 items-start">
                <input
                  type="text"
                  aria-label={`Doküman Linki ${i + 1} başlık`}
                  value={link.title}
                  onChange={(e) => update({ links: updateLink(value?.links, link.id, { title: e.target.value }) })}
                  placeholder="Başlık (CMM Raporu)"
                  className={inputClass}
                />
                <input
                  type="text"
                  aria-label={`Doküman Linki ${i + 1} link metni`}
                  value={link.linkText ?? ''}
                  onChange={(e) => update({ links: updateLink(value?.links, link.id, { linkText: e.target.value }) })}
                  placeholder="Link metni (PDF çıktısını aç)"
                  className={inputClass}
                />
                <div className="space-y-0.5">
                  <input
                    type="text"
                    aria-label={`Doküman Linki ${i + 1} URL şablonu`}
                    aria-invalid={!isSafeLinkTemplate(link.url)}
                    aria-describedby={isSafeLinkTemplate(link.url) ? undefined : `${id}-link-${link.id}-error`}
                    value={link.url}
                    onChange={(e) => update({ links: updateLink(value?.links, link.id, { url: e.target.value }) })}
                    placeholder="https://docs.example.com/{{rapor_no}}.pdf"
                    className={`${inputClass} font-mono`}
                  />
                  {!isSafeLinkTemplate(link.url) && (
                    <p id={`${id}-link-${link.id}-error`} className="text-[10px] text-red-600">
                      Hata: yalnızca http(s) veya göreli URL kullanılabilir.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Doküman Linki ${i + 1} sil`}
                  onClick={() => update({ links: removeLink(value?.links, link.id) })}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                update({ links: addLink(value?.links, `link-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`) })
              }
              className="flex items-center gap-1 text-xs px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
            >
              <Plus className="w-3 h-3" />
              Link Ekle
            </button>
            <p className="text-[10px] text-slate-500">
              URL içinde {'{{kolon}}'} tıklanan satırın değeriyle değiştirilir. Yalnızca http(s) veya göreli URL kullanılabilir.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
