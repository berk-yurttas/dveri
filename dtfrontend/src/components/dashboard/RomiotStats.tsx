import { useState, useEffect } from 'react';
import {
    Activity,
    AlertTriangle,
    Clock,
    MessageSquare,
    Wifi,
    Calendar as CalendarIcon
} from 'lucide-react';
import { romiotService } from '@/services/romiot';
import DatePicker, { registerLocale } from "react-datepicker";
import { tr } from 'date-fns/locale';
import "react-datepicker/dist/react-datepicker.css";
import { usePlatform } from "@/contexts/platform-context";

// Register Turkish locale
registerLocale('tr', tr);

interface StatsData {
    operationCount: number;
    nonConformanceCount: number;
    workingHours: string;
    requestCount: number;
    sensorCount: number;
}

export const RomiotStats = () => {
    const { platform } = usePlatform();

    // Determine last month's range for default
    const getDefaultDateRange = () => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 1);
        return {
            start,
            end
        };
    };

    const [dateRange, setDateRange] = useState(getDefaultDateRange());

    const [stats, setStats] = useState<StatsData>({
        operationCount: 0,
        nonConformanceCount: 0,
        workingHours: "0 sa 0 dk",
        requestCount: 0,
        sensorCount: 0
    });

    const [loading, setLoading] = useState(false);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // Helper to format Date to YYYY-MM-DD (local time)
            const formatDate = (date: Date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const data = await romiotService.getDashboardKpi(
                formatDate(dateRange.start),
                formatDate(dateRange.end)
            );
            setStats(data);
        } catch (error) {
            console.error("Failed to fetch stats:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []); // Initial load only

    interface Card {
        id: number;
        title: string;
        value: string | number;
        suffix?: string;
        icon: typeof Activity;
        color: string;
        bgColor: string;
        borderColor: string;
    }

    const cards: Card[] = [
        {
            id: 1,
            title: "Operasyon Sayısı",
            value: stats.operationCount,
            icon: Activity,
            color: "text-blue-600",
            bgColor: "bg-blue-100",
            borderColor: "border-blue-200"
        },
        {
            id: 2,
            title: "Yakalanan Uygunsuzluk",
            value: stats.nonConformanceCount,
            icon: AlertTriangle,
            color: "text-red-600",
            bgColor: "bg-red-100",
            borderColor: "border-red-200"
        },
        {
            id: 3,
            title: "Çalışma Saati",
            value: stats.workingHours,
            icon: Clock,
            color: "text-green-600",
            bgColor: "bg-green-100",
            borderColor: "border-green-200"
        },
        {
            id: 4,
            title: "İstek Sayısı",
            value: stats.requestCount,
            icon: MessageSquare,
            color: "text-purple-600",
            bgColor: "bg-purple-100",
            borderColor: "border-purple-200"
        },
        {
            id: 5,
            title: "Sensör Sayısı",
            value: stats.sensorCount,
            icon: Wifi,
            color: "text-orange-600",
            bgColor: "bg-orange-100",
            borderColor: "border-orange-200"
        }
    ];

    return (
        <div className="w-full py-8 mb-8 animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Header & Controls */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                    <div>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800">
                            Operasyon Özeti
                        </h3>
                        <div className="w-[100px] h-[5px] bg-red-600"></div>
                    </div>

                    {/* Date Picker */}
                    <div className="flex items-center gap-4 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-600">Tarih Aralığı:</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <DatePicker
                                selected={dateRange.start}
                                onChange={(date: Date | null) => date && setDateRange(prev => ({ ...prev, start: date }))}
                                dateFormat="dd/MM/yyyy"
                                locale="tr"
                                maxDate={new Date()}
                                selectsStart
                                startDate={dateRange.start}
                                endDate={dateRange.end}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all cursor-pointer w-32 text-center"
                            />
                            <span className="text-gray-400">-</span>
                            <DatePicker
                                selected={dateRange.end}
                                onChange={(date: Date | null) => date && setDateRange(prev => ({ ...prev, end: date }))}
                                dateFormat="dd/MM/yyyy"
                                locale="tr"
                                minDate={dateRange.start}
                                maxDate={new Date()}
                                selectsEnd
                                startDate={dateRange.start}
                                endDate={dateRange.end}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all cursor-pointer w-32 text-center"
                            />
                        </div>
                        <button
                            onClick={fetchStats}
                            disabled={loading}
                            className="ml-2 px-4 py-1.5 text-white text-sm font-medium rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: platform?.theme_config?.headerColor || "#1e3a8a" }}
                        >
                            {loading ? 'Yükleniyor...' : 'Göster'}
                        </button>
                    </div>
                </div>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    {cards.map((card) => (
                        <div
                            key={card.id}
                            className={`group bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:scale-105 transition-all duration-300 border border-transparent hover:border-orange-500 ${loading ? 'opacity-70' : ''}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-xl ${card.bgColor} ${card.color} group-hover:scale-110 transition-transform duration-300`}>
                                    <card.icon className="w-6 h-6" />
                                </div>
                            </div>

                            <div>
                                <p className="text-gray-500 text-sm font-medium mb-1 line-clamp-1" title={card.title}>
                                    {card.title}
                                </p>
                                <h4 className="text-3xl font-bold text-gray-900 tracking-tight">
                                    {loading ? (
                                        <span className="animate-pulse bg-gray-200 text-transparent rounded">0000</span>
                                    ) : (
                                        <>
                                            {typeof card.value === 'number' ? card.value.toLocaleString('tr-TR') : card.value}
                                            {card.suffix && <span className="text-lg font-medium text-gray-400 ml-1">{card.suffix}</span>}
                                        </>
                                    )}
                                </h4>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};
