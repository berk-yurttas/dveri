"use client"

// Tasarım ve Proje Akışlarının Dijital Seyri
// başlatmak iste..
// yapım aşağmasında

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import {
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  Settings,
  Calendar,
  Clock,
  Database,
  FileText,
  MessageSquare,
  Bell,
  ShoppingCart,
  DollarSign,
  Globe,
  Zap,
  Shield,
  Monitor,
  Map as MapIcon,
  Camera,
  Music,
  Heart,
  Star,
  Target,
  Gauge,
  Cpu,
  Wifi,
  Battery,
  HardDrive,
  Smartphone,
  Plus,
  Layout,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  User,
  X,
  Lock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Download,
  Search
} from "lucide-react";
import * as XLSX from 'xlsx';
import { dashboardService } from "@/services/dashboard";
import { reportsService } from "@/services/reports";
import { RomiotStats } from "@/components/dashboard/RomiotStats";
import { announcementService } from "@/services/announcement";
import { DashboardList } from "@/types/dashboard";
import { SavedReport } from "@/types/reports";
import { Announcement } from "@/types/announcement";
import { useUser } from "@/contexts/user-context";
import { usePlatform } from "@/contexts/platform-context";
import { api } from "@/lib/api";
import { MirasAssistant } from "@/components/chatbot/miras-assistant";
import { Feedback } from "@/components/feedback/feedback";
import DOMPurify from 'dompurify';
import { checkAccess } from "@/lib/utils";
import { TableVisualization } from "@/components/visualizations/TableVisualization";

// Icon mapping
const iconMap: { [key: string]: any } = {
  BarChart3,
  PieChart,
  Activity,
  TrendingUp,
  Users,
  Settings,
  Calendar,
  Clock,
  Database,
  FileText,
  MessageSquare,
  Bell,
  ShoppingCart,
  DollarSign,
  Globe,
  Zap,
  Shield,
  Monitor,
  Map: MapIcon,
  Camera,
  Music,
  Heart,
  Star,
  Target,
  Gauge,
  Cpu,
  Wifi,
  Battery,
  HardDrive,
  Smartphone,
  Plus,
  Layout
};

