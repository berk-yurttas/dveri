"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { api } from "@/lib/api";

interface CompanyTypeaheadProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
}

const ROW_HEIGHT = 36;
const MAX_VISIBLE_ROWS = 8;
const VIRTUALIZE_THRESHOLD = 20;

export function CompanyTypeahead({
  value,
  onChange,
  disabled,
  required,
  placeholder = "Hedef firma seçin veya arayın",
  id,
}: CompanyTypeaheadProps) {
  const [companies, setCompanies] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(value);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<FixedSizeList | null>(null);

  // Fetch the list once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<string[]>(
          "/romiot/station/company-integrations/companies",
          undefined,
          { useCache: true },
        );
        if (!cancelled) setCompanies(data || []);
      } catch (err) {
        if (!cancelled) {
          setCompanies([]);
          setLoadError("Firma listesi yüklenemedi");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the filter (250 ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Keep input text in sync with the controlled value ONLY when the change came
  // from outside (parent reset / programmatic set), never while the user is
  // actively typing — otherwise a parent that normalizes the value (trim,
  // uppercase, form lib) would clobber in-progress input and jump the caret.
  useEffect(() => {
    if (document.activeElement !== inputRef.current && value !== query) {
      setQuery(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Click-outside closes dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    if (!companies) return [];
    if (!debouncedQuery) return companies;
    const q = debouncedQuery.toLocaleLowerCase("tr-TR");
    return companies.filter((c) => c.toLocaleLowerCase("tr-TR").includes(q));
  }, [companies, debouncedQuery]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [debouncedQuery, companies]);

  // Validity compares the raw value against the catalog — consistent with how
  // commitSelection / onChange store it untrimmed and how `filtered` matches.
  // (Selecting from the list always yields an exact catalog entry.)
  const isValid = useMemo(() => {
    if (!value || !companies) return true;
    return companies.includes(value);
  }, [value, companies]);

  const commitSelection = useCallback((next: string) => {
    setQuery(next);
    setDebouncedQuery(next);
    onChange(next);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
      listRef.current?.scrollToItem(Math.min(highlightedIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      listRef.current?.scrollToItem(Math.max(highlightedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIndex]) commitSelection(filtered[highlightedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery(value);
    } else if (e.key === "Tab") {
      if (filtered[highlightedIndex]) commitSelection(filtered[highlightedIndex]);
    }
  };

  const Row = ({ index, style }: ListChildComponentProps) => {
    const company = filtered[index];
    const isHighlighted = index === highlightedIndex;
    const isSelected = value === company;
    return (
      <div
        id={`company-typeahead-option-${index}`}
        role="option"
        aria-selected={isSelected}
        style={style}
        onMouseDown={(e) => {
          e.preventDefault();
          commitSelection(company);
        }}
        onMouseEnter={() => setHighlightedIndex(index)}
        className={`flex items-center px-4 cursor-pointer ${
          isHighlighted ? "bg-blue-50 text-blue-900" : ""
        } ${isSelected ? "border-l-2 border-blue-500" : ""}`}
      >
        {company}
      </div>
    );
  };

  const isLoading = companies === null;
  const emptyCatalog = companies !== null && companies.length === 0;

  return (
    <div className="relative" ref={containerRef}>
      <input
        id={id}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-activedescendant={open ? `company-typeahead-option-${highlightedIndex}` : undefined}
        value={query}
        placeholder={emptyCatalog ? "Sistemde tanımlı firma yok" : placeholder}
        disabled={disabled || isLoading || emptyCatalog}
        required={required}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
      />

      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200">
          {filtered.length > VIRTUALIZE_THRESHOLD ? (
            <FixedSizeList
              ref={listRef}
              height={Math.min(filtered.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT}
              itemCount={filtered.length}
              itemSize={ROW_HEIGHT}
              width="100%"
            >
              {Row}
            </FixedSizeList>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-auto">
              {filtered.map((c, i) => (
                <li key={c} style={{ height: ROW_HEIGHT }}>
                  <Row index={i} style={{ height: ROW_HEIGHT }} data={null} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && filtered.length === 0 && companies && companies.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white shadow-lg rounded-lg overflow-hidden border border-gray-200 px-4 py-2 text-sm text-gray-500">
          Eşleşen firma yok
        </div>
      )}

      {!open && value && !isValid && (
        <p className="mt-1 text-xs text-red-600">Bu firma listede yok</p>
      )}
      {emptyCatalog && (
        <p className="mt-1 text-xs text-red-600">Yönetici bir firma entegrasyonu tanımlamalıdır</p>
      )}
      {loadError && !emptyCatalog && (
        <p className="mt-1 text-xs text-red-600">{loadError}</p>
      )}
    </div>
  );
}
