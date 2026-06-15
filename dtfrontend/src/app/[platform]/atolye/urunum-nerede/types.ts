// Types for the "Ürünüm Nerede?" müşteri product tracker.
// Mirrors backend app/schemas/work_order.py TrackResponse.

export type TrackStatus =
  | "Girişi yapılmadı"
  | "Bekliyor"
  | "İşlemde"
  | "Gecikmiş"
  | "Sevke Hazır"
  | "Tamamlandı";

export type StepStatus = "done" | "active" | "delayed" | "waiting";

export interface OrderPair {
  aselsan_order_number: string;
  order_item_number: string;
}

export interface TrackTimelineStep {
  position: number | null;
  station_id: number;
  station_name: string;
  is_exit_station: boolean;
  status: StepStatus;
  entry_date: string | null;
  exit_date: string | null;
}

export interface TrackPackage {
  package_index: number;
  total_packages: number;
  quantity: number;
  current_station_name: string | null;
  status: TrackStatus;
}

export interface TrackMatch {
  work_order_group_id: string;
  part_number: string;
  revision_number: string | null;
  pairs: OrderPair[];
  main_customer: string;
  sector: string;
  company_from: string;
  coating_company: string | null;
  teklif_number: string;
  total_quantity: number;
  total_packages: number;
  target_date: string | null;
  current_station_name: string | null;
  current_entry_date: string | null;
  status: TrackStatus;
  last_updated: string | null;
  has_route: boolean;
  timeline: TrackTimelineStep[];
  packages: TrackPackage[];
}

export interface TrackResponse {
  matches: TrackMatch[];
}