export default function PlatformHome() {
  const router = useRouter();
  const params = useParams();
  const platformCode = params.platform as string;
  const { user } = useUser();
  const { platform: platformData, setPlatformByCode } = usePlatform();
  console.log("user", user);
  const hasDerinizAdmin = user?.role && Array.isArray(user.role) &&
    user.role.includes('deriniz:admin');
  const [dashboards, setDashboards] = useState<DashboardList[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showRomiotTooltip, setShowRomiotTooltip] = useState(false);
  const [hoveredAnnouncement, setHoveredAnnouncement] = useState<number | null>(null);
  const [showIotApps, setShowIotApps] = useState(false);
  const [showAllAnnouncementsModal, setShowAllAnnouncementsModal] = useState(false);
  const [showAccessDeniedModal, setShowAccessDeniedModal] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<Set<number>>(new Set());
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  const [showFeatureNavigationModal, setShowFeatureNavigationModal] = useState(false);
  const [navigatingFeature, setNavigatingFeature] = useState<{
    name: string;
    imageUrl?: string;
    url: string;
  } | null>(null);
  const navigationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isIvmePlatform = platformData?.code === 'ivme';
  const isRomiotPlatform = platformCode === 'romiot';
  const isSeyirPlatform = platformCode === 'seyir';
  const [searchValue, setSearchValue] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [searchedPartNumber, setSearchedPartNumber] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // TableVisualization states
  const [sorting, setSorting] = useState<{ column: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<{ [key: string]: any }>({});
  const [openPopovers, setOpenPopovers] = useState<{ [key: string]: boolean }>({});
  const [dropdownOptions, setDropdownOptions] = useState<{ [key: string]: { options: Array<{ value: any; label: string }>, page: number, hasMore: boolean, total: number, loading: boolean } }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isMounted, setIsMounted] = useState(false);

  // Check if mounted (client-side)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedTable) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedTable]);

  // Convert table data to TableVisualization format
  const getTableVisualizationData = () => {
    if (!tableData || !selectedTable) return null;

    switch (selectedTable) {
      case 'alt-yuklenici':
        // Database'den gelen veri formatı
        if (tableData.altYuklenici && Array.isArray(tableData.altYuklenici) && tableData.altYuklenici.length > 0 && Array.isArray(tableData.altYuklenici[0])) {
          // Veri zaten array formatında (database'den geldi)
          return {
            columns: ['Satıcı', 'Satıcı Tanım', 'SAS', 'SAS Kalem', 'Üretim Siparişi', 'Malzeme', 'Sipariş Miktarı', 'İhtiyaç Önceliği', 'İş Emri Durumu', 'Seri No', 'Aşama', 'Aşama Durum', 'Tahmini Tamamlanma Tarihi'],
            data: tableData.altYuklenici
          };
        }
        // Fallback: dummy data formatı
        return {
          columns: ['Satıcı', 'Satıcı Tanım', 'SAS', 'SAS Kalem', 'Üretim Siparişi', 'Malzeme', 'Sipariş Miktarı', 'İhtiyaç Önceliği', 'İş Emri Durumu', 'Seri No', 'Aşama', 'Aşama Durum', 'Tahmini Tamamlanma Tarihi'],
          data: tableData.altYuklenici.map((item: any) => [
            item.satici || '-',
            item.saticiTanim || '-',
            item.sas || '-',
            item.sasKalem || '-',
            item.uretimSiparisi || '-',
            item.malzeme || '-',
            item.siparisMiktari || '-',
            item.ihtiyacOnceligi || '-',
            item.isEmriDurumu || '-',
            item.seriNo || '-',
            item.asama || '-',
            item.asamaDurum || '-',
            item.tahminiTamamlanmaTarihi || '-'
          ])
        };

      case 'aselsan-ici':
        return {
          columns: ['İş Emri', 'Durum', 'Adet', 'Atölye', 'İş Emri Açılış Tarihi', 'Status', 'Kaç Gündür Bu Adımda'],
          data: tableData.aselsanIci.map((item: any) => [
            item.isEmri,
            item.durum,
            item.adet,
            item.atolye,
            item.isEmriAcilisTarihi,
            item.status,
            `${item.kacGundur} gün`
          ])
        };

      case 'prototip-ahtapot':
        return {
          columns: ['Süreç Tipi', 'Adet', 'Açıklama'],
          data: [
            ['Prototip Üretim', tableData.prototipAhtapot.prototip, 'Aktif prototip üretim süreçleri'],
            ['Ahtapot Tasarım', tableData.prototipAhtapot.ahtapot, 'Devam eden ahtapot tasarım süreçleri']
          ]
        };

      case 'deriniz':
        return {
          columns: ['A', 'B', 'C', 'D', 'E'],
          data: tableData.deriniz.map((item: any) => [
            item.a,
            item.b,
            item.c,
            item.d,
            item.e
          ])
        };

      case 'alt-yuklenici-hatalar':
        // Database'den gelen veri formatı
        if (tableData.altYukleniciHatalar && Array.isArray(tableData.altYukleniciHatalar) && tableData.altYukleniciHatalar.length > 0 && Array.isArray(tableData.altYukleniciHatalar[0])) {
          // Veri zaten array formatında (database'den geldi)
          return {
            columns: ['Aselsan İş Emri No', 'Aselsan Sipariş No', 'Aselsan Sipariş Kalem No', 'Firma Adı', 'Stok Kodu', 'Operasyon Tanımı', 'Durma Nedeni', 'Hata Tanımı', 'Durma Gün Sayısı'],
            data: tableData.altYukleniciHatalar
          };
        }
        // Fallback: dummy data formatı
        return {
          columns: ['Aselsan İş Emri No', 'Aselsan Sipariş No', 'Aselsan Sipariş Kalem No', 'Firma Adı', 'Stok Kodu', 'Operasyon Tanımı', 'Durma Nedeni', 'Hata Tanımı', 'Durma Gün Sayısı'],
          data: tableData.altYukleniciHatalar.map((item: any) => [
            item.aselsanIsEmriNo || '-',
            item.aselsanSiparisNo || '-',
            item.aselsanSiparisKalemNo || '-',
            item.firmaAdi || '-',
            item.stokKodu || '-',
            item.operasyonTanimi || '-',
            item.durmaNedeni || '-',
            item.hataTanimi || '-',
            item.durmaGunSayisi || '-'
          ])
        };

      case 'sap-hatalar':
        return {
          columns: ['Bildirim Tipi', 'Bildirim Numarası', 'Açılış Tarihi', 'Kimin Üzerinde'],
          data: tableData.sapHatalar.map((item: any) => [
            item.bildirimTipi,
            item.bildirimNumarasi,
            item.acilisTarihi,
            item.kiminUzerinde
          ])
        };

      case 'robot-servis':
        return {
          columns: [],
          data: []
        };

      case 'kalifikasyon':
        return {
          columns: ['Rapor No', 'Sonuç', 'Tarih'],
          data: tableData.kalifikasyon.map((item: any) => [
            item.raporNo,
            item.sonuc,
            new Date().toLocaleDateString('tr-TR')
          ])
        };

      default:
        return null;
    }
  };

  // TableVisualization handlers
  const handleColumnSort = (column: string) => {
    setSorting(prev => {
      if (prev?.column === column) {
        return prev.direction === 'asc'
          ? { column, direction: 'desc' }
          : null;
      }
      return { column, direction: 'asc' };
    });
  };

  const handleFilterChange = (fieldName: string, value: any) => {
    setFilters(prev => ({ ...prev, [fieldName]: value }));
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  // Generate filter definitions for each column (text search on every column)
  const getTableVisualizationFilters = () => {
    if (!selectedTable) return [];
    const vizData = getTableVisualizationData();
    if (!vizData) return [];
    return vizData.columns.map((col: string, idx: number) => ({
      id: idx,
      fieldName: col,
      displayName: col,
      type: 'text' as const,
      dropdownQuery: null,
      dependsOn: null,
      required: false,
      query_id: 0,
      created_at: '',
      updated_at: null
    }));
  };

  // Calculate pagination with client-side filter + sort
  const [paginatedData, setPaginatedData] = useState<any>(null);

  useEffect(() => {
    const tableVizData = getTableVisualizationData();
    if (!tableVizData) {
      setPaginatedData(null);
      return;
    }

    let filteredData = [...tableVizData.data];

    // Apply text filters per column
    tableVizData.columns.forEach((col: string, colIdx: number) => {
      const filterValue = filters[col];
      const filterOperator = filters[`${col}_operator`] || 'CONTAINS';
      if (filterValue && filterValue !== '') {
        const searchVal = String(filterValue).toLowerCase();
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[colIdx] ?? '').toLowerCase();
          switch (filterOperator) {
            case 'CONTAINS': return cellValue.includes(searchVal);
            case 'NOT_CONTAINS': return !cellValue.includes(searchVal);
            case 'STARTS_WITH': return cellValue.startsWith(searchVal);
            case 'ENDS_WITH': return cellValue.endsWith(searchVal);
            case '=': return cellValue === searchVal;
            case 'NOT_EQUALS': return cellValue !== searchVal;
            default: return true;
          }
        });
      }
    });

    // Apply sorting
    if (sorting) {
      const colIdx = tableVizData.columns.indexOf(sorting.column);
      if (colIdx !== -1) {
        filteredData.sort((a: any[], b: any[]) => {
          const aVal = String(a[colIdx] ?? '').toLowerCase();
          const bVal = String(b[colIdx] ?? '').toLowerCase();
          return sorting.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });
      }
    }

    const total = filteredData.length;
    setTotalRows(total);
    setTotalPages(Math.ceil(total / pageSize));

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    setPaginatedData({
      ...tableVizData,
      data: filteredData.slice(startIndex, endIndex)
    });
  }, [tableData, selectedTable, currentPage, pageSize, filters, sorting]);

  // Handle search for Seyir platform
  const handleSearch = async () => {
    if (searchValue.trim()) {
      console.log('🔍 Parça Numarası Arama:', searchValue);

      // Set loading state
      setIsLoadingData(true);
      setSearchedPartNumber(searchValue);
      setTableData(null); // Clear previous data

      try {
        // ==================== 1. ALT YÜKLENİCİ AÇIK ÜRETİM ====================
        const altYukleniciQuery = `SELECT "Satıcı", "Satıcı Tanım", "SAS", "SAS Kalem", "Üretim Siparişi", "Malzeme", "Sipariş Miktarı", "İhtiyaç Önceliği", "İş Emri Durumu", "Seri No", "Aşama", "Aşama Durum", "Tahmini Tamamlanma Tarihi" FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari WHERE "Malzeme" ILIKE '%${searchValue.trim()}%'`;
        const altYukleniciTotalCountQuery = `SELECT COUNT(*) as total FROM (SELECT DISTINCT "SAS", "SAS Kalem", "Malzeme" mes_production.FROM seyir_alt_yuklenici_mesuretim_kayitlari WHERE "Malzeme" ILIKE '%${searchValue.trim()}%') as t`;
        const altYukleniciFilteredCountQuery = `SELECT COUNT(*) as total FROM (SELECT DISTINCT "SAS", "SAS Kalem", "Malzeme" FROM mes_production.seyir_alt_yuklenici_mesuretim_kayitlari WHERE "Malzeme" ILIKE '%${searchValue.trim()}%' AND "İş Emri Durumu" != 'MES KAYDI YOKTUR') as t`;

        // ==================== 2. ASELSAN İÇİ AÇIK ÜRETİM ====================
        // TODO: Query'ler hazırlandığında doldurulacak
        const aselsanIciQuery = ``; // Boş - henüz hazır değil
        const aselsanIciTotalCountQuery = ``; // Boş
        const aselsanIciFilteredCountQuery = ``; // Boş

        // ==================== 3. PROTOTİP VE TASARIM (Yapım Aşamasında) ====================
        // TODO: Query'ler hazırlandığında doldurulacak
        const prototipQuery = ``; // Boş - yapım aşamasında
        const prototipTotalCountQuery = ``; // Boş
        const prototipFilteredCountQuery = ``; // Boş

        // ==================== 4. TEST VERİSİ (DERİNİZ) ====================
        // TODO: Query'ler hazırlandığında doldurulacak
        const derinizQuery = ``; // Boş - henüz hazır değil
        const derinizTotalCountQuery = ``; // Boş
        const derinizFilteredCountQuery = ``; // Boş

        // ==================== 5. ALT YÜKLENİCİ AÇIK HATA ====================
        const altYukleniciHatalarQuery = `SELECT "Aselsan İş Emri No", "Aselsan Sipariş No", "Aselsan Sipariş Kalem No", "Firma Adı", "Stok Kodu", "Operasyon Tanımı", "Durma Nedeni", "Hata Tanımı", "Durma Gün Sayısı" FROM mes_production.seyir_alt_yuklenici_mesuretim_hatakayitlari WHERE "Stok Kodu" ILIKE '%${searchValue.trim()}%'`;
        const altYukleniciHatalarTotalCountQuery = `SELECT COUNT(*) as total FROM mes_production.seyir_alt_yuklenici_mesuretim_hatakayitlari WHERE "Stok Kodu" ILIKE '%${searchValue.trim()}%'`;
        const altYukleniciHatalarFilteredCountQuery = ``; // Boş - şimdilik sadece total count var

        // ==================== 6. ASELSAN AÇIK HATA (SAP) ====================
        // TODO: Query'ler hazırlandığında doldurulacak
        const sapHatalarQuery = ``; // Boş - henüz hazır değil
        const sapHatalarTotalCountQuery = ``; // Boş
        const sapHatalarFilteredCountQuery = ``; // Boş

        // ==================== 7. ROBOT VERİLERİ (Yapım Aşamasında) ====================
        // TODO: Query'ler hazırlandığında doldurulacak
        const robotQuery = ``; // Boş - yapım aşamasında
        const robotTotalCountQuery = ``; // Boş
        const robotFilteredCountQuery = ``; // Boş

        // ==================== 8. ÜST AŞAMA (KALİFİKASYON) ====================
        // TODO: Query'ler hazırlandığında doldurulacak
        const kalifikasyonQuery = ``; // Boş - henüz hazır değil
        const kalifikasyonTotalCountQuery = ``; // Boş
        const kalifikasyonFilteredCountQuery = ``; // Boş

        // Sadece dolu query'leri çalıştır
        const queries = [];
        const queryNames: string[] = [];

        // Alt Yüklenici queries
        if (altYukleniciQuery) {
          queries.push(reportsService.previewQuery({ sql_query: altYukleniciQuery, limit: 1000 }));
          queryNames.push('altYuklenici');
        }
        if (altYukleniciTotalCountQuery) {
          queries.push(reportsService.previewQuery({ sql_query: altYukleniciTotalCountQuery, limit: 1 }));
          queryNames.push('altYukleniciTotalCount');
        }
        if (altYukleniciFilteredCountQuery) {
          queries.push(reportsService.previewQuery({ sql_query: altYukleniciFilteredCountQuery, limit: 1 }));
          queryNames.push('altYukleniciFilteredCount');
        }

        // Alt Yüklenici Hatalar queries
        if (altYukleniciHatalarQuery) {
          queries.push(reportsService.previewQuery({ sql_query: altYukleniciHatalarQuery, limit: 1000 }));
          queryNames.push('altYukleniciHatalar');
        }
        if (altYukleniciHatalarTotalCountQuery) {
          queries.push(reportsService.previewQuery({ sql_query: altYukleniciHatalarTotalCountQuery, limit: 1 }));
          queryNames.push('altYukleniciHatalarTotalCount');
        }

        // Tüm sorguları paralel çalıştır
        const results = await Promise.all(queries);

        // Sonuçları map'le
        const resultMap: { [key: string]: any } = {};
        queryNames.forEach((name, index) => {
          resultMap[name] = results[index];
        });

        console.log('📦 Query sonuçları:', resultMap);

        // Database'den gelen verileri set et
        setTableData({
          // 1. Alt Yüklenici Açık Üretim
          altYuklenici: resultMap.altYuklenici?.data || [],
          altYukleniciTotalCount: resultMap.altYukleniciTotalCount?.data?.[0]?.[0] || 0,
          altYukleniciFilteredCount: resultMap.altYukleniciFilteredCount?.data?.[0]?.[0] || 0,

          // 2. Aselsan İçi Açık Üretim
          aselsanIci: [],
          aselsanIciTotalCount: 0,
          aselsanIciFilteredCount: 0,

          // 3. Prototip ve Tasarım (Yapım Aşamasında)
          prototip: [],
          prototipTotalCount: 0,
          prototipFilteredCount: 0,

          // 4. Test Verisi (Deriniz)
          deriniz: [],
          derinizTotalCount: 0,
          derinizFilteredCount: 0,

          // 5. Alt Yüklenici Açık Hata
          altYukleniciHatalar: resultMap.altYukleniciHatalar?.data || [],
          altYukleniciHatalarTotalCount: resultMap.altYukleniciHatalarTotalCount?.data?.[0]?.[0] || 0,
          altYukleniciHatalarFilteredCount: 0, // Şimdilik yok

          // 6. Aselsan Açık Hata (SAP)
          sapHatalar: [],
          sapHatalarTotalCount: 0,
          sapHatalarFilteredCount: 0,

          // 7. Robot Verileri (Yapım Aşamasında)
          robotServis: [],
          robotTotalCount: 0,
          robotFilteredCount: 0,

          // 8. Üst Aşama (Kalifikasyon)
          kalifikasyon: [],
          kalifikasyonTotalCount: 0,
          kalifikasyonFilteredCount: 0,
        });

        setIsLoadingData(false);
      } catch (error) {
        console.error('❌ Veri çekme hatası:', error);
        // Hata durumunda boş veri set et
        setTableData({
          altYuklenici: [], altYukleniciTotalCount: 0, altYukleniciFilteredCount: 0,
          aselsanIci: [], aselsanIciTotalCount: 0, aselsanIciFilteredCount: 0,
          prototip: [], prototipTotalCount: 0, prototipFilteredCount: 0,
          deriniz: [], derinizTotalCount: 0, derinizFilteredCount: 0,
          altYukleniciHatalar: [], altYukleniciHatalarTotalCount: 0, altYukleniciHatalarFilteredCount: 0,
          sapHatalar: [], sapHatalarTotalCount: 0, sapHatalarFilteredCount: 0,
          robotServis: [], robotTotalCount: 0, robotFilteredCount: 0,
          kalifikasyon: [], kalifikasyonTotalCount: 0, kalifikasyonFilteredCount: 0,
        });
        setIsLoadingData(false);
      }
    } else {
      console.warn('⚠️ Lütfen bir parça numarası giriniz');
    }
  };

  // Handle Enter key press
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Export table data to Excel
  const handleExportToExcel = () => {
    if (!tableData || !selectedTable) return;

    let exportData: any[] = [];
    let fileName = '';

    switch (selectedTable) {
      case 'alt-yuklenici':
        // Database'den gelen array formatı veya dummy data formatı
        if (Array.isArray(tableData.altYuklenici) && tableData.altYuklenici.length > 0 && Array.isArray(tableData.altYuklenici[0])) {
          // Database formatı (array of arrays)
          exportData = tableData.altYuklenici.map((row: any[]) => ({
            'Satıcı': row[0] || '-',
            'Satıcı Tanım': row[1] || '-',
            'SAS': row[2] || '-',
            'SAS Kalem': row[3] || '-',
            'Üretim Siparişi': row[4] || '-',
            'Malzeme': row[5] || '-',
            'Sipariş Miktarı': row[6] || '-',
            'İhtiyaç Önceliği': row[7] || '-',
            'İş Emri Durumu': row[8] || '-',
            'Seri No': row[9] || '-',
            'Aşama': row[10] || '-',
            'Aşama Durum': row[11] || '-',
            'Tahmini Tamamlanma Tarihi': row[12] || '-'
          }));
        } else {
          // Dummy data formatı (object)
          exportData = tableData.altYuklenici.map((item: any) => ({
            'Satıcı': item.satici || '-',
            'Satıcı Tanım': item.saticiTanim || '-',
            'SAS': item.sas || '-',
            'SAS Kalem': item.sasKalem || '-',
            'Üretim Siparişi': item.uretimSiparisi || '-',
            'Malzeme': item.malzeme || '-',
            'Sipariş Miktarı': item.siparisMiktari || '-',
            'İhtiyaç Önceliği': item.ihtiyacOnceligi || '-',
            'İş Emri Durumu': item.isEmriDurumu || '-',
            'Seri No': item.seriNo || '-',
            'Aşama': item.asama || '-',
            'Aşama Durum': item.asamaDurum || '-',
            'Tahmini Tamamlanma Tarihi': item.tahminiTamamlanmaTarihi || '-'
          }));
        }
        fileName = 'Alt_Yuklenici_Uretim_Siparisleri';
        break;
      case 'aselsan-ici':
        exportData = tableData.aselsanIci.map((item: any) => ({
          'Parça No': item.parcaNo,
          'Üretim Yılı': item.uretimYili,
          'Üretim Durumu': item.durum
        }));
        fileName = 'Aselsan_Ici_Uretim_Siparisleri';
        break;
      case 'prototip-ahtapot':
        exportData = [
          { 'Süreç Tipi': 'Prototip Üretim', 'Adet': tableData.prototipAhtapot.prototip, 'Açıklama': 'Aktif prototip üretim süreçleri' },
          { 'Süreç Tipi': 'Ahtapot Tasarım', 'Adet': tableData.prototipAhtapot.ahtapot, 'Açıklama': 'Devam eden ahtapot tasarım projeleri' }
        ];
        fileName = 'Prototip_Ahtapot_Durum';
        break;
      case 'deriniz':
        exportData = tableData.deriniz.map((item: any) => ({
          'A': item.a,
          'B': item.b,
          'C': item.c,
          'D': item.d,
          'E': item.e
        }));
        fileName = 'Deriniz_Bilgiler';
        break;
      case 'alt-yuklenici-hatalar':
        // Database'den gelen array formatı veya dummy data formatı
        if (Array.isArray(tableData.altYukleniciHatalar) && tableData.altYukleniciHatalar.length > 0 && Array.isArray(tableData.altYukleniciHatalar[0])) {
          // Database formatı (array of arrays)
          exportData = tableData.altYukleniciHatalar.map((row: any[]) => ({
            'Aselsan İş Emri No': row[0] || '-',
            'Aselsan Sipariş No': row[1] || '-',
            'Aselsan Sipariş Kalem No': row[2] || '-',
            'Firma Adı': row[3] || '-',
            'Stok Kodu': row[4] || '-',
            'Operasyon Tanımı': row[5] || '-',
            'Durma Nedeni': row[6] || '-',
            'Hata Tanımı': row[7] || '-',
            'Durma Gün Sayısı': row[8] || '-'
          }));
        } else {
          // Dummy data formatı (object)
          exportData = tableData.altYukleniciHatalar.map((item: any) => ({
            'Aselsan İş Emri No': item.aselsanIsEmriNo || '-',
            'Aselsan Sipariş No': item.aselsanSiparisNo || '-',
            'Aselsan Sipariş Kalem No': item.aselsanSiparisKalemNo || '-',
            'Firma Adı': item.firmaAdi || '-',
            'Stok Kodu': item.stokKodu || '-',
            'Operasyon Tanımı': item.operasyonTanimi || '-',
            'Durma Nedeni': item.durmaNedeni || '-',
            'Hata Tanımı': item.hataTanimi || '-',
            'Durma Gün Sayısı': item.durmaGunSayisi || '-'
          }));
        }
        fileName = 'Alt_Yuklenici_Hatalar';
        break;
      case 'sap-hatalar':
        exportData = tableData.sapHatalar.map((item: any) => ({
          'Bildirim No': item.bildirimNo,
          'Durum': item.durum,
          'Açıklama': 'SAP sistem hatası giderilmesi devam ediyor'
        }));
        fileName = 'SAP_Hatalar';
        break;
      case 'robot-servis':
        exportData = tableData.robotServis.map((item: any) => ({
          'Otomasyon ID': item.otomasyonId,
          'Durum': item.durum,
          'Son Güncelleme': `${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
        }));
        fileName = 'Robot_Servis';
        break;
      case 'kalifikasyon':
        exportData = tableData.kalifikasyon.map((item: any) => ({
          'Rapor No': item.raporNo,
          'Sonuç': item.sonuc,
          'Tarih': new Date().toLocaleDateString('tr-TR')
        }));
        fileName = 'Kalifikasyon_Raporlari';
        break;
    }

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Veri');

    // Generate filename with timestamp and part number
    const timestamp = new Date().toISOString().slice(0, 10);
    const fullFileName = `${fileName}_${searchedPartNumber}_${timestamp}.xlsx`;

    // Save file
    XLSX.writeFile(wb, fullFileName);
  };

  const handleDerinizHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is in top right area (top 25% and right 25% of the div)
    const isTopRight = mouseX > rect.width * 0.75 && mouseY < rect.height * 0.25;

    setShowTooltip(isTopRight);
  };

  const handleDerinizMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is in top right area (top 25% and right 25% of the div)
    const isTopRight = mouseX > rect.width * 0.80 && mouseY < rect.height * 0.20;

    setShowTooltip(isTopRight);
  };

  const handleDerinizLeave = () => {
    setShowTooltip(false);
  };

  const handleRomiotHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is in top right area (top 25% and right 25% of the div)
    const isTopRight = mouseX > rect.width * 0.75 && mouseY < rect.height * 0.25;

    setShowRomiotTooltip(isTopRight);
  };

  const handleRomiotMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is in top right area (top 25% and right 25% of the div)
    const isTopRight = mouseX > rect.width * 0.40 && mouseY < rect.height * 0.40;

    setShowRomiotTooltip(isTopRight);
  };

  const handleRomiotLeave = () => {
    setShowRomiotTooltip(false);
  };

  // Toggle feature expansion for subfeatures
  const toggleFeatureExpansion = (index: number) => {
    setExpandedFeatures((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Carousel navigation for announcements
  const handleNextAnnouncement = () => {
    setCurrentAnnouncementIndex((prev) => {
      const nextIndex = prev + 3;
      // Don't go beyond the last set of announcements
      return nextIndex < announcements.length ? nextIndex : prev;
    });
  };

  const handlePrevAnnouncement = () => {
    setCurrentAnnouncementIndex((prev) => {
      const prevIndex = prev - 3;
      // Don't go below 0
      return prevIndex >= 0 ? prevIndex : prev;
    });
  };

  // Check if navigation buttons should be disabled
  const announcementsPerPage = 3;
  const isFirstPage = currentAnnouncementIndex === 0;
  const isLastPage = currentAnnouncementIndex + announcementsPerPage >= announcements.length;

  // Handle announcement card click
  const handleAnnouncementClick = (announcement: Announcement) => {
    console.log("🔔 Clicked announcement:", {
      id: announcement.id,
      title: announcement.title,
      hasImage: !!announcement.content_image,
      imageLength: announcement.content_image?.length,
      hasDetail: !!announcement.content_detail,
      detailContent: announcement.content_detail,
      hasSummary: !!announcement.content_summary,
      summaryContent: announcement.content_summary
    });
    setSelectedAnnouncement(announcement);
    setShowAnnouncementModal(true);
  };

  // Handle "Tümünü Gör" button click
  const handleViewAllAnnouncements = () => {
    setShowAllAnnouncementsModal(true);
  };

  const closeAllAnnouncementsModal = () => {
    setShowAllAnnouncementsModal(false);
  };

  // Use useLayoutEffect to set platform BEFORE any effects run (including API calls)
  useLayoutEffect(() => {
    if (platformCode) {
      console.log('[Platform Page] Setting platform in context:', platformCode);


      // Set platform in context (this also sets localStorage and fetches platform data)
      setPlatformByCode(platformCode);


      // Clear cache to force fresh data fetch with new platform
      console.log('[Platform Page] Clearing API cache for platform switch');
      api.clearCache();
    }
  }, [platformCode, setPlatformByCode]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('[Platform Page] Fetching data for platform:', platformCode);
        console.log('[Platform Page] localStorage platform_code:', localStorage.getItem('platform_code'));

        const [dashboardData, reportData] = await Promise.all([
          dashboardService.getDashboards(),
          reportsService.getReports(0, 3)
        ]);
        setDashboards(dashboardData);
        setReports(reportData);

        // Fetch announcements if platform data is available
        if (platformData?.id) {
          // Don't include general announcements on platform-specific pages (includeGeneral: false)
          const announcementData = await announcementService.getAnnouncements(0, 10, platformData.id, true, false, false);

          // Debug: Log announcement data
          console.log("📢 Fetched announcements for platform:", platformData.id, announcementData);
          announcementData.forEach((ann, idx) => {
            console.log(`Announcement ${idx + 1}:`, {
              id: ann.id,
              title: ann.title,
              hasImage: !!ann.content_image,
              imagePrefix: ann.content_image?.substring(0, 30),
              hasDetail: !!ann.content_detail,
              detailLength: ann.content_detail?.length
            });
          });

          setAnnouncements(announcementData);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setError("Veriler yüklenemedi");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [platformCode, platformData]);

  const handleCreateDashboard = () => {
    router.push(`/${platformCode}/dashboard/add`);
  };

  const handleCreateReport = () => {
    router.push(`/${platformCode}/reports/add`);
  };

  const handleDashboardClick = (id: number) => {
    router.push(`/${platformCode}/dashboard/${id}`);
  };

  const handleReportClick = (report: SavedReport) => {
    // If report is a direct link, open in new tab
    if (report.isDirectLink && report.directLink) {
      window.open(report.directLink, '_blank', 'noopener,noreferrer');
      return;
    }

    // Otherwise, navigate to report detail page
    router.push(`/${platformCode}/reports/${report.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="text-lg text-gray-600">Ekranlar yükleniyor...</div>
        </div>
      </div>
    );
  }

  // Seyir Platform Special UI
  if (isSeyirPlatform) {
    return (
      <div className="min-h-screen bg-gray-50 pt-3 px-6 pb-6 relative">
        {/* Background images - fixed position, behind content */}
        <div
          className="fixed inset-0 pointer-events-none overflow-hidden"
          style={{ zIndex: 1 }}
          aria-hidden="true"
        >
          {/* ÜST - SOL | resmin SAĞ yarısı görünecek */}
          <div className="absolute top-0 left-0 w-1/2 h-1/2 overflow-hidden">
            <img
              src="/amom_icons/ahtapot.png"
              alt=""
              className="absolute"
              style={{
                top: '50%',
                left: '50%',
                width: '120%',
                transform: 'translate(-70%, -50%) translateX(-30%)',
                opacity: 0.4,
                WebkitMaskImage: 'linear-gradient(to left, black 70%, transparent 100%)',
                maskImage: 'linear-gradient(to left, black 70%, transparent 100%)',
              }}
            />
          </div>

          {/* ALT - SAĞ | resmin SOL yarısı görünecek */}
          <div className="absolute bottom-0 right-0 w-1/2 h-1/2 overflow-hidden">
            <img
              src="/amom_icons/ahtapot.png"
              alt=""
              className="absolute"
              style={{
                top: '50%',
                left: '50%',
                width: '120%',
                transform: 'translate(-30%, -50%) translateX(30%)',
                opacity: 0.4,
                WebkitMaskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
                maskImage: 'linear-gradient(to right, black 70%, transparent 100%)',
              }}
            />
          </div>
        </div>

        {/* Content - above background */}
        <div className="relative" style={{ zIndex: 2 }}>
          {/* Welcome Section */}
          <div className="mb-2 flex flex-col items-center justify-center w-full">
            <h1 className="text-2xl font-bold mb-1" style={{ color: "rgb(69,81,89)" }}>
              Hoş Geldiniz{user?.name ? `, ${user.name}` : ''}
            </h1>
            <p className="text-sm text-gray-600">Başlatmak istediğiniz süreci seçin</p>
          </div>

          {/* Süreçler Title */}
          <div className="w-full">
            <div className="max-w-7xl mx-auto px-4   lg:px-8">
              <div className="mb-3">
                <h3 className="text-2xl font-bold mb-2" style={{ color: "rgb(69,81,89)" }}>
                  Süreçler
                </h3>
                <div className="w-[100px] h-[5px] bg-red-600"></div>
              </div>
            </div>
          </div>

          {/* 5 Icons - Square Design */}
          <div className="max-w-6xl mx-auto mb-6">
            <div className="grid grid-cols-5 gap-4">
              {/* Icon 1 - Genel Süreçler */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => router.push('/')}
              >
                <div className="relative group-hover:scale-110 transition-all duration-300">
                  <div className="w-56 h-48 rounded-xl flex items-center justify-center bg-gradient-to-br from-white to-gray-50 p-1.5 shadow-xl group-hover:shadow-2xl transition-all duration-300">
                    <div className="w-full h-full rounded-lg overflow-hidden bg-white">
                      <img
                        src="/amom_icons/genel.png"
                        alt="Genel Süreçler"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Icon 2 - Kalifikasyon Süreçleri */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => router.push('/')}
              >
                <div className="relative group-hover:scale-110 transition-all duration-300">
                  <div className="w-56 h-48 rounded-xl flex items-center justify-center bg-gradient-to-br from-white to-gray-50 p-1.5 shadow-xl group-hover:shadow-2xl transition-all duration-300">
                    <div className="w-full h-full rounded-lg overflow-hidden bg-white">
                      <img
                        src="/amom_icons/kalifikasyon.png"
                        alt="Kalifikasyon Süreçleri"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Icon 3 - Prototip Süreçleri */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => router.push('/')}
              >
                <div className="relative group-hover:scale-110 transition-all duration-300">
                  <div className="w-56 h-48 rounded-xl flex items-center justify-center bg-gradient-to-br from-white to-gray-50 p-1.5 shadow-xl group-hover:shadow-2xl transition-all duration-300">
                    <div className="w-full h-full rounded-lg overflow-hidden bg-white">
                      <img
                        src="/amom_icons/prototip.png"
                        alt="Prototip Süreçleri"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Icon 4 - Tasarım Süreçleri */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => router.push('/')}
              >
                <div className="relative group-hover:scale-110 transition-all duration-300">
                  <div className="w-56 h-48 rounded-xl flex items-center justify-center bg-gradient-to-br from-white to-gray-50 p-1.5 shadow-xl group-hover:shadow-2xl transition-all duration-300">
                    <div className="w-full h-full rounded-lg overflow-hidden bg-white">
                      <img
                        src="/amom_icons/tasarım.png"
                        alt="Tasarım Süreçleri"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Icon 5 - Raporlar */}
              <div
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => router.push('/seyir/reports')}
              >
                <div className="relative group-hover:scale-110 transition-all duration-300">
                  <div className="w-56 h-48 rounded-xl flex items-center justify-center bg-gradient-to-br from-white to-gray-50 p-1.5 shadow-xl group-hover:shadow-2xl transition-all duration-300">
                    <div className="w-full h-full rounded-lg overflow-hidden bg-white">
                      <img
                        src="/amom_icons/rapor.png"
                        alt="Raporlar"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Professional Divider Line */}
          <div className="w-full pt-0 pb-0 mt-0 mb-4">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mb-4">
                <h3 className="text-2xl font-bold mb-2" style={{ color: "rgb(69,81,89)" }}>
                  Ürün Sorgulama
                </h3>
                <div className="w-[100px] h-[5px] bg-red-600"></div>
              </div>
            </div>
          </div>


          {/* Search Bar */}
          <div className="max-w-6xl mx-auto mb-4">
            <div className="relative">
              {searchedPartNumber ? (
                // Searched state - showing searched part number as embedded chip
                <div className="w-full px-5 py-1.5 pr-12 text-base border-2 border-cyan-500 bg-cyan-50 rounded-full shadow-md flex items-center gap-2">
                  <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="text-gray-500 text-sm">Aranan Parça:</span>
                  <div className="px-3 py-1 bg-cyan-600 text-white rounded-full font-semibold text-sm shadow-sm">
                    {searchedPartNumber}
                  </div>
                  <button
                    onClick={() => {
                      setSearchedPartNumber(null);
                      setTableData(null);
                      setSearchValue('');
                      setIsLoadingData(false);
                    }}
                    className="ml-auto p-1.5 hover:bg-cyan-200 rounded-full transition-colors"
                    title="Aramayı temizle"
                  >
                    <svg className="w-4 h-4 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                // Default search input state
                <>
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Parça numarası giriniz"
                    className="w-full px-5 py-1.5 pr-12 text-base border-2 border-gray-300 rounded-full shadow-md focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 transition-all"
                  />
                  <button
                    onClick={handleSearch}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-cyan-600 text-white p-2 rounded-full hover:bg-cyan-700 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 8 Table Boxes - 4x4 Grid (only after search) */}
          {(tableData || isLoadingData) && <div className="max-w-6xl mx-auto mb-4">
            <div className="grid grid-cols-4 gap-4">
              {/* Table Box 1 - Alt Yüklenici Açık Üretim Siparişleri */}
              <div
                onClick={() => setSelectedTable('alt-yuklenici')}
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border border-gray-100 h-[150px] flex flex-col"
              >
                <div className="px-3 py-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs leading-tight flex-1 text-center">Alt Yüklenici Açık Üretim</h3>
                  <Search className="w-3 h-3 text-white/70" />
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Yükleniyor...</span>
                    </div>
                  ) : !tableData ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 italic">Parça numarası girin...</p>
                    </div>
                  ) : tableData.altYukleniciTotalCount === 0 ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-400">Bilgi Yok</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-600 mb-1">
                        <span>{tableData.altYukleniciTotalCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-600">{tableData.altYukleniciFilteredCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Box 2 - Aselsan İçi Açık Üretim Siparişleri */}
              <div
                onClick={() => setSelectedTable('aselsan-ici')}
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border border-gray-100 h-[150px] flex flex-col"
              >
                <div className="px-3 py-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs leading-tight flex-1 text-center">Aselsan Açık Üretim</h3>
                  <Search className="w-3 h-3 text-white/70" />
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Yükleniyor...</span>
                    </div>
                  ) : !tableData ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 italic">Parça numarası girin...</p>
                    </div>
                  ) : tableData.aselsanIciTotalCount === 0 ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-400">Bilgi Yok</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-600 mb-1">
                        <span>{tableData.aselsanIciTotalCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-600">{tableData.aselsanIciFilteredCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Box 3 - Test Verisi */}
              <div
                onClick={() => setSelectedTable('deriniz')}
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border border-gray-100 h-[150px] flex flex-col"
              >
                <div className="px-3 py-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs leading-tight flex-1 text-center">Test Verisi</h3>
                  <Search className="w-3 h-3 text-white/70" />
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Yükleniyor...</span>
                    </div>
                  ) : !tableData ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 italic">Parça numarası girin...</p>
                    </div>
                  ) : tableData.derinizTotalCount === 0 ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-400">Bilgi Yok</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-600 mb-1">
                        <span>{tableData.derinizTotalCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-600">{tableData.derinizFilteredCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Box 4 - Prototip ve Tasarım */}
              <div
                className="bg-white rounded-xl shadow-md transition-all duration-300 overflow-hidden border border-gray-100 h-[150px] flex flex-col opacity-60 cursor-not-allowed"
              >
                <div className="px-3 py-2 flex-shrink-0" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs text-center leading-tight">Prototip ve Tasarım</h3>
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-400">Yapım Aşamasında ...</p>
                  </div>
                </div>
              </div>

              {/* Table Box 5 - Alt Yüklenici Açık Hata */}
              <div
                onClick={() => setSelectedTable('alt-yuklenici-hatalar')}
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border border-gray-100 h-[150px] flex flex-col"
              >
                <div className="px-3 py-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs leading-tight flex-1 text-center">Alt Yüklenici Açık Hata</h3>
                  <Search className="w-3 h-3 text-white/70" />
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Yükleniyor...</span>
                    </div>
                  ) : !tableData ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 italic">Parça numarası girin...</p>
                    </div>
                  ) : tableData.altYukleniciHatalarTotalCount === 0 ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-400">Bilgi Yok</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-600 mb-1">
                        <span>{tableData.altYukleniciHatalarTotalCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-600">{tableData.altYukleniciHatalarFilteredCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Box 6 - Aselsan Açık Hata */}
              <div
                onClick={() => setSelectedTable('sap-hatalar')}
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border border-gray-100 h-[150px] flex flex-col"
              >
                <div className="px-3 py-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs leading-tight flex-1 text-center">Aselsan Açık Hata</h3>
                  <Search className="w-3 h-3 text-white/70" />
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Yükleniyor...</span>
                    </div>
                  ) : !tableData ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 italic">Parça numarası girin...</p>
                    </div>
                  ) : tableData.sapHatalarTotalCount === 0 ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-400">Bilgi Yok</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-600 mb-1">
                        <span>{tableData.sapHatalarTotalCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-600">{tableData.sapHatalarFilteredCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Box 7 - Üst Aşama */}
              <div
                onClick={() => setSelectedTable('kalifikasyon')}
                className="bg-white rounded-xl shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer overflow-hidden border border-gray-100 h-[150px] flex flex-col"
              >
                <div className="px-3 py-2 flex-shrink-0 flex items-center justify-between" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs leading-tight flex-1 text-center">Üst Aşama</h3>
                  <Search className="w-3 h-3 text-white/70" />
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  {isLoadingData ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs text-gray-500">Yükleniyor...</span>
                    </div>
                  ) : !tableData ? (
                    <div className="text-center">
                      <p className="text-sm text-gray-500 italic">Parça numarası girin...</p>
                    </div>
                  ) : tableData.kalifikasyonTotalCount === 0 ? (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-400">Bilgi Yok</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-cyan-600 mb-1">
                        <span>{tableData.kalifikasyonTotalCount}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-green-600">{tableData.kalifikasyonFilteredCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Box 8 - Robot Verileri */}
              <div
                className="bg-white rounded-xl shadow-md transition-all duration-300 overflow-hidden border border-gray-100 h-[150px] flex flex-col opacity-60 cursor-not-allowed"
              >
                <div className="px-3 py-2 flex-shrink-0" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <h3 className="font-bold text-white text-xs text-center leading-tight">Robot Verileri</h3>
                </div>
                <div className="p-2 flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-400">Yapım Aşamasında ...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>}

          {/* Table Detail Modal - Modern Design */}
          {isMounted && selectedTable && createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden"
              onClick={() => setSelectedTable(null)}
            >
              <div
                className="bg-white rounded-3xl shadow-2xl w-[95vw] max-w-[1600px] min-h-[500px] max-h-[90vh] flex flex-col overflow-hidden border border-gray-200 transform transition-all"
                onClick={(e) => e.stopPropagation()}
                style={{
                  animation: 'slideUp 0.3s ease-out'
                }}
              >
                {/* Modal Header - Clean Design */}
                <div className="relative px-6 py-3 overflow-hidden flex-shrink-0 border-b border-white/10" style={{ backgroundColor: 'rgb(30, 64, 175)' }}>
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h2 className="text-xl font-bold text-white tracking-tight">
                        {selectedTable === 'alt-yuklenici' && 'Alt Yüklenici Açık Üretim Siparişleri'}
                        {selectedTable === 'aselsan-ici' && 'Aselsan İçi Açık Üretim Siparişleri'}
                        {selectedTable === 'prototip-ahtapot' && 'Prototip Üretim ve Ahtapot Tasarım Süreçlerindeki Durum'}
                        {selectedTable === 'deriniz' && 'Deriniz\'den Gelen Bilgiler'}
                        {selectedTable === 'alt-yuklenici-hatalar' && 'Alt Yüklenici Açık Bildirim Hataları'}
                        {selectedTable === 'sap-hatalar' && 'SAP Açık Bildirim Hataları'}
                        {selectedTable === 'robot-servis' && 'Robotlardan Gelen Verinin Servis Edilmesi'}
                        {selectedTable === 'kalifikasyon' && 'Kalifikasyon Raporlarından Gelen Bilgiler'}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Export to Excel Button */}
                      {tableData && !isLoadingData && (
                        <button
                          onClick={handleExportToExcel}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl transition-all hover:scale-105 backdrop-blur-sm group"
                          title="Excel'e Aktar"
                        >
                          <Download className="h-5 w-5 text-white group-hover:animate-bounce" />
                          <span className="text-white font-semibold text-sm">Excel İndir</span>
                        </button>
                      )}
                      {/* Close Button */}
                      <button
                        onClick={() => setSelectedTable(null)}
                        className="p-2.5 hover:bg-white/20 rounded-xl transition-all hover:scale-110 backdrop-blur-sm"
                      >
                        <X className="h-6 w-6 text-white" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="p-4 flex-1 min-h-0 overflow-y-auto bg-white">
                  {isLoadingData && (
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4 mb-6 shadow-sm">
                      <p className="text-blue-900 font-semibold animate-pulse flex items-center gap-2">
                        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Veriler yükleniyor...
                      </p>
                    </div>
                  )}
                  {!tableData && !isLoadingData && (
                    <div className="text-center py-12">
                      <div className="w-20 h-20 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-lg font-medium">Lütfen bir parça numarası arayın</p>
                    </div>
                  )}
                  {tableData && !isLoadingData && paginatedData && (
                    <div className="h-full overflow-hidden">
                      <TableVisualization
                        query={{
                          id: selectedTable || 'default',
                          filters: getTableVisualizationFilters(),
                          visualization: {}
                        } as any}
                        result={{
                          columns: paginatedData.columns,
                          data: paginatedData.data,
                          query_id: selectedTable || 'default',
                          query_name: selectedTable || 'Table',
                          total_rows: totalRows,
                          execution_time_ms: 0,
                          success: true
                        } as any}
                        sorting={sorting}
                        onColumnSort={handleColumnSort}
                        filters={filters}
                        openPopovers={openPopovers}
                        dropdownOptions={dropdownOptions}
                        onFilterChange={handleFilterChange}
                        onDebouncedFilterChange={handleFilterChange}
                        setOpenPopovers={setOpenPopovers}
                        currentPage={currentPage}
                        pageSize={pageSize}
                        totalPages={totalPages}
                        totalRows={totalRows}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        size="lg"
                      />
                    </div>
                  )}
                </div>

              </div>
            </div>
            , document.body)}

          {/* Full-width Duyurular Section */}
          <div className="w-full py-6 mb-4">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mb-8">
                <h3 className="text-2xl font-bold mb-2" style={{ "color": "rgb(69,81,89)" }}>Duyurular</h3>
                <div className="w-[100px] h-[5px] bg-red-600"></div>
              </div>

              {announcements.length > 0 ? (
                <>
                  {/* Carousel Container */}
                  <div className="relative flex justify-center">
                    {/* Navigation Arrows - Only show if more than 3 items */}
                    {announcements.length > 3 && (
                      <>
                        <button
                          onClick={handlePrevAnnouncement}
                          disabled={isFirstPage}
                          className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors ${isFirstPage
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={handleNextAnnouncement}
                          disabled={isLastPage}
                          className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors ${isLastPage
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}

                    {/* Carousel Cards */}
                    <div className="flex gap-6 justify-center items-start max-w-4xl mx-auto">
                      {announcements.slice(currentAnnouncementIndex, currentAnnouncementIndex + 3).map((announcement) => {
                        const isAnnouncementHovered = hoveredAnnouncement === announcement.id;
                        return (
                          <div
                            key={announcement.id}
                            className="flex-shrink-0 w-80 cursor-pointer transition-transform hover:scale-105"
                            onClick={() => handleAnnouncementClick(announcement)}
                            onMouseEnter={() => setHoveredAnnouncement(announcement.id)}
                            onMouseLeave={() => setHoveredAnnouncement(null)}
                          >
                            <div className={`relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl transition-all ${isAnnouncementHovered ? 'ring-2 ring-[#FF5620]' : ''
                              }`}>
                              {/* Image Area - Top section with proper aspect ratio */}
                              {announcement.content_image && (
                                <div className="absolute top-0 left-0 right-0 bottom-0">
                                  <img
                                    src={announcement.content_image}
                                    alt={announcement.title}
                                    className="w-full h-full object-fill"
                                  />
                                  {/* Gradient overlay for text readability */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                                </div>
                              )}

                              {/* Glow Effect */}
                              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-20 blur-xl"></div>

                              {/* Main Title - Lower position for better image visibility */}
                              <div className="absolute bottom-16 left-4 right-4 z-10">
                                <div className="text-white font-bold text-xl leading-tight text-left">
                                  {announcement.title.split('\n').map((line, i) => (
                                    <div key={i}>{line}</div>
                                  ))}
                                </div>
                              </div>

                              {/* Month Badge - Bottom Left, Small */}
                              {announcement.month_title && (
                                <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-md shadow-lg z-10">
                                  <span className="text-xs font-semibold uppercase">{announcement.month_title}</span>
                                </div>
                              )}

                              {/* Click Indicator */}
                              <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs z-10">
                                Detaylar →
                              </div>
                            </div>

                            {/* Card Description */}
                            <div className="mt-3">
                              <div className="h-1 w-12 bg-red-600 mb-2"></div>
                              <h4 className="text-gray-900 font-semibold mb-1 line-clamp-2">{announcement.content_summary || announcement.title}</h4>
                              <p className="text-gray-600 text-sm">
                                {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tümünü Gör Button */}
                  {announcements.length > 3 && (
                    <div className="flex justify-center mt-8">
                      <button
                        onClick={handleViewAllAnnouncements}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                      >
                        <Eye className="h-5 w-5" />
                        Tüm Duyuruları Gör ({announcements.length})
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <MessageSquare className="h-8 w-8 text-gray-400" />
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">
                    Şu anda aktif duyuru bulunmamaktadır
                  </h4>
                  <p className="text-gray-500 text-sm">
                    Yeni duyurular eklendiğinde burada görünecektir
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Announcement Detail Modal */}
          {showAnnouncementModal && selectedAnnouncement && (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
              onClick={() => setShowAnnouncementModal(false)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto animate-fade-in [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-gray-400"
                onClick={(e) => e.stopPropagation()}
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent' }}
              >
                {/* Modal Header */}
                <div className="relative">
                  {selectedAnnouncement.content_image && (
                    <div className="w-full h-[500px] bg-gradient-to-br from-blue-900 to-blue-800 relative overflow-hidden">
                      <img
                        src={selectedAnnouncement.content_image}
                        alt={selectedAnnouncement.title}
                        className="w-full h-full object-fill"
                      />
                      {selectedAnnouncement.month_title && (
                        <div className="absolute bottom-4 left-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-10">
                          <span className="text-sm font-bold uppercase">{selectedAnnouncement.month_title}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={() => setShowAnnouncementModal(false)}
                    className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors z-10 cursor-pointer"
                  >
                    <X className="h-5 w-5 text-gray-700" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6">
                  {/* Title */}
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedAnnouncement.title}
                  </h2>

                  {/* Date */}
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(selectedAnnouncement.creation_date).toLocaleDateString('tr-TR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}</span>
                  </div>

                  {/* Summary */}
                  {selectedAnnouncement.content_summary && (
                    <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-600 rounded-r-lg">
                      <p className="text-gray-700 font-medium">{selectedAnnouncement.content_summary}</p>
                    </div>
                  )}

                  {/* Divider */}
                  {selectedAnnouncement.content_detail && (
                    <div className="border-t border-gray-200 my-4"></div>
                  )}

                  {/* Detail Content - Main content of the announcement */}
                  {selectedAnnouncement.content_detail && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Detaylı İçerik</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div
                          className="text-gray-700 leading-relaxed [&>p]:mb-4 [&>p:last-child]:mb-0 [&>p:empty]:min-h-[1em]"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(selectedAnnouncement.content_detail)
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* No Detail Message */}
                  {!selectedAnnouncement.content_detail && !selectedAnnouncement.content_summary && (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                      <p>Bu duyuru için detaylı açıklama bulunmamaktadır.</p>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <button
                    onClick={() => setShowAnnouncementModal(false)}
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* All Announcements Modal */}
          {showAllAnnouncementsModal && announcements.length > 0 && (
            <div
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              onClick={() => setShowAllAnnouncementsModal(false)}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] animate-fade-in overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-6 w-6 text-white" />
                    <h3 className="text-xl font-bold text-white">Tüm Duyurular</h3>
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm text-white font-medium">
                      {announcements.length}
                    </span>
                  </div>
                  <button
                    onClick={closeAllAnnouncementsModal}
                    className="p-2 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>

                {/* Modal Body - Grid */}
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[65vh] overflow-y-auto px-2 md:px-4 lg:px-6 py-4">
                    {announcements.map((announcement) => {
                      const isAnnouncementHovered = hoveredAnnouncement === announcement.id;
                      return (
                        <div
                          key={announcement.id}
                          className="cursor-pointer transition-transform hover:scale-105"
                          onClick={() => handleAnnouncementClick(announcement)}
                          onMouseEnter={() => setHoveredAnnouncement(announcement.id)}
                          onMouseLeave={() => setHoveredAnnouncement(null)}
                        >
                          <div className={`relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl transition-all ${isAnnouncementHovered ? 'ring-2 ring-[#FF5620]' : ''
                            }`}>
                            {announcement.content_image && (
                              <div className="absolute top-0 left-0 right-0 bottom-0">
                                <img
                                  src={announcement.content_image}
                                  alt={announcement.title}
                                  className="w-full h-full object-fill"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                              </div>
                            )}

                            <div className="absolute bottom-16 left-4 right-4 z-10">
                              <div className="text-white font-bold text-xl leading-tight text-left">
                                {announcement.title.split('\n').map((line, i) => (
                                  <div key={i}>{line}</div>
                                ))}
                              </div>
                            </div>

                            {announcement.month_title && (
                              <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-md shadow-lg z-10">
                                <span className="text-xs font-semibold uppercase">{announcement.month_title}</span>
                              </div>
                            )}

                            <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs z-10">
                              Detaylar →
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="h-1 w-12 bg-red-600 mb-2"></div>
                            <h4 className="text-gray-900 font-semibold mb-1 line-clamp-2">{announcement.content_summary || announcement.title}</h4>
                            <p className="text-gray-600 text-sm">
                              {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MIRAS Assistant Chatbot */}
          <MirasAssistant />

          {/* Feedback Button */}
          <Feedback />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background Image with Opacity */}
      {platformCode === 'ivme' && (
        <div className="fixed -z-10 inset-0 top-[-400px] opacity-20 pointer-events-none" style={{ backgroundImage: 'url(/wave_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
      )}

      {/* Romiot branding elements */}
      {platformCode === 'romiot' && (
        <>
          <div
            className="fixed pointer-events-auto z-10 cursor-pointer"
            style={{
              width: '420px',
              height: '500px',
              backgroundImage: 'url(/romiot-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.2,
              top: '100px',
              left: '-100px',
            }}
            onMouseMove={handleRomiotMove}
            onMouseLeave={handleRomiotLeave}
          ></div>

          {/* Tooltip */}
          {showRomiotTooltip && (
            <div
              className="fixed z-50 pointer-events-none animate-fade-in"
              style={{
                top: '500px',
                left: '0px',
              }}
            >
              <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-xl py-4 px-6 shadow-2xl border border-blue-400/20 backdrop-blur-sm max-w-md">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                  <div className="font-bold text-lg tracking-wide">{platformCode.toUpperCase()}</div>
                </div>

                <div className="text-blue-100 text-sm leading-relaxed mb-3">
                  <p className="mb-2">
                    Mavi balinalar, dünyadaki en büyük canlılardır ve okyanus ekosisteminin taşıyıcı omurgasını oluşturur. Bu eşsiz güçten ilhamla geliştirilen ODAK IoT Platformu, tüm dijital sistemleri bir araya getiren merkezi bir omurga görevi görür.
                  </p>
                  <p className="mb-2 font-semibold">
                    ODAK IoT Balinası yalnızca bir sembol değil;
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Endüstriyel robot kollarıyla otomasyon sistemlerini,</li>
                    <li>Bulut yapısıyla veri ekosistemini,</li>
                    <li>5G ve 5Ghz bağlantısıyla haberleşme omurgasını,</li>
                    <li>Kuyruğundaki dijital veri akışıyla bilgi taşıyıcılığını temsil ediyor.</li>
                  </ul>
                </div>
                {/* Glowing border effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 to-purple-600/30 rounded-xl blur-sm -z-10"></div>
              </div>
            </div>
          )}

          <div
            className="fixed pointer-events-none z-10"
            style={{
              width: '420px',
              height: '500px',
              backgroundImage: 'url(/romiot-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.2,
              bottom: '200px',
              right: '-100px',
            }}
          >
            {/* Right top hover area */}
            <div
              className="absolute top-0 right-0 w-20 h-20 pointer-events-auto cursor-pointer"
              onMouseEnter={handleRomiotHover}
              onMouseLeave={handleRomiotLeave}
            ></div>
          </div>
        </>
      )}

      {/* Only show DerinIZ branding elements when platform is deriniz */}
      {platformCode === 'deriniz' && (
        <>
          <div
            className="fixed pointer-events-auto z-10 cursor-pointer"
            style={{
              width: '450px',
              height: '500px',
              backgroundImage: 'url(/deriniz-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.2,
              top: '200px',
              left: '-200px',
            }}
            onMouseMove={handleDerinizMove}
            onMouseLeave={handleDerinizLeave}
          ></div>

          {/* Tooltip */}
          {showTooltip && (
            <div
              className="fixed z-50 pointer-events-none animate-fade-in"
              style={{
                top: '500px',
                left: '0px',
              }}
            >
              <div className="bg-gradient-to-br from-blue-600 to-purple-700 text-white rounded-xl py-4 px-6 shadow-2xl border border-blue-400/20 backdrop-blur-sm max-w-md">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </div>
                  <div className="font-bold text-lg tracking-wide">{platformCode.toUpperCase()}</div>
                </div>

                <div className="text-blue-100 text-sm leading-relaxed mb-3">
                  <p className="mb-2">
                    Fener Balığı ışığı %90 verimlilik ile üreten nadir bi canlıdır. 1,500 metreyi bulan derinliklerde yaşar ve ışığı yansıtmayan özel kamuflajıyla "görünmez" hale gelir.
                  </p>
                  <p>
                    DerinİZ platformunda, görünmeyen test verilerini, kullanıcıya görünür kılmayı hedefliyoruz. Doğru veriyi ortaya çıkartarak ara yüz ekosistemimizi sürekli geliştiriyoruz.
                  </p>
                </div>
                {/* Glowing border effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 to-purple-600/30 rounded-xl blur-sm -z-10"></div>
              </div>
            </div>
          )}

          <div
            className="fixed pointer-events-none z-10"
            style={{
              width: '500px',
              height: '500px',
              backgroundImage: 'url(/deriniz-bg.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: 0.2,
              bottom: '100px',
              right: '-250px',
            }}
          >
            {/* Right top hover area */}
            <div
              className="absolute top-0 right-0 w-20 h-20 pointer-events-auto cursor-pointer"
              onMouseEnter={handleDerinizHover}
              onMouseLeave={handleDerinizLeave}
            ></div>
          </div>
        </>
      )}
      {/* Main Content */}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${platformCode === 'deriniz' ? 'scale-90' : ''}`}>
        {/* Platform Logo - Show if exists */}
        {platformData?.theme_config?.leftLogo && (
          <div className="mb-6" style={{ position: 'absolute', top: '100px', left: '50px' }}>
            <img
              src={platformData.theme_config.leftLogo}
              alt={`${platformData.display_name} Logo`}
              className="h-30 object-contain"
            />
          </div>
        )}

        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 mb-2" style={{ "color": "rgb(69,81,89)" }}>
            Hoş Geldiniz{user?.name ? `, ${user.name}` : ''}
          </h1>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Features Section */}
        {platformData?.theme_config?.features && platformData.theme_config.features.length > 0 && (
          <div className="mb-16">
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${platformData.theme_config.features.length === 4
                ? 'lg:grid-cols-4'
                : platformData.theme_config.features.length === 5
                  ? 'lg:grid-cols-5'
                  : platformData.theme_config.features.length === 6
                    ? 'lg:grid-cols-6'
                    : 'lg:grid-cols-4'
              }`}>
              {platformData.theme_config.features.map((feature, index) => {
                const hasSubfeatures = feature.subfeatures && feature.subfeatures.length > 0;

                // Check if user has atolye role (any variant: yonetici, operator, or musteri)
                const hasAtolyeRole = user?.role && Array.isArray(user.role) &&
                  user.role.some((role) =>
                    typeof role === "string" &&
                    role.startsWith("atolye:") &&
                    (role.endsWith(":yonetici") || role.endsWith(":operator") || role.endsWith(":musteri"))
                  );

                // Check if this is the Atölye Takip Sistemi feature
                const isAtolyeFeature = feature.title?.toLowerCase().includes('atölye') ||
                  feature.title?.toLowerCase().includes('atolye') ||
                  feature.title?.toLowerCase().includes('takip') ||
                  feature.url?.includes('/atolye') ||
                  feature.url?.includes('atolye');

                // Ensure the feature URL is correct for atolye users
                let featureUrl = feature.url;
                // For atolye users on romiot platform, ensure Atölye Takip Sistemi has correct URL
                if (isAtolyeFeature && hasAtolyeRole && platformCode === 'romiot') {
                  // Always set the URL to the correct path for atolye feature
                  featureUrl = `/${platformCode}/atolye`;
                } else if (isAtolyeFeature && platformCode === 'romiot') {
                  // Even if user doesn't have atolye role, ensure URL is correct if it's the atolye feature
                  if (!featureUrl || !featureUrl.includes('atolye')) {
                    featureUrl = `/${platformCode}/atolye`;
                  }
                } else if (featureUrl && !featureUrl.startsWith('/') && !featureUrl.startsWith('http')) {
                  // If URL is relative, make it absolute for the current platform
                  featureUrl = `/${platformCode}${featureUrl.startsWith('/') ? '' : '/'}${featureUrl}`;
                }

                const cardContent = feature.useImage && feature.imageUrl ? (
                  // Image-based card design
                  <div className="bg-white rounded-lg shadow-xl shadow-slate-200 overflow-hidden hover:shadow-2xl transition-all duration-300">
                    {platformCode === 'romiot' ? (
                      // Romiot layout: Image on top, title centered below
                      <div className="flex flex-col items-center">
                        {/* Image at top - smaller size */}
                        <div className="w-full h-32 flex items-center justify-center p-4">
                          <img
                            src={feature.imageUrl}
                            alt={feature.title}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              // Fallback to icon card if image fails to load
                              const target = e.target as HTMLImageElement;
                              const card = target.closest('.bg-white');
                              if (card) {
                                card.innerHTML = `
                                  <div class="p-6 text-center">
                                    <div class="w-12 h-12 rounded-lg flex items-center justify-center mb-4 mx-auto" style="background-color: ${feature.backgroundColor}">
                                      <svg class="w-6 h-6" style="color: ${feature.iconColor}" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                      </svg>
                                    </div>
                                    <h4 class="font-semibold text-gray-900 mb-2">${feature.title}</h4>
                                    <p class="text-sm text-gray-600">${feature.description}</p>
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                        {/* Title centered below */}
                        {feature.title && feature.title.trim() && (
                          <div className="w-full p-4 text-center border-t border-gray-100">
                            <h4 className="font-semibold text-gray-900">{feature.title}</h4>
                            {feature.description && (
                              <p className="text-sm text-gray-600 mt-2">{feature.description}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : feature.title && feature.title.trim() ? (
                      // Two column layout when title exists (for non-romiot platforms)
                      <div className="flex">
                        {/* Left column - Image */}
                        <div className="w-40 h-40 flex-shrink-0">
                          <img
                            src={feature.imageUrl}
                            alt={feature.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to icon card if image fails to load
                              const target = e.target as HTMLImageElement;
                              const card = target.closest('.bg-white');
                              if (card) {
                                card.innerHTML = `
                                  <div class="p-6">
                                    <div class="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style="background-color: ${feature.backgroundColor}">
                                      <svg class="w-6 h-6" style="color: ${feature.iconColor}" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                      </svg>
                                    </div>
                                    <h4 class="font-semibold text-gray-900 mb-2">${feature.title}</h4>
                                    <p class="text-sm text-gray-600">${feature.description}</p>
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                        {/* Right column - Content */}
                        <div className="flex-1 p-4 flex flex-col justify-center">
                          <h4 className="font-semibold text-gray-900 mb-2">{feature.title}</h4>
                          <p className="text-sm text-gray-600">{feature.description}</p>
                        </div>
                      </div>
                    ) : (
                      // Image only when no title (for non-romiot platforms)
                      <div className="w-full h-40 mt-5 mb-5">
                        <img
                          src={feature.imageUrl}
                          alt="Feature"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            // Fallback to icon card if image fails to load
                            const target = e.target as HTMLImageElement;
                            const card = target.closest('.bg-white');
                            if (card) {
                              card.innerHTML = `
                                <div class="p-6">
                                  <div class="w-12 h-12 rounded-lg flex items-center justify-center mb-4" style="background-color: ${feature.backgroundColor}">
                                    <svg class="w-6 h-6" style="color: ${feature.iconColor}" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                    </svg>
                                  </div>
                                  <h4 class="font-semibold text-gray-900 mb-2">${feature.title || 'Feature'}</h4>
                                  <p class="text-sm text-gray-600">${feature.description}</p>
                                </div>
                              `;
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  // Icon-based card design (original)
                  <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                      style={{ backgroundColor: feature.backgroundColor }}
                    >
                      {(() => {
                        const IconComponent = iconMap[feature.icon] || Activity;
                        return (
                          <IconComponent
                            className="h-5 w-5"
                            style={{ color: feature.iconColor }}
                          />
                        );
                      })()}
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-2">{feature.title}</h4>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </div>
                );

                // If feature has a URL, or if it's the atolye feature for atolye users, make it clickable
                // Use the corrected featureUrl if it was modified for atolye feature
                const urlToUse = featureUrl || feature.url;

                // If feature has subfeatures, clicking should expand/collapse
                // Otherwise, if it has a URL, navigate to it
                const hasUrl = urlToUse || (isAtolyeFeature && hasAtolyeRole && platformCode === 'romiot');

                // Check if this feature is expanded or if any feature is expanded
                const isThisExpanded = expandedFeatures.has(index);
                const hasAnyExpanded = expandedFeatures.size > 0;
                const shouldDim = hasAnyExpanded && !isThisExpanded;
                const isHovered = hoveredFeature === index;

                return (
                  <div
                    key={index}
                    onMouseEnter={() => setHoveredFeature(index)}
                    onMouseLeave={() => setHoveredFeature(null)}
                    onClick={(e) => {
                      if (!checkAccess(feature, user)) {
                        setShowAccessDeniedModal(true);
                        return;
                      }

                      e.preventDefault();
                      e.stopPropagation();

                      // If has subfeatures, toggle expansion
                      if (hasSubfeatures) {
                        toggleFeatureExpansion(index);
                      } else if (hasUrl) {
                        // Otherwise, navigate to URL
                        console.log('Feature clicked:', feature.title, 'URL:', urlToUse, 'isAtolyeFeature:', isAtolyeFeature, 'hasAtolyeRole:', hasAtolyeRole);
                        const finalUrl = urlToUse || `/${platformCode}/atolye`;

                        // For romiot platform, show navigation modal
                        if (platformCode === 'romiot') {
                          // Clear any existing timer
                          if (navigationTimerRef.current) {
                            clearTimeout(navigationTimerRef.current);
                          }

                          setNavigatingFeature({
                            name: feature.title || 'Özellik',
                            imageUrl: feature.imageUrl,
                            url: finalUrl
                          });
                          setShowFeatureNavigationModal(true);

                          // Navigate after delay
                          navigationTimerRef.current = setTimeout(() => {
                            if (finalUrl.startsWith('http')) {
                              window.open(finalUrl, '_blank', 'noopener,noreferrer');
                            } else {
                              router.push(finalUrl);
                            }
                            setShowFeatureNavigationModal(false);
                            navigationTimerRef.current = null;
                          }, 2000);
                        } else {
                          // For other platforms, navigate immediately
                          if (finalUrl.startsWith('http')) {
                            window.open(finalUrl, '_blank', 'noopener,noreferrer');
                          } else {
                            router.push(finalUrl);
                          }
                        }
                      }
                    }}
                    className={`block transition-all duration-300 rounded-lg ${hasSubfeatures || hasUrl ? 'hover:scale-105 cursor-pointer' : ''
                      } ${shouldDim ? 'opacity-40' : 'opacity-100'} ${platformCode === 'romiot' && isHovered ? 'ring-2 ring-[#FF5620]' : ''
                      }`}
                    role={hasSubfeatures || hasUrl ? "button" : undefined}
                    tabIndex={hasSubfeatures || hasUrl ? 0 : undefined}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && (hasSubfeatures || hasUrl)) {
                        e.preventDefault();
                        if (hasSubfeatures) {
                          toggleFeatureExpansion(index);
                        } else if (hasUrl) {
                          const finalUrl = urlToUse || `/${platformCode}/atolye`;

                          // For romiot platform, show navigation modal
                          if (platformCode === 'romiot') {
                            // Clear any existing timer
                            if (navigationTimerRef.current) {
                              clearTimeout(navigationTimerRef.current);
                            }

                            setNavigatingFeature({
                              name: feature.title || 'Özellik',
                              imageUrl: feature.imageUrl,
                              url: finalUrl
                            });
                            setShowFeatureNavigationModal(true);

                            // Navigate after delay
                            navigationTimerRef.current = setTimeout(() => {
                              if (finalUrl.startsWith('http')) {
                                window.open(finalUrl, '_blank', 'noopener,noreferrer');
                              } else {
                                router.push(finalUrl);
                              }
                              setShowFeatureNavigationModal(false);
                              navigationTimerRef.current = null;
                            }, 2000);
                          } else {
                            // For other platforms, navigate immediately
                            if (finalUrl.startsWith('http')) {
                              window.open(finalUrl, '_blank', 'noopener,noreferrer');
                            } else {
                              router.push(finalUrl);
                            }
                          }
                        }
                      }
                    }}
                  >
                    {cardContent}
                  </div>
                );
              })}
            </div>

            {/* Subfeatures Section - Separate section below features */}
            {platformData.theme_config.features.some((feature, index) =>
              feature.subfeatures && feature.subfeatures.length > 0 && expandedFeatures.has(index)
            ) && (
                <div className="mt-8 opacity-0 animate-[fadeInSection_0.5s_ease-in-out_forwards]">
                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${platformData.theme_config.features.length === 4
                      ? 'lg:grid-cols-4'
                      : platformData.theme_config.features.length === 5
                        ? 'lg:grid-cols-5'
                        : platformData.theme_config.features.length === 6
                          ? 'lg:grid-cols-6'
                          : 'lg:grid-cols-4'
                    }`}>
                    {platformData.theme_config.features.map((feature, index) => {
                      const isExpanded = expandedFeatures.has(index);
                      if (!isExpanded || !feature.subfeatures || feature.subfeatures.length === 0) {
                        return null;
                      }

                      return feature.subfeatures.map((subfeature: any, subIndex: number) => {
                        const SubfeatureIcon = iconMap[subfeature.icon] || Activity;
                        const hasSubfeatureUrl = subfeature.url && subfeature.url.trim();
                        const canAccessSubfeature = checkAccess(subfeature, user);

                        if (!canAccessSubfeature) {
                          return null;
                        }

                        // Make URL relative to platform if needed
                        let subfeatureUrl = subfeature.url;
                        if (hasSubfeatureUrl && !subfeatureUrl.startsWith('/') && !subfeatureUrl.startsWith('http')) {
                          subfeatureUrl = `/${platformCode}${subfeatureUrl.startsWith('/') ? '' : '/'}${subfeatureUrl}`;
                        }

                        return (
                          <div
                            key={`${index}-sub-${subIndex}`}
                            onClick={(e) => {
                              if (hasSubfeatureUrl) {
                                e.preventDefault();
                                e.stopPropagation();
                                if (subfeatureUrl.startsWith('http')) {
                                  window.open(subfeatureUrl, '_blank', 'noopener,noreferrer');
                                } else {
                                  router.push(subfeatureUrl);
                                }
                              }
                            }}
                            className={`opacity-0 ${hasSubfeatureUrl ? "block hover:scale-105 transition-all cursor-pointer" : "block transition-all"}`}
                            style={{
                              animation: `slideUp 0.4s ease-out ${subIndex * 0.1}s forwards`
                            }}
                            role={hasSubfeatureUrl ? "button" : undefined}
                            tabIndex={hasSubfeatureUrl ? 0 : undefined}
                            onKeyDown={(e) => {
                              if ((e.key === 'Enter' || e.key === ' ') && hasSubfeatureUrl) {
                                e.preventDefault();
                                if (subfeatureUrl.startsWith('http')) {
                                  window.open(subfeatureUrl, '_blank', 'noopener,noreferrer');
                                } else {
                                  router.push(subfeatureUrl);
                                }
                              }
                            }}
                          >
                            <div className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-2xl transition-all duration-300 h-[180px] flex flex-col">
                              <div
                                className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                                style={{ backgroundColor: feature.backgroundColor || '#EFF6FF' }}
                              >
                                <SubfeatureIcon
                                  className="h-6 w-6"
                                  style={{ color: feature.iconColor || '#3B82F6' }}
                                />
                              </div>
                              <h4 className="font-semibold text-gray-900 mb-2">{subfeature.title}</h4>
                              {subfeature.description && (
                                <p className="text-sm text-gray-600">{subfeature.description}</p>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Continue Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 scale-90">
        {/* Dashboards Section */}
        {!isIvmePlatform && !isRomiotPlatform && (
          <div className="mb-6 flex items-center justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center">
              <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Ekranlarım</h3>
              <button
                onClick={() => router.push(`/${platformCode}/dashboard`)}
                className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
              >
                <Eye className="h-4 w-4" />
                Tüm Ekranlar
              </button>
            </div>
            <button
              onClick={handleCreateDashboard}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Yeni Ekran
            </button>
          </div>
        )}
        {/* Dashboard Grid */}
        {dashboards.length > 0 && !isIvmePlatform && isRomiotPlatform ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Sort dashboards: favorites first, then sort by creation date */}
            {[...dashboards]
              .sort((a, b) => {
                // First sort by favorite status
                if (a.is_favorite && !b.is_favorite) return -1;
                if (!a.is_favorite && b.is_favorite) return 1;
                // Then sort by creation date (newest first)
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
              .slice(0, 3)
              .map((dashboard) => {
                const config = dashboard.layout_config || {};
                const IconComponent = iconMap[config.iconName] || Layout;

                return (
                  <div
                    key={dashboard.id}
                    onClick={() => handleDashboardClick(dashboard.id)}
                    className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-lg ${config.color || 'bg-gray-500'} text-white`}>
                        <IconComponent className="h-6 w-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        {dashboard.is_favorite && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Star className="h-3 w-3 mr-1 fill-current" />
                            Favori
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${dashboard.is_public
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                          }`}>
                          {dashboard.is_public ? (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              Herkese Açık
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" />
                              Özel
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                      {dashboard.title}
                    </h3>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Layout className="h-4 w-4" />
                        <span>{dashboard.widgets?.length || 0} Widget</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(dashboard.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          !isIvmePlatform && !isRomiotPlatform && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Layout className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz dashboard bulunmuyor</h3>
              <p className="text-gray-500 mb-6">İlk dashboard'ınızı oluşturmak için aşağıdaki butona tıklayın.</p>
              <button
                onClick={handleCreateDashboard}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                İlk Dashboard'ı Oluştur
              </button>
            </div>
          )
        )}

        {!isIvmePlatform && !isRomiotPlatform && (
          // Reports Section
          <div className="mt-16">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center">
                <h3 className="text-xl font-semibold text-gray-900 mb-2 sm:mb-0">Raporlarım</h3>
                {reports.length > 3 && (
                  <button
                    onClick={() => router.push(`/${platformCode}/reports`)}
                    className="text-sm text-gray-500 hover:text-blue-600 font-medium transition-colors sm:ml-4 flex items-center gap-1 mt-1"
                  >
                    <Eye className="h-4 w-4" />
                    {reports.length - 3} Rapor Daha
                  </button>
                )}
              </div>
              {hasDerinizAdmin && (
                <button
                  onClick={handleCreateReport}
                  className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  Yeni Rapor
                </button>
              )}
            </div>

            {/* Reports Grid */}
            {reports.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {reports.slice(0, 3).map((report) => (
                  <div
                    key={report.id}
                    onClick={() => handleReportClick(report)}
                    className="bg-white rounded-lg shadow-xl shadow-slate-200 p-6 hover:shadow-xl transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 rounded-lg bg-indigo-500 text-white">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${report.is_public
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                          }`}>
                          {report.is_public ? (
                            <>
                              <Eye className="h-3 w-3 mr-1" />
                              Herkese Açık
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-3 w-3 mr-1" />
                              Özel
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors flex items-center gap-2">
                      {report.name}
                      {report.isDirectLink && (
                        <ExternalLink className="h-3 w-3 text-gray-400" />
                      )}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        <span>{report.queries?.length || 0} Sorgu</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(report.created_at).toLocaleDateString('tr-TR')}</span>
                      </div>
                      {report.owner_name && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="max-w-[300px]">{report.owner_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz rapor bulunmuyor</h3>
                <p className="text-gray-500 mb-6">İlk raporunuzu oluşturmak için aşağıdaki butona tıklayın.</p>
                {hasDerinizAdmin && (
                  <button
                    onClick={handleCreateReport}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                    İlk Raporu Oluştur
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RomIoT Stats Section */}
      {platformCode === 'romiot' && (
        <RomiotStats />
      )}

      {/* Full-width Duyurular Section */}
      <div className="w-full py-12 mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h3 className="text-2xl font-bold mb-2" style={{ "color": "rgb(69,81,89)" }}>Duyurular</h3>
            <div className="w-[100px] h-[5px] bg-red-600"></div>
          </div>

          {announcements.length > 0 ? (
            <>
              {/* Carousel Container */}
              <div className="relative flex justify-center">
                {/* Navigation Arrows - Only show if more than 3 items */}
                {announcements.length > 3 && (
                  <>
                    <button
                      onClick={handlePrevAnnouncement}
                      disabled={isFirstPage}
                      className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors ${isFirstPage
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={handleNextAnnouncement}
                      disabled={isLastPage}
                      className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-colors ${isLastPage
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                )}

                {/* Carousel Cards */}
                <div className="flex gap-6 justify-center items-start max-w-4xl mx-auto">
                  {announcements.slice(currentAnnouncementIndex, currentAnnouncementIndex + 3).map((announcement) => {
                    const isAnnouncementHovered = hoveredAnnouncement === announcement.id;
                    return (
                      <div
                        key={announcement.id}
                        className="flex-shrink-0 w-80 cursor-pointer transition-transform hover:scale-105"
                        onClick={() => handleAnnouncementClick(announcement)}
                        onMouseEnter={() => setHoveredAnnouncement(announcement.id)}
                        onMouseLeave={() => setHoveredAnnouncement(null)}
                      >
                        <div className={`relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl transition-all ${isAnnouncementHovered ? 'ring-2 ring-[#FF5620]' : ''
                          }`}>
                          {/* Image Area - Top section with proper aspect ratio */}
                          {announcement.content_image && (
                            <div className="absolute top-0 left-0 right-0 bottom-0">
                              <img
                                src={announcement.content_image}
                                alt={announcement.title}
                                className="w-full h-full object-fill"
                              />
                              {/* Gradient overlay for text readability */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                            </div>
                          )}

                          {/* Glow Effect */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-300 to-transparent rounded-full opacity-20 blur-xl"></div>

                          {/* Main Title - Lower position for better image visibility */}
                          <div className="absolute bottom-16 left-4 right-4 z-10">
                            <div className="text-white font-bold text-xl leading-tight text-left">
                              {announcement.title.split('\n').map((line, i) => (
                                <div key={i}>{line}</div>
                              ))}
                            </div>
                          </div>

                          {/* Month Badge - Bottom Left, Small */}
                          {announcement.month_title && (
                            <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-md shadow-lg z-10">
                              <span className="text-xs font-semibold uppercase">{announcement.month_title}</span>
                            </div>
                          )}

                          {/* Click Indicator */}
                          <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs z-10">
                            Detaylar →
                          </div>
                        </div>

                        {/* Card Description */}
                        <div className="mt-3">
                          <div className="h-1 w-12 bg-red-600 mb-2"></div>
                          <h4 className="text-gray-900 font-semibold mb-1 line-clamp-2">{announcement.content_summary || announcement.title}</h4>
                          <p className="text-gray-600 text-sm">
                            {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tümünü Gör Button */}
              {announcements.length > 3 && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={handleViewAllAnnouncements}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                  >
                    <Eye className="h-5 w-5" />
                    Tüm Duyuruları Gör ({announcements.length})
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                Şu anda aktif duyuru bulunmamaktadır
              </h4>
              <p className="text-gray-500 text-sm">
                Yeni duyurular eklendiğinde burada görünecektir
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Announcement Detail Modal */}
      {showAnnouncementModal && selectedAnnouncement && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowAnnouncementModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto animate-fade-in [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-gray-400"
            onClick={(e) => e.stopPropagation()}
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent' }}
          >
            {/* Modal Header */}
            <div className="relative">
              {selectedAnnouncement.content_image && (
                <div className="w-full h-[500px] bg-gradient-to-br from-blue-900 to-blue-800 relative overflow-hidden">
                  <img
                    src={selectedAnnouncement.content_image}
                    alt={selectedAnnouncement.title}
                    className="w-full h-full object-fill"
                  />
                  {selectedAnnouncement.month_title && (
                    <div className="absolute bottom-4 left-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-10">
                      <span className="text-sm font-bold uppercase">{selectedAnnouncement.month_title}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="absolute top-4 right-4 p-2 bg-white/90 hover:bg-white rounded-full shadow-lg transition-colors z-10 cursor-pointer"
              >
                <X className="h-5 w-5 text-gray-700" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedAnnouncement.title}
              </h2>

              {/* Date */}
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Calendar className="h-4 w-4" />
                <span>{new Date(selectedAnnouncement.creation_date).toLocaleDateString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</span>
              </div>

              {/* Summary */}
              {selectedAnnouncement.content_summary && (
                <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-600 rounded-r-lg">
                  <p className="text-gray-700 font-medium">{selectedAnnouncement.content_summary}</p>
                </div>
              )}

              {/* Divider */}
              {selectedAnnouncement.content_detail && (
                <div className="border-t border-gray-200 my-4"></div>
              )}

              {/* Detail Content - Main content of the announcement */}
              {selectedAnnouncement.content_detail && (
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Detaylı İçerik</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div
                      className="text-gray-700 leading-relaxed [&>p]:mb-4 [&>p:last-child]:mb-0 [&>p:empty]:min-h-[1em]"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(selectedAnnouncement.content_detail)
                      }}
                    />
                  </div>
                </div>
              )}

              {/* No Detail Message */}
              {!selectedAnnouncement.content_detail && !selectedAnnouncement.content_summary && (
                <div className="text-center py-8 text-gray-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                  <p>Bu duyuru için detaylı açıklama bulunmamaktadır.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={() => setShowAnnouncementModal(false)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Access Denied Modal */}
      {showAccessDeniedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 to-red-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <Lock className="h-8 w-8 text-white" />
                <h3 className="text-xl font-bold text-white">Erişim Yetkiniz Bulunamadı</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-gray-700 text-lg mb-2">
                Bu özelliğe erişim yetkiniz bulunmamaktadır.
              </p>
              <p className="text-gray-600">
                Erişim izni almak için lütfen sistem yöneticisi ile iletişime geçiniz.
              </p>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowAccessDeniedModal(false)}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feature Navigation Loading Modal - Romiot Platform */}
      {showFeatureNavigationModal && navigatingFeature && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-fade-in">
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-blue-800 to-orange-500 px-8 py-6">
              <div className="flex items-center justify-center gap-4">
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                <h3 className="text-2xl font-bold text-white">Yönlendiriliyor...</h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-8 flex flex-col items-center">
              {navigatingFeature.imageUrl ? (
                <div className="w-32 h-32 mb-6 flex items-center justify-center">
                  <img
                    src={navigatingFeature.imageUrl}
                    alt={navigatingFeature.name}
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-32 h-32 mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
                  <Database className="w-16 h-16 text-blue-600" />
                </div>
              )}

              <p className="text-gray-700 text-xl text-center mb-2">
                <span className="font-bold text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {navigatingFeature.name}
                </span>
              </p>
              <p className="text-gray-600 text-center">
                servisine yönlendiriliyorsunuz
              </p>

              {/* Progress bar */}
              <div className="w-full mt-6 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full animate-progress"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Announcements Modal */}
      {showAllAnnouncementsModal && announcements.length > 0 && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowAllAnnouncementsModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] animate-fade-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-6 w-6 text-white" />
                <h3 className="text-xl font-bold text-white">Tüm Duyurular</h3>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm text-white font-medium">
                  {announcements.length}
                </span>
              </div>
              <button
                onClick={closeAllAnnouncementsModal}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* Modal Body - Grid */}
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[65vh] overflow-y-auto px-2 md:px-4 lg:px-6 py-4">
                {announcements.map((announcement) => {
                  const isAnnouncementHovered = hoveredAnnouncement === announcement.id;
                  return (
                    <div
                      key={announcement.id}
                      className="cursor-pointer transition-transform hover:scale-105"
                      onClick={() => handleAnnouncementClick(announcement)}
                      onMouseEnter={() => setHoveredAnnouncement(announcement.id)}
                      onMouseLeave={() => setHoveredAnnouncement(null)}
                    >
                      <div className={`relative bg-gradient-to-br from-blue-900 to-blue-800 rounded-xl overflow-hidden h-64 shadow-2xl transition-all ${isAnnouncementHovered ? 'ring-2 ring-[#FF5620]' : ''
                        }`}>
                        {announcement.content_image && (
                          <div className="absolute top-0 left-0 right-0 bottom-0">
                            <img
                              src={announcement.content_image}
                              alt={announcement.title}
                              className="w-full h-full object-fill"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                          </div>
                        )}

                        <div className="absolute bottom-16 left-4 right-4 z-10">
                          <div className="text-white font-bold text-xl leading-tight text-left">
                            {announcement.title.split('\n').map((line, i) => (
                              <div key={i}>{line}</div>
                            ))}
                          </div>
                        </div>

                        {announcement.month_title && (
                          <div className="absolute bottom-3 left-3 bg-red-600 text-white px-3 py-1 rounded-md shadow-lg z-10">
                            <span className="text-xs font-semibold uppercase">{announcement.month_title}</span>
                          </div>
                        )}

                        <div className="absolute bottom-3 right-3 bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs z-10">
                          Detaylar →
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="h-1 w-12 bg-red-600 mb-2"></div>
                        <h4 className="text-gray-900 font-semibold mb-1 line-clamp-2">{announcement.content_summary || announcement.title}</h4>
                        <p className="text-gray-600 text-sm">
                          {new Date(announcement.creation_date).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-end">
              <button
                onClick={closeAllAnnouncementsModal}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MIRAS Assistant Chatbot */}
      <MirasAssistant />

      {/* Feedback Button */}
      <Feedback />
    </div>
  );
}

