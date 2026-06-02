"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EntryStationBadge } from "./EntryStationBadge";
import { ExitStationBadge } from "./ExitStationBadge";

interface Station {
  id: number;
  name: string;
  company: string;
  is_entry_station: boolean;
  is_exit_station: boolean;
}

interface RoutePickerModalProps {
  open: boolean;
  workOrderGroupId: string;
  pinnedFirstStation: Station;            // operator's current station OR (for grandfathered) earliest historical entry
  companyStations: Station[];
  initialRouteStationIds?: number[];       // pre-fill for edit mode (yönetici)
  mode: "create" | "update";
  onSaved: () => void;
  onCancelled: () => void;
}

interface SortableItemProps {
  station: Station;
  isPinned: boolean;
  onRemove?: () => void;
}

function SortableItem({ station, isPinned, onRemove }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: station.id, disabled: isPinned });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white ${isPinned ? "opacity-90" : ""}`}
    >
      {!isPinned && (
        <span
          className="cursor-grab text-gray-400 select-none"
          {...attributes}
          {...listeners}
          aria-label="Sırayı taşımak için sürükle"
        >
          ≡
        </span>
      )}
      {isPinned && <span aria-hidden="true">🔒</span>}
      <span className="flex-1 font-medium text-gray-900">{station.name}</span>
      <EntryStationBadge isEntry={station.is_entry_station} size="sm" />
      <ExitStationBadge isExit={station.is_exit_station} size="sm" />
      {!isPinned && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-red-600 hover:bg-red-50 rounded px-2 py-1 text-sm"
          aria-label="Atölyeyi listeden çıkar"
        >
          ×
        </button>
      )}
    </li>
  );
}

export function RoutePickerModal({
  open,
  workOrderGroupId,
  pinnedFirstStation,
  companyStations,
  initialRouteStationIds,
  mode,
  onSaved,
  onCancelled,
}: RoutePickerModalProps) {
  const initialIds = useMemo(() => {
    if (initialRouteStationIds && initialRouteStationIds.length > 0) return initialRouteStationIds;
    return [pinnedFirstStation.id];
  }, [initialRouteStationIds, pinnedFirstStation]);

  const [orderedIds, setOrderedIds] = useState<number[]>(initialIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stationsById = useMemo(() => {
    const map = new Map<number, Station>();
    [pinnedFirstStation, ...companyStations].forEach((s) => map.set(s.id, s));
    return map;
  }, [pinnedFirstStation, companyStations]);

  const availableToAdd = useMemo(() => {
    const inRoute = new Set(orderedIds);
    return companyStations.filter((s) => !inRoute.has(s.id));
  }, [orderedIds, companyStations]);

  const hasExitStationInCompany = companyStations.some((s) => s.is_exit_station) || pinnedFirstStation.is_exit_station;
  const lastStation = stationsById.get(orderedIds[orderedIds.length - 1]);
  const endsAtExit = !!lastStation?.is_exit_station;

  const canSave =
    orderedIds.length >= 2 && (!hasExitStationInCompany || endsAtExit);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(Number(active.id));
    const newIndex = orderedIds.indexOf(Number(over.id));
    if (oldIndex === 0 || newIndex === 0) return; // never move past pinned
    setOrderedIds((ids) => arrayMove(ids, oldIndex, newIndex));
  };

  const handleAdd = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value);
    if (!id) return;
    setOrderedIds((ids) => [...ids, id]);
    e.target.value = "";
  };

  const handleRemove = (id: number) => {
    setOrderedIds((ids) => ids.filter((i) => i !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        await api.post("/romiot/station/work-order-routes/", {
          work_order_group_id: workOrderGroupId,
          station_ids: orderedIds,
        });
      } else {
        await api.put(`/romiot/station/work-order-routes/${encodeURIComponent(workOrderGroupId)}`, {
          station_ids: orderedIds,
        });
      }
      onSaved();
    } catch (err: any) {
      let message = "Rota kaydedilemedi";
      if (err.message) {
        try {
          const parsed = JSON.parse(err.message);
          message = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">
            {mode === "create" ? "Rota Belirle" : "Rota Düzenle"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Bu iş emrinin gideceği atölyeleri sırayla seçin.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 rounded text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}
          {!hasExitStationInCompany && (
            <div className="p-3 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800">
              Sistemde Çıkış Atölyesi yok; rota istediğiniz herhangi bir atölyede bitebilir.
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {orderedIds.map((id, i) => {
                  const s = stationsById.get(id);
                  if (!s) return null;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-sm text-gray-400 w-6 text-right">{i + 1}.</span>
                      <SortableItem
                        station={s}
                        isPinned={i === 0}
                        onRemove={i === 0 ? undefined : () => handleRemove(id)}
                      />
                    </div>
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>

          {availableToAdd.length > 0 && (
            <div>
              <select
                onChange={handleAdd}
                defaultValue=""
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                aria-label="Rotaya atölye ekle"
              >
                <option value="">+ Atölye Ekle</option>
                {availableToAdd.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_exit_station ? " (Çıkış)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasExitStationInCompany && !endsAtExit && orderedIds.length >= 2 && (
            <p className="text-xs text-amber-700">⚠ Rota bir Çıkış Atölyesinde bitmelidir</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelled}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-4 py-2 bg-[#0f4c3a] hover:bg-[#0a3a2c] text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
