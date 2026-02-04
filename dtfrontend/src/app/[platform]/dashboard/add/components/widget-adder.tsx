"use client"

import { useState, useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { createPortal } from "react-dom"
import {
  Plus, BarChart3, PieChart, Activity, TrendingUp, Users, Settings, X,
  Calendar, Clock, Database, FileText, MessageSquare, Bell,
  ShoppingCart, DollarSign, Globe, Zap, Shield, Monitor,
  Map as MapIcon, Camera, Music, Heart, Star, Target, Gauge, Cpu,
  Wifi, Battery, HardDrive, Smartphone
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { widgetConfigs } from "@/components/widgets"
import { usePlatform } from "@/contexts/platform-context"

interface Widget {
  id: string
  name: string
  icon: any
  type: string
  color: string
  description: string
  size: { width: number; height: number }
}

// Icon mapping for widget types
const widgetIconMap: { [key: string]: any } = {
  "efficiency-widget": Gauge,
  "gauge-widget": Monitor,
  "product-test-widget": FileText,
  "test-analysis-widget": BarChart3,
  "test_duration-widget": Clock,
  "measurement-widget": TrendingUp,
  "aselsan_sivas-widget": Database
}

// Generate available widgets from component configurations
const availableWidgets: Widget[] = widgetConfigs.map(config => ({
  ...config,
  icon: widgetIconMap[config.id] || FileText
}))

// Platform-specific widget mapping
const platformWidgetMapping: { [key: string]: string[] } = {
  'deriniz': [
    'efficiency-widget',
    'product-test-widget',
    'test-analysis-widget',
    'test_duration-widget',
    'excel-export-widget',
    'measurement-widget',
    'serialno_comparison',
    'test_duration_analysis',
    'test_plan_version-widget',
    'test_software_version-widget',
    'test_equipment-widget',
    'equipment_test-widget',
    'equipment_last_user-widget',
    'hardware_last_user-widget'
  ],
  'ivme': [
    'capacity_analysis-widget',
    'machine_oee-widget',
    'kablaj_duruslar-widget',
    'mekanik_hatalar-widget',
    'employee_count-widget',
    'aselsan_sivas-widget'
  ],
}

// Subplatform-specific widget mapping (platform/subplatform combination)
const subplatformWidgetMapping: { [key: string]: string[] } = {
  'ivme/verimlilik': [
    'machine_oee-widget',
    'kablaj_duruslar-widget',
    'mekanik_hatalar-widget'
  ],
  'ivme/kapasite': [
    'capacity_analysis-widget',
    'pending_work-widget',
    'kablaj_uretim_rate-widget'
  ],
  'ivme/idari': [
    'employee_count-widget',
    'average_tenure-widget',
    'education_distribution-widget',
    'average_salary-widget',
    'absenteeism-widget'
  ]
}

interface WidgetAdderProps {
  onAddWidget?: (widget: Widget) => void
  onDragStart?: (widget: Widget) => void
  onDragEnd?: () => void
}

export function WidgetAdder({ onAddWidget, onDragStart, onDragEnd }: WidgetAdderProps) {
  const params = useParams()
  const searchParams = useSearchParams()
  const subplatform = searchParams.get('subplatform')
  const [isOpen, setIsOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 })
  const [isDraggingModal, setIsDraggingModal] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const { platform } = usePlatform()

  // Filter widgets based on platform and subplatform
  let allowedWidgetIds: string[] = []

  if (subplatform && platform?.code) {
    // Check if there's a specific subplatform mapping
    const subplatformKey = `${platform.code}/${subplatform}`
    allowedWidgetIds = subplatformWidgetMapping[subplatformKey] || platformWidgetMapping[platform.code] || []
  } else if (platform?.code) {
    // Fall back to platform-level mapping
    allowedWidgetIds = platformWidgetMapping[platform.code] || []
  }

  const filteredWidgets = availableWidgets.filter(widget => allowedWidgetIds.includes(widget.id))

  // Ensure component is mounted (for SSR compatibility)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Reset dragging state when modal is opened
  useEffect(() => {
    if (isOpen) {
      setIsDragging(false)
      setModalPosition({ x: 0, y: 0 }) // Reset modal position when opened
    }
  }, [isOpen])

  // Add global dragend listener to catch drag end events that might not fire on the element
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('dragend', handleGlobalDragEnd)
      document.addEventListener('drop', handleGlobalDragEnd)
      
      return () => {
        document.removeEventListener('dragend', handleGlobalDragEnd)
        document.removeEventListener('drop', handleGlobalDragEnd)
      }
    }
  }, [isDragging])

  // Add mouse event listeners for modal dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingModal) {
        setModalPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        })
      }
    }

    const handleMouseUp = () => {
      setIsDraggingModal(false)
    }

    if (isDraggingModal) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDraggingModal, dragOffset])

  const handleModalMouseDown = (e: React.MouseEvent) => {
    // Only start dragging if clicking on the header area
    if ((e.target as HTMLElement).closest('.modal-header')) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
      setIsDraggingModal(true)
    }
  }

  const handleWidgetClick = (widget: Widget) => {
    if (onAddWidget) {
      onAddWidget(widget)
    }
    setIsOpen(false)
    setIsDragging(false) // Reset dragging state when widget is added via click
  }

  return (
    <>
      {/* Plus Button - Fixed to viewport using Portal */}
      {isMounted && createPortal(
        <Button
          onClick={() => {
            setIsDragging(false) // Always reset dragging state
            setIsOpen(!isOpen)   // Always toggle modal
          }}
          className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg text-white cursor-pointer transition-all duration-200 hover:scale-105"
          style={{ 
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999
          }}
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>,
        document.body
      )}

      {/* Centered Modal Widget List */}
      {isOpen && !isDragging && isMounted && createPortal(
        <>
          {/* Modal Backdrop */}
          <div
            className="fixed inset-0 bg-opacity-50 z-[9998]"
            style={{ backdropFilter: 'blur(2px)' }}
            onClick={() => setIsOpen(false)}
          />
          
          {/* Centered Modal Card */}
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
            <Card
              className="w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl bg-white pointer-events-auto border-0"
              style={{
                transform: `translate(${modalPosition.x}px, ${modalPosition.y}px)`,
                cursor: isDraggingModal ? 'grabbing' : 'default'
              }}
              onMouseDown={handleModalMouseDown}
            >
              {/* Header */}
              <div className="modal-header p-6 border-b border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-semibold text-gray-900">Widget Ekle</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsOpen(false)}
                    className="h-8 w-8 hover:bg-gray-100"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-gray-600">Ekranınıza eklemek istediğiniz widget'ı sürükleyip bırakın</p>
              </div>
              
              {/* 3-Column Grid of Widget Cards */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50">
                {filteredWidgets.length > 0 ? (
                  <div className="grid grid-cols-3 gap-4">
                    {filteredWidgets.map((widget) => (
                    <Card
                      key={widget.id}
                      draggable
                      onClick={() => handleWidgetClick(widget)}
                      onDragStart={(e: any) => {
                        e.dataTransfer.setData("widget", JSON.stringify(widget))
                        e.dataTransfer.effectAllowed = "copy"

                        // Create a custom drag image
                        const dragImage = document.createElement('div')
                        dragImage.className = 'p-3 bg-white border-2 border-blue-400 rounded-lg shadow-lg flex items-center gap-2'
                        dragImage.innerHTML = `
                          <div class="p-2 rounded ${widget.color} text-white">
                            <div class="w-4 h-4"></div>
                          </div>
                          <span class="font-medium text-sm">${widget.name}</span>
                        `
                        dragImage.style.position = 'absolute'
                        dragImage.style.top = '-1000px'
                        document.body.appendChild(dragImage)
                        e.dataTransfer.setDragImage(dragImage, 50, 25)

                        setTimeout(() => {
                          document.body.removeChild(dragImage)
                          setIsDragging(true)
                        }, 0)

                        if (onDragStart) {
                          onDragStart(widget)
                        }
                      }}
                      onDragEnd={() => {
                        // Reset dragging state immediately when drag ends
                        setIsDragging(false)
                        if (onDragEnd) {
                          onDragEnd()
                        }
                      }}
                      className="relative p-4 bg-white hover:shadow-lg hover:border-blue-300 hover:bg-blue-50 cursor-move transition-all duration-200 group border border-gray-200"
                    >
                      {/* Widget Icon */}
                      <div className="flex justify-center mb-3">
                        <div className={`p-4 rounded-xl ${widget.color} text-white group-hover:scale-110 transition-transform duration-200`}>
                          <widget.icon className="h-8 w-8" />
                        </div>
                      </div>
                      
                      {/* Widget Metadata - Positioned absolutely */}
                      <div className="absolute top-2 right-2">
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          {widget.size.width}×{widget.size.height}
                        </span>
                      </div>

                      {/* Widget Info */}
                      <div className="text-center space-y-2">
                        <h4 className="font-semibold text-sm text-gray-900">{widget.name}</h4>
                        <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                          {widget.description}
                        </p>
                      </div>
                    </Card>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <FileText className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz widget bulunmuyor</h3>
                    <p className="text-gray-500">
                      Bu platform için henüz eklenebilir widget bulunmamaktadır.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>,
        document.body
      )}

    </>
  )
}