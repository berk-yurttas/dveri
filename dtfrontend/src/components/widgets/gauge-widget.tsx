"use client"

import { useState } from "react"
import { InfrastructureDropdown } from "./infrastructure-dropdown"

// Test altyapısı durumu için örnek veri
const infrastructureStatus = {
  "infra-1": {
    name: "Ana Test Sunucusu",
    performance: 87,
    status: "Aktif",
    color: "text-green-600",
    bgColor: "from-green-400 to-green-600"
  },
  "infra-2": {
    name: "Yedek Test Sunucusu", 
    performance: 92,
    status: "Aktif",
    color: "text-green-600",
    bgColor: "from-green-400 to-green-600"
  },
  "infra-3": {
    name: "Geliştirme Sunucusu",
    performance: 73,
    status: "Uyarı",
    color: "text-yellow-600",
    bgColor: "from-yellow-400 to-yellow-600"
  },
  "infra-4": {
    name: "Test Lab Sunucusu",
    performance: 45,
    status: "Kritik",
    color: "text-red-600", 
    bgColor: "from-red-400 to-red-600"
  }
}

// Convert to InfrastructureOption array format
const infrastructureOptions = Object.entries(infrastructureStatus).map(([key, value], index) => ({
  id: index + 1,
  name: value.name,
  value: index + 1
}))

interface GaugeWidgetProps {
  dateFrom?: string
  dateTo?: string
}

export function GaugeWidget({ dateFrom, dateTo }: GaugeWidgetProps) {
  const [selectedInfra, setSelectedInfra] = useState<number>(1)
  
  const currentInfra = infrastructureStatus[`infra-${selectedInfra}` as keyof typeof infrastructureStatus]
  const percentage = currentInfra.performance
  
  // Get color based on percentage
  const getColorByPercentage = (percentage: number) => {
    if (percentage >= 80) {
      return {
        stroke: "stroke-green-500",
        text: "text-green-600",
        bg: "bg-green-50"
      }
    } else if (percentage >= 60) {
      return {
        stroke: "stroke-yellow-500", 
        text: "text-yellow-600",
        bg: "bg-yellow-50"
      }
    } else {
      return {
        stroke: "stroke-red-500",
        text: "text-red-600", 
        bg: "bg-red-50"
      }
    }
  }

  const colors = getColorByPercentage(percentage)
  
  // Calculate stroke-dasharray for the circular progress
  const radius = 60 // Increased from 45 to 60
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="w-full h-full p-3 bg-white rounded-lg border border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
          <h3 className="text-lg font-semibold text-gray-800">Sistem Durumu</h3>
        </div>
        <InfrastructureDropdown
          options={infrastructureOptions}
          selectedValue={selectedInfra}
          onSelect={setSelectedInfra}
          placeholder="Sunucu ara..."
        />
      </div>

      {/* Gauge Container */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* SVG Gauge */}
        <div className="relative w-32 h-32 mb-2">
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 140 140">
            {/* Background Circle */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              stroke="currentColor"
              strokeWidth="10"
              fill="none"
              className="text-gray-200"
            />
            {/* Progress Circle */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className={`transition-all duration-500 ease-out ${colors.stroke}`}
            />
          </svg>
          
          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-2xl font-bold ${colors.text}`}>
              {percentage}%
            </div>
            <div className="text-xs text-gray-600">
              Performans
            </div>
          </div>
        </div>


      </div>
    </div>
  )
}

// Widget yapılandırması
GaugeWidget.config = {
  id: "gauge-widget",
  name: "Test Altyapısı Durumu",
  type: "monitor",
  color: "bg-blue-500",
  description: "Test altyapısı performans ve durum göstergesi",
  size: { width: 1, height: 1 }
}
