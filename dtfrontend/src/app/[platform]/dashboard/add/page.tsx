"use client"

import { useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { WidgetAdder } from "./components/widget-adder"
import { CapacityAnalysisWidget, EfficiencyWidget, EmployeeCountWidget, ExcelExportWidget, GaugeWidget, KablajDuruslarWidget, MachineOeeWidget, MeasurementWidget, MekanikHatalarWidget, ProductTestWidget, SerialNoComparisonWidget, TestAnalysisWidget, TestDurationAnalysisWidget, TestDurationWidget, AverageTenureWidget, EducationDistributionWidget, AverageSalaryWidget, AbsenteeismWidget, PendingWorkWidget, KablajUretimRateWidget, AselsanSivasWidget, TestPlanVersionWidget, TestSoftwareVersionWidget, TestEquipmentWidget, EquipmentTestWidget, EquipmentLastUserWidget, HardwareLastUserWidget } from "@/components/widgets"
import { dashboardService } from "@/services/dashboard"
import { CreateDashboardRequest, PlacedWidget as PlacedWidgetType } from "@/types/dashboard"
import { useDashboards } from "@/contexts/dashboard-context"
import { useFilters } from "@/contexts/filter-context"
import { AuthTest } from "@/components/auth/AuthTest"
import { DateInput } from "@/components/ui/date-input"
import { 
  BarChart3, PieChart, Activity, TrendingUp, Users, Settings,
  Calendar, Clock, Database, FileText, MessageSquare, Bell,
  ShoppingCart, DollarSign, Globe, Zap, Shield, Monitor,
  Map as MapIcon, Camera, Music, Heart, Star, Target, Gauge, Cpu,
  Wifi, Battery, HardDrive, Smartphone, Plus, X
} from "lucide-react"

interface PlacedWidget {
  id: string
  cellIndex: number
  name: string
  iconName: string
  color: string
  size: { width: number; height: number }
  type: string
}

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
  Plus
}

// Widget renderer function
const renderWidgetContent = (widget: PlacedWidget, dateFrom: string, dateTo: string) => {
  const baseId = widget.id.split('-')[0]
  
  // Create date filter props for widgets that need them
  const dateFilterProps = {
    dateFrom: `${dateFrom} 00:00:00`,
    dateTo: `${dateTo} 23:59:59`
  }
  
  switch (baseId) {
    case 'efficiency':
      return <EfficiencyWidget widgetId={widget.id} {...dateFilterProps} />
    case 'gauge':
      return <GaugeWidget {...dateFilterProps} />
    case 'product':
      return <ProductTestWidget widgetId={widget.id} {...dateFilterProps} />
    case 'test':
      return <TestAnalysisWidget widgetId={widget.id} {...dateFilterProps} />
    case 'test_duration':
      return <TestDurationWidget widgetId={widget.id} {...dateFilterProps} />
    case 'excel':
      return <ExcelExportWidget widgetId={widget.id} {...dateFilterProps} />
    case 'measurement':
      return <MeasurementWidget widgetId={widget.id} {...dateFilterProps} />
    case 'serialno_comparison':
      return <SerialNoComparisonWidget widgetId={widget.id} {...dateFilterProps} />
    case 'test_duration_analysis':
      return <TestDurationAnalysisWidget widgetId={widget.id} {...dateFilterProps} />
    case 'capacity_analysis':
      return <CapacityAnalysisWidget widgetId={widget.id} {...dateFilterProps} />
    case 'machine_oee':
      return <MachineOeeWidget widgetId={widget.id} />
    case 'kablaj_duruslar':
      return <KablajDuruslarWidget widgetId={widget.id} />
    case 'mekanik_hatalar':
      return <MekanikHatalarWidget widgetId={widget.id} />
    case 'employee_count':
      return <EmployeeCountWidget widgetId={widget.id} />
    case 'average_tenure':
      return <AverageTenureWidget widgetId={widget.id} />
    case 'education_distribution':
      return <EducationDistributionWidget widgetId={widget.id} />
    case 'average_salary':
      return <AverageSalaryWidget widgetId={widget.id} />
    case 'absenteeism':
      return <AbsenteeismWidget widgetId={widget.id} />
    case 'pending_work':
      return <PendingWorkWidget widgetId={widget.id} />
    case 'kablaj_uretim_rate':
      return <KablajUretimRateWidget widgetId={widget.id} {...dateFilterProps} />
    case 'aselsan_sivas':
      return <AselsanSivasWidget widgetId={widget.id} />
    case 'test_plan_version':
      return <TestPlanVersionWidget widgetId={widget.id} {...dateFilterProps} />
    case 'test_software_version':
      return <TestSoftwareVersionWidget widgetId={widget.id} {...dateFilterProps} />
    case 'test_equipment':
      return <TestEquipmentWidget widgetId={widget.id} {...dateFilterProps} />
    case 'equipment_test':
      return <EquipmentTestWidget widgetId={widget.id} {...dateFilterProps} />
    case 'equipment_last_user':
      return <EquipmentLastUserWidget widgetId={widget.id} {...dateFilterProps} />
    case 'hardware_last_user':
      return <HardwareLastUserWidget widgetId={widget.id} {...dateFilterProps} />
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className={`p-3 rounded-lg ${widget.color} text-white mb-2`}>
            {(() => {
              const IconComponent = iconMap[widget.iconName]
              return IconComponent ? <IconComponent className="h-6 w-6" /> : null
            })()}
          </div>
          <h4 className="text-sm font-medium text-gray-700">{widget.name}</h4>
        </div>
      )
  }
}

export default function AddDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const subplatform = searchParams.get('subplatform')
  const platformCode = params.platform as string
  const { addDashboardToList } = useDashboards()
  const { dateFrom, dateTo, setDateFrom, setDateTo, getWidgetFilters, updateWidgetFilters } = useFilters()

  const [placedWidgets, setPlacedWidgets] = useState<PlacedWidget[]>([])
  const [draggedOverCell, setDraggedOverCell] = useState<number | null>(null)
  const [shiftedWidgets, setShiftedWidgets] = useState<Map<string, number>>(new Map())
  const [draggedWidget, setDraggedWidget] = useState<PlacedWidget | null>(null)
  const [draggedWidgetSize, setDraggedWidgetSize] = useState<{ width: number; height: number } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [dashboardName, setDashboardName] = useState("")
  const [isPublic, setIsPublic] = useState(false)
  const [currentDraggedWidget, setCurrentDraggedWidget] = useState<any>(null)
  const [originalDraggedWidget, setOriginalDraggedWidget] = useState<PlacedWidget | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSaveDashboard = () => {
    setError(null)
    setSuccessMessage(null)
    setIsModalOpen(true)
  }

  const convertPlacedWidgetsToDashboardFormat = (widgets: PlacedWidget[]): CreateDashboardRequest['widgets'] => {
    return widgets.map(widget => {
      const row = Math.floor(widget.cellIndex / 6)
      const col = widget.cellIndex % 6

      return {
        id: widget.id,
        title: widget.name,
        widget_type: widget.type,
        position_x: col,
        position_y: row,
        width: widget.size.width,
        height: widget.size.height,
        config: {
          name: widget.name,
          iconName: widget.iconName,
          color: widget.color,
          cellIndex: widget.cellIndex
        }
      }
    })
  }

  // Transfer filter state from temporary widget IDs to backend-assigned widget IDs
  const transferWidgetFilters = (temporaryWidgets: PlacedWidget[], backendWidgets: any[]) => {
    console.log('=== FILTER TRANSFER DEBUG ===')
    console.log('Temporary widgets:', temporaryWidgets.map(w => ({ id: w.id, type: w.type, cellIndex: w.cellIndex })))
    console.log('Backend widgets:', backendWidgets.map(w => ({ id: w.id, widget_type: w.widget_type, position_x: w.position_x, position_y: w.position_y })))

    // Now that we pass widget IDs correctly, the IDs should match and no transfer should be needed
    // But let's keep this function for debugging and edge cases

    temporaryWidgets.forEach(tempWidget => {
      // Find the corresponding backend widget by matching type and position
      const backendWidget = backendWidgets.find(bw =>
        bw.widget_type === tempWidget.type &&
        bw.position_x === (tempWidget.cellIndex % 6) &&
        bw.position_y === Math.floor(tempWidget.cellIndex / 6)
      )

      console.log(`Matching temp widget ${tempWidget.id} (type: ${tempWidget.type}, cell: ${tempWidget.cellIndex})`)
      console.log(`Found backend widget:`, backendWidget)

      if (backendWidget && tempWidget.id !== backendWidget.id) {
        // Get filters from temporary widget ID
        const tempFilters = getWidgetFilters(tempWidget.id)
        console.log(`Temp filters for ${tempWidget.id}:`, tempFilters)

        // Transfer to backend widget ID
        updateWidgetFilters(backendWidget.id, tempFilters)

        console.log(`✅ Transferred filters from ${tempWidget.id} to ${backendWidget.id}`)
      } else if (backendWidget && tempWidget.id === backendWidget.id) {
        console.log(`✅ Widget IDs match (${tempWidget.id}), no transfer needed`)
      } else {
        console.log(`❌ No backend widget found`)
      }
    })
    console.log('=== END FILTER TRANSFER DEBUG ===')
  }

  const handleModalSave = async () => {
    if (!dashboardName.trim()) {
      setError("Dashboard adı gereklidir")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const dashboardData: CreateDashboardRequest = {
        title: dashboardName.trim(),
        tags: subplatform ? [subplatform] : undefined,
        username: "current_user", // TODO: Get from auth context
        owner_id: 1, // TODO: Get from auth context
        is_public: isPublic,
        layout_config: {
          grid_size: { width: 6, height: 6 }
        },
        widgets: convertPlacedWidgetsToDashboardFormat(placedWidgets)
      }

      const result = await dashboardService.createDashboard(dashboardData)

      console.log("Dashboard created successfully:", result)

      // Transfer filter state from temporary widget IDs to backend-assigned widget IDs
      if (result.widgets && result.widgets.length > 0) {
        transferWidgetFilters(placedWidgets, result.widgets)
      }

      setSuccessMessage("Dashboard başarıyla oluşturuldu!")
      setIsModalOpen(false)
      setDashboardName("")
      setIsPublic(false)

      // Add the new dashboard to the context list
      addDashboardToList(result)

      // Redirect to the new dashboard view page
      if (subplatform) {
        router.push(`/${platformCode}/dashboard/${result.id}?subplatform=${subplatform}`)
      } else {
        router.push(`/${platformCode}/dashboard/${result.id}`);
      }
      
    } catch (err: any) {
      console.error("Error creating dashboard:", err)
      setError(err.message || "Dashboard oluşturulurken bir hata oluştu")
    } finally {
      setIsLoading(false)
    }
  }

  const handleModalCancel = () => {
    if (!isLoading) {
      setIsModalOpen(false)
      setDashboardName("")
      setIsPublic(false)
      setError(null)
    }
  }

  const findShiftPositionBasedOnTargetIndex = (
    targetIndex: number,
    newWidgetSize: { width: number; height: number },
    widgetToShift: PlacedWidget,
    excludeIds?: string[]
  ): number => {
    // Find the first available position to the right
    // For existing widget drags, start after the target area
    // For new widget additions, start after the widget's current position
    const originalIndex = widgetToShift.cellIndex
    
    console.log(`Shift calculation: originalIndex=${originalIndex}, targetIndex=${targetIndex}, newWidgetSize=${newWidgetSize.width}x${newWidgetSize.height}, searching for first available position for ${widgetToShift.size.width}x${widgetToShift.size.height} widget`)
    
    // Create exclude list including the new widget area and other shifting widgets
    const allExcludeIds = excludeIds ? (Array.isArray(excludeIds) ? [...excludeIds] : [excludeIds]) : []
    
    // Determine the starting search position
    let startSearchIndex: number
    
    if (originalIndex > targetIndex) {
      // This is likely an existing widget being moved to an earlier position
      // Start searching right after the target area
      const targetRow = Math.floor(targetIndex / 6)
      const targetCol = targetIndex % 6
      const targetEndCol = targetCol + newWidgetSize.width - 1
      const targetEndRow = targetRow + newWidgetSize.height - 1
      
      // Start from the cell right after the target area
      if (targetEndCol < 5) {
        // Can continue on the same row
        startSearchIndex = targetEndRow * 6 + targetEndCol + 1
      } else {
        // Move to the next row
        startSearchIndex = (targetEndRow + 1) * 6
      }
      
      console.log(`Existing widget drag detected. Starting search from index ${startSearchIndex} (after target area)`)
    } else {
      // This is a new widget addition or forward move
      // Start searching from the position right after the original widget
      startSearchIndex = originalIndex + 1
      console.log(`New widget or forward move. Starting search from index ${startSearchIndex} (after original position)`)
    }
    
    // Start searching from the calculated position
    for (let i = startSearchIndex; i < 36; i++) {
      const row = Math.floor(i / 6)
      const col = i % 6
      
      // Check if widget fits within grid bounds
      if (col + widgetToShift.size.width > 6 || row + widgetToShift.size.height > 6) {
        console.log(`Position ${i} (row ${row}, col ${col}) doesn't fit widget ${widgetToShift.size.width}x${widgetToShift.size.height} - bounds check failed`)
        continue
      }
      
      // Check if we can place the widget at this position
      if (canPlaceWidgetAtWithExclusions(i, widgetToShift.size, { index: targetIndex, size: newWidgetSize }, allExcludeIds)) {
        console.log(`Found first available position at index ${i} (row ${row}, col ${col}) for widget ${widgetToShift.id}`)
        return i
      } else {
        console.log(`Position ${i} (row ${row}, col ${col}) is occupied or conflicts for widget ${widgetToShift.id}`)
      }
    }
    
    console.log(`No available position found for widget ${widgetToShift.id}`)
    return -1
  }

  const canPlaceWidgetAtWithExclusions = (
    cellIndex: number, 
    widgetSize: { width: number; height: number }, 
    excludeArea?: { index: number, size: { width: number; height: number } }, 
    excludeIds?: string[]
  ): boolean => {
    const row = Math.floor(cellIndex / 6)
    const col = cellIndex % 6
    
    // Check if widget fits within grid bounds
    if (col + widgetSize.width > 6 || row + widgetSize.height > 6) {
      return false
    }
    
    // Check if this position would overlap with the exclude area (new widget being placed)
    if (excludeArea) {
      const excludeRow = Math.floor(excludeArea.index / 6)
      const excludeCol = excludeArea.index % 6
      
      // Check rectangle overlap with exclude area
      const widgetEndRow = row + widgetSize.height - 1
      const widgetEndCol = col + widgetSize.width - 1
      const excludeEndRow = excludeRow + excludeArea.size.height - 1
      const excludeEndCol = excludeCol + excludeArea.size.width - 1
      
      const overlapsWithExcludeArea = !(widgetEndRow < excludeRow || row > excludeEndRow ||
                                       widgetEndCol < excludeCol || col > excludeEndCol)
      
      if (overlapsWithExcludeArea) {
        return false
      }
    }
    
    // Use the existing canPlaceWidgetAt function for other validations
    return canPlaceWidgetAt(cellIndex, widgetSize, excludeIds)
  }

  const canPlaceWidgetAt = (cellIndex: number, widgetSize: { width: number; height: number }, excludeIds?: string | string[]): boolean => {
    const row = Math.floor(cellIndex / 6)
    const col = cellIndex % 6
    
    // Check if widget fits within grid bounds
    if (col + widgetSize.width > 6 || row + widgetSize.height > 6) {
      return false
    }
    
    // Normalize excludeIds to array
    const excludeIdArray = excludeIds ? (Array.isArray(excludeIds) ? excludeIds : [excludeIds]) : []
    
    // Check all cells the widget would occupy
    for (let r = 0; r < widgetSize.height; r++) {
      for (let c = 0; c < widgetSize.width; c++) {
        const checkIndex = (row + r) * 6 + (col + c)
        
        // Check if any existing widget occupies this cell
        const conflictingWidget = placedWidgets.find(w => {
          if (excludeIdArray.includes(w.id)) return false
          
          const widgetRow = Math.floor(w.cellIndex / 6)
          const widgetCol = w.cellIndex % 6
          
          // Check if this cell falls within the existing widget's span
          const checkRow = Math.floor(checkIndex / 6)
          const checkCol = checkIndex % 6
          
          return checkRow >= widgetRow && checkRow < widgetRow + w.size.height &&
                 checkCol >= widgetCol && checkCol < widgetCol + w.size.width
        })
        
        if (conflictingWidget) {
          return false
        }
      }
    }
    return true
  }

  const calculateWidgetShifts = (dragOverIndex: number, dragWidgetSize: { width: number; height: number } = { width: 1, height: 1 }, excludeWidgetId?: string) => {
    console.log(`=== CALCULATE WIDGET SHIFTS === dragOverIndex: ${dragOverIndex}, dragWidgetSize: ${dragWidgetSize.width}x${dragWidgetSize.height}, excludeWidgetId: ${excludeWidgetId}`)
    
    const shifts = new Map<string, number>()
    
    // Helper function to check if there are empty cells between two positions
    const hasEmptyCellsBetween = (startIndex: number, endIndex: number): boolean => {
      if (startIndex >= endIndex) return false
      
      for (let i = startIndex; i < endIndex; i++) {
        const row = Math.floor(i / 6)
        const col = i % 6
        
        // Check if any existing widget occupies this cell
        const isOccupied = placedWidgets.some(w => {
          // Exclude the dragged widget from occupancy calculations
          if (w.id === excludeWidgetId) return false
          
          const widgetRow = Math.floor(w.cellIndex / 6)
          const widgetCol = w.cellIndex % 6
          
          return row >= widgetRow && row < widgetRow + w.size.height &&
                 col >= widgetCol && col < widgetCol + w.size.width
        })
        
        if (!isOccupied) {
          console.log(`Found empty cell at index ${i} between ${startIndex} and ${endIndex} (excludeWidgetId: ${excludeWidgetId})`)
          return true
        }
      }
      return false
    }
    
    // Find widgets that need to be shifted based on new logic:
    // 1. Widgets that directly overlap with the new widget area
    // 2. Widgets that are at or after insertion point BUT have no empty cells before them
    const widgetsToShift = placedWidgets.filter(w => {
      // Exclude the dragged widget from shift calculations
      if (w.id === excludeWidgetId) {
        console.log(`Excluding dragged widget ${w.id} from shift calculations`)
        return false
      }
      
      const widgetRow = Math.floor(w.cellIndex / 6)
      const widgetCol = w.cellIndex % 6
      const dragRow = Math.floor(dragOverIndex / 6)
      const dragCol = dragOverIndex % 6
      
      // Check for direct overlap first
      const dragEndRow = dragRow + dragWidgetSize.height - 1
      const dragEndCol = dragCol + dragWidgetSize.width - 1
      const widgetEndRow = widgetRow + w.size.height - 1
      const widgetEndCol = widgetCol + w.size.width - 1
      
      const hasOverlap = !(dragEndRow < widgetRow || dragRow > widgetEndRow ||
                          dragEndCol < widgetCol || dragCol > widgetEndCol)
      
      if (hasOverlap) {
        console.log(`Widget ${w.id} at index ${w.cellIndex} will be shifted due to direct overlap with new widget at ${dragOverIndex}`)
        return true
      }
      
      // For widgets at or after insertion point, check if there are empty cells before them
      const isAtOrAfterInsertionPoint = w.cellIndex >= dragOverIndex
      
      if (isAtOrAfterInsertionPoint) {
        // For multi-cell widgets, calculate the actual area they occupy
        const dragRow = Math.floor(dragOverIndex / 6)
        const dragCol = dragOverIndex % 6
        const dragEndRow = dragRow + dragWidgetSize.height - 1
        const dragEndCol = dragCol + dragWidgetSize.width - 1
        
        // Calculate the last cell of the new widget area
        const newWidgetEndIndex = dragEndRow * 6 + dragEndCol
        
        // Check if there are empty cells between the new widget area and this widget
        const hasEmptySpace = hasEmptyCellsBetween(newWidgetEndIndex + 1, w.cellIndex)
        
        if (!hasEmptySpace) {
          console.log(`Widget ${w.id} at index ${w.cellIndex} will be shifted (no empty space before it). New widget ends at ${newWidgetEndIndex}`)
          return true
        } else {
          console.log(`Widget ${w.id} at index ${w.cellIndex} will NOT be shifted (has empty space before it). New widget ends at ${newWidgetEndIndex}`)
          return false
        }
      }
      
      return false
    })
    
    if (widgetsToShift.length === 0) {
      return shifts
    }

    // Process all widgets that need to be shifted and find positions for them
    const processedWidgets = new Set<string>()
    
    const addWidgetToShift = (widget: PlacedWidget) => {
      if (processedWidgets.has(widget.id)) return
      processedWidgets.add(widget.id)
      
      // Find shift position - first available position to the right
      const excludeList = [excludeWidgetId, ...Array.from(processedWidgets)].filter(id => id !== undefined)
      const nextPosition = findShiftPositionBasedOnTargetIndex(dragOverIndex, dragWidgetSize, widget, excludeList)
      
      if (nextPosition !== -1) {
        // Check if there's a widget at the next position that also needs shifting
        const nextConflict = placedWidgets.find(w => {
          if (w.id === excludeWidgetId || processedWidgets.has(w.id)) return false
          
          const wRow = Math.floor(w.cellIndex / 6)
          const wCol = w.cellIndex % 6
          const nextRow = Math.floor(nextPosition / 6)
          const nextCol = nextPosition % 6
          
          return nextRow >= wRow && nextRow < wRow + w.size.height &&
                 nextCol >= wCol && nextCol < wCol + w.size.width
        })
        
        if (nextConflict) {
          addWidgetToShift(nextConflict)
        }
      }
    }
    
    // Add all widgets that need to be shifted to the processing list
    widgetsToShift.forEach(widget => addWidgetToShift(widget))
    
    // Calculate new positions for all widgets that need to be shifted
    const excludeArea = { index: dragOverIndex, size: dragWidgetSize }
    
    // Sort widgets by their current position to process them in order
    const sortedWidgets = widgetsToShift.sort((a, b) => a.cellIndex - b.cellIndex)
    
    // Process widgets one by one, considering already-assigned positions and cascading shifts
    const assignedPositions = new Map<string, number>()
    const additionalWidgetsToShift = new Set<string>()
    
    // Helper function to check if a widget at a position would overlap with existing widgets
    const findOverlappingWidgets = (position: number, widgetSize: { width: number; height: number }, excludeIds: string[]): PlacedWidget[] => {
      const row = Math.floor(position / 6)
      const col = position % 6
      const endRow = row + widgetSize.height - 1
      const endCol = col + widgetSize.width - 1
      
      return placedWidgets.filter(w => {
        if (excludeIds.includes(w.id) || w.id === excludeWidgetId) return false
        
        const wRow = Math.floor(w.cellIndex / 6)
        const wCol = w.cellIndex % 6
        const wEndRow = wRow + w.size.height - 1
        const wEndCol = wCol + w.size.width - 1
        
        // Rectangle overlap check
        const overlaps = !(endRow < wRow || row > wEndRow || endCol < wCol || col > wEndCol)
        return overlaps
      })
    }
    
    sortedWidgets.forEach(widget => {
      // Create exclude list including dragged widget, widgets being shifted and their new positions
      const excludeList = [excludeWidgetId, ...Array.from(processedWidgets), ...Array.from(additionalWidgetsToShift)].filter(id => id !== undefined)
      
      // Find the first available position to the right for each widget
      const newIndex = findShiftPositionBasedOnTargetIndex(dragOverIndex, dragWidgetSize, widget, excludeList)
      if (newIndex !== -1 && newIndex < 36) {
        // Check if this position conflicts with any already-assigned positions
        let hasConflict = false
        
        for (const [assignedWidgetId, assignedIndex] of assignedPositions.entries()) {
          const assignedWidget = placedWidgets.find(w => w.id === assignedWidgetId)
          if (assignedWidget) {
            // Check if the new position would overlap with an already-assigned widget
            const assignedRow = Math.floor(assignedIndex / 6)
            const assignedCol = assignedIndex % 6
            const newRow = Math.floor(newIndex / 6)
            const newCol = newIndex % 6
            
            // Rectangle overlap check
            const assignedEndRow = assignedRow + assignedWidget.size.height - 1
            const assignedEndCol = assignedCol + assignedWidget.size.width - 1
            const newEndRow = newRow + widget.size.height - 1
            const newEndCol = newCol + widget.size.width - 1
            
            const overlaps = !(newEndRow < assignedRow || newRow > assignedEndRow ||
                              newEndCol < assignedCol || newCol > assignedEndCol)
            
            if (overlaps) {
              hasConflict = true
              console.log(`Widget ${widget.id} position ${newIndex} conflicts with already assigned widget ${assignedWidgetId} at ${assignedIndex}`)
              break
            }
          }
        }
        
        if (!hasConflict) {
          // Check if this position would overlap with any existing widgets that aren't being shifted
          const overlappingWidgets = findOverlappingWidgets(newIndex, widget.size, [...excludeList, ...Array.from(assignedPositions.keys())])
          
          // If there are overlapping widgets, add them to the shift list
          overlappingWidgets.forEach(overlappingWidget => {
            if (!additionalWidgetsToShift.has(overlappingWidget.id)) {
              console.log(`Widget ${overlappingWidget.id} at index ${overlappingWidget.cellIndex} needs to be shifted due to cascade from ${widget.id}`)
              additionalWidgetsToShift.add(overlappingWidget.id)
              
              // Find a position for the cascading widget
              const cascadeExcludeList = [excludeWidgetId, ...excludeList, ...Array.from(assignedPositions.keys())].filter(id => id !== undefined)
              const cascadePosition = findShiftPositionBasedOnTargetIndex(dragOverIndex, dragWidgetSize, overlappingWidget, cascadeExcludeList)
              if (cascadePosition !== -1) {
                shifts.set(overlappingWidget.id, cascadePosition)
                assignedPositions.set(overlappingWidget.id, cascadePosition)
                console.log(`Cascading widget ${overlappingWidget.id} will shift from ${overlappingWidget.cellIndex} to ${cascadePosition}`)
              }
            }
          })
          
          // Now place the original widget
          const allShiftingWidgetIds = [excludeWidgetId, ...Array.from(processedWidgets), ...Array.from(assignedPositions.keys()), ...Array.from(additionalWidgetsToShift)].filter(id => id !== undefined)
          
          if (canPlaceWidgetAt(newIndex, widget.size, allShiftingWidgetIds)) {
            shifts.set(widget.id, newIndex)
            assignedPositions.set(widget.id, newIndex)
            console.log(`Widget ${widget.id} will shift from ${widget.cellIndex} to ${newIndex}`)
          }
        } else {
          // Try to find another position
          for (let i = newIndex + 1; i < 36; i++) {
            const row = Math.floor(i / 6)
            const col = i % 6
            
            // Check bounds
            if (col + widget.size.width > 6 || row + widget.size.height > 6) {
              continue
            }
            
            // Check against assigned positions
            let foundConflict = false
            for (const [assignedWidgetId, assignedIndex] of assignedPositions.entries()) {
              const assignedWidget = placedWidgets.find(w => w.id === assignedWidgetId)
              if (assignedWidget) {
                const assignedRow = Math.floor(assignedIndex / 6)
                const assignedCol = assignedIndex % 6
                const testRow = Math.floor(i / 6)
                const testCol = i % 6
                
                const assignedEndRow = assignedRow + assignedWidget.size.height - 1
                const assignedEndCol = assignedCol + assignedWidget.size.width - 1
                const testEndRow = testRow + widget.size.height - 1
                const testEndCol = testCol + widget.size.width - 1
                
                const overlaps = !(testEndRow < assignedRow || testRow > assignedEndRow ||
                                  testEndCol < assignedCol || testCol > assignedEndCol)
                
                if (overlaps) {
                  foundConflict = true
                  break
                }
              }
            }
            
            if (!foundConflict && canPlaceWidgetAtWithExclusions(i, widget.size, { index: dragOverIndex, size: dragWidgetSize }, [excludeWidgetId, ...excludeList].filter(id => id !== undefined))) {
              shifts.set(widget.id, i)
              assignedPositions.set(widget.id, i)
              console.log(`Widget ${widget.id} will shift from ${widget.cellIndex} to ${i} (alternative position)`)
              break
            }
          }
        }
      }
    })
    
    return shifts
  }

  const handleAddWidget = (widget: any) => {
    // Handle widget addition logic here
  }
  
  const handleDragStartFromPopup = (widget: any) => {
    setCurrentDraggedWidget(widget)
    setDraggedWidgetSize(widget.size)
  }
  
  const handleDragEndFromPopup = () => {
    setCurrentDraggedWidget(null)
    setDraggedWidgetSize(null)
  }

  const handleDrop = (e: React.DragEvent, cellIndex: number) => {
    e.preventDefault()
    
    const widgetData = e.dataTransfer.getData("widget")
    const existingWidgetId = e.dataTransfer.getData("existingWidget")
    
    if (existingWidgetId || draggedWidget) {
      // Moving an existing widget
      const widgetId = existingWidgetId || draggedWidget?.id
      
      if (widgetId) {
        const sourceWidget = placedWidgets.find(w => w.id === widgetId)
        
        if (sourceWidget) {
          const canPlaceDirectly = canPlaceWidgetAt(cellIndex, sourceWidget.size, widgetId)
          
          if (canPlaceDirectly) {
            // Simple move to empty space
            setPlacedWidgets(prev => prev.map(w => {
              if (w.id === widgetId) {
                return { ...w, cellIndex }
              }
              return w
            }))
            console.log(`Moved existing widget ${widgetId} to ${cellIndex} without shifts`)
          } else if (shiftedWidgets.size > 0) {
            // Apply shifts and move the widget
            let allShiftsValid = true
            
            // Validate all shifts are still valid
            for (const [shiftWidgetId, newIndex] of shiftedWidgets.entries()) {
              const widget = placedWidgets.find(w => w.id === shiftWidgetId)
              if (widget) {
                const excludeIds = [widgetId, ...Array.from(shiftedWidgets.keys())]
                const isValidShift = canPlaceWidgetAtWithExclusions(newIndex, widget.size, { index: cellIndex, size: sourceWidget.size }, excludeIds)
                if (!isValidShift) {
                  allShiftsValid = false
                  break
                }
              }
            }
            
            if (allShiftsValid) {
              // Apply all shifts and move the dragged widget
              setPlacedWidgets(prev => {
                return prev.map(w => {
                  if (w.id === widgetId) {
                    return { ...w, cellIndex }
                  } else {
                    const newIndex = shiftedWidgets.get(w.id)
                    return newIndex !== undefined ? { ...w, cellIndex: newIndex } : w
                  }
                })
              })
              console.log(`Moved existing widget ${widgetId} to ${cellIndex} with ${shiftedWidgets.size} shifts`)
            } else {
              // Cannot apply shifts - invalid drop
              console.log("Cannot apply shifts for existing widget drop")
              return
            }
          } else {
            // Cannot place and no shifts calculated - invalid drop
            console.log("Cannot place existing widget and no shifts available")
            return
          }
        }
      }
    } else if (widgetData) {
      // Adding new widget from popup
      const widget = JSON.parse(widgetData)
      
      const newWidget: PlacedWidget = {
        id: `${widget.id}-${Date.now()}`,
        cellIndex,
        name: widget.name,
        iconName: widget.icon.name,
        color: widget.color,
        size: widget.size,
        type: widget.type
      }
      

      
      // Use the actual widget size from the data, not the dragged widget size state
      const actualWidgetSize = widget.size
      
      // For multi-cell widgets, be more strict about placement
      const isMultiCell = actualWidgetSize.width > 1 || actualWidgetSize.height > 1
      
      if (canPlaceWidgetAt(cellIndex, actualWidgetSize)) {
        // Can place directly - no shifts needed

        setPlacedWidgets(prev => [...prev, newWidget])
      } else if (shiftedWidgets.size > 0) {
        // Check if all shifts are valid before applying them
        let allShiftsValid = true
        const shiftValidation = new Map<string, boolean>()
        
        for (const [widgetId, newIndex] of shiftedWidgets.entries()) {
          const widget = placedWidgets.find(w => w.id === widgetId)
          if (widget) {
            // Verify that the widget can actually be placed at the new position
            // Exclude all shifting widgets when checking placement
            const excludeIds = Array.from(shiftedWidgets.keys())
            const isValidShift = canPlaceWidgetAtWithExclusions(newIndex, widget.size, { index: cellIndex, size: actualWidgetSize }, excludeIds)
            shiftValidation.set(widgetId, isValidShift)
            
            if (!isValidShift) {
              allShiftsValid = false
            }
          }
        }
        
        if (allShiftsValid) {
          // All shifts are valid - apply them
          setPlacedWidgets(prev => {
            const updatedWidgets = prev.map(w => {
              const newIndex = shiftedWidgets.get(w.id)
              return newIndex !== undefined ? { ...w, cellIndex: newIndex } : w
            })
            return [...updatedWidgets, newWidget]
          })
        } else {
          // Some shifts are invalid - cannot place widget

          return
        }
      } else {
        // Cannot place widget and no valid shifts

        
        return
      }
    }
    
    setDraggedOverCell(null)
    setShiftedWidgets(new Map())
    setDraggedWidget(null)
    setDraggedWidgetSize(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // Set appropriate drop effect based on what's being dragged
    if (e.dataTransfer.types.includes("existingwidget")) {
      e.dataTransfer.dropEffect = "move"
    } else {
      e.dataTransfer.dropEffect = "copy"
    }
  }

  const handleDragEnter = (cellIndex: number, e?: React.DragEvent) => {
    console.log(`=== DRAG ENTER === cellIndex: ${cellIndex}`)
    setDraggedOverCell(cellIndex)
    
    if (!draggedWidget) {
      // This is a new widget from popup - use the actual widget size that was set during drag start
      let widgetSize = draggedWidgetSize || currentDraggedWidget?.size || { width: 1, height: 1 }
      
      console.log(`Drag enter on cell ${cellIndex}, widget size: ${widgetSize.width}x${widgetSize.height}`)
      
      const canPlace = canPlaceWidgetAt(cellIndex, widgetSize)
      
      // Calculate what shifts would be needed for any widget size
      console.log(`About to call calculateWidgetShifts with cellIndex: ${cellIndex}`)
      const shifts = calculateWidgetShifts(cellIndex, widgetSize)
      
      // For multi-cell widgets, be more strict about validation
      if (widgetSize.width > 1 || widgetSize.height > 1) {
        // If we can't place directly, check if the shifts are actually valid
        if (!canPlace) {
          if (shifts.size === 0) {
            setShiftedWidgets(new Map()) // Clear shifts to show invalid state
            return
          } else {
            // Validate that all shifts are actually possible using the same logic as drop
            let allShiftsValid = true
            for (const [widgetId, newIndex] of shifts.entries()) {
              const widget = placedWidgets.find(w => w.id === widgetId)
              if (widget) {
                const excludeIds = Array.from(shifts.keys())
                const isValidShift = canPlaceWidgetAtWithExclusions(newIndex, widget.size, { index: cellIndex, size: widgetSize }, excludeIds)
                if (!isValidShift) {
                  allShiftsValid = false
                  break
                }
              }
            }
            
            if (!allShiftsValid) {
              setShiftedWidgets(new Map()) // Clear shifts to show invalid state
              return
            }
          }
        }
      }
      
      setShiftedWidgets(shifts)
      setDraggedWidgetSize(widgetSize) // Always use the parsed size for preview
    } else {
      // This is an existing widget being moved - calculate shifts for overlapping widgets
      const draggedWidgetSize = draggedWidget.size
      const canPlace = canPlaceWidgetAt(cellIndex, draggedWidgetSize, draggedWidget.id)
      
      console.log(`Existing widget drag enter on cell ${cellIndex}, widget size: ${draggedWidgetSize.width}x${draggedWidgetSize.height}`)
      
      if (!canPlace) {
        // Calculate shifts for overlapping widgets (exclude dragged widget from calculations)
        const shifts = calculateWidgetShifts(cellIndex, draggedWidgetSize, draggedWidget.id)
        setShiftedWidgets(shifts)
      } else {
        // Can place directly, no shifts needed
        setShiftedWidgets(new Map())
      }
      
      setDraggedWidgetSize(draggedWidgetSize)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the cell entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDraggedOverCell(null)
      setShiftedWidgets(new Map())
      setDraggedWidgetSize(null)
    }
  }

  const removeWidget = (widgetId: string) => {
    setPlacedWidgets(prev => prev.filter(w => w.id !== widgetId))
  }

  return (
    <div className="p-6">

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Oluştur</h1>
          <p className="text-gray-600">Widget'ları sürükleyip bırakarak dashboard'unuzu oluşturun</p>
        </div>
        <button 
          onClick={handleSaveDashboard}
          className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform cursor-pointer"
        >
          Kaydet
        </button>
      </div>

      {/* Date Filter Section */}
      <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Tarih Filtresi:</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="dateFrom" className="text-sm text-gray-600">Başlangıç:</label>
              <DateInput
                value={dateFrom}
                onChange={setDateFrom}
                className="px-3 py-1 text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label htmlFor="dateTo" className="text-sm text-gray-600">Bitiş:</label>
              <DateInput
                value={dateTo}
                onChange={setDateTo}
                className="px-3 py-1 text-sm"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Bu tarih aralığı tüm widget'lar için varsayılan filtre olarak kullanılacaktır
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div 
          className="w-full grid grid-cols-6 grid-rows-6 gap-4"
        >
          {/* Grid cells for drop zones */}
          {Array.from({ length: 36 }, (_, index) => {
            const row = Math.floor(index / 6)
            const col = index % 6
            const isDraggedOver = draggedOverCell === index
            
            // Check if this cell is occupied by any widget
            let isOccupied = false
            for (const widget of placedWidgets) {
              const widgetRow = Math.floor(widget.cellIndex / 6)
              const widgetCol = widget.cellIndex % 6
              
              if (row >= widgetRow && row < widgetRow + widget.size.height &&
                  col >= widgetCol && col < widgetCol + widget.size.width) {
                isOccupied = true
                break
              }
            }
            
            // Check if this cell would be invalid for a multi-cell widget
            const isInvalidDrop = isDraggedOver && shiftedWidgets.size === 0 && (isOccupied || draggedWidgetSize)
            
            return (
              <div
                key={`cell-${index}`}
                onDrop={(e) => handleDrop(e, index)}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(index, e)}
                onDragLeave={(e) => handleDragLeave(e)}
                className={`border-2 border-dashed rounded-lg aspect-square transition-all duration-300 ease-in-out ${
                  isInvalidDrop
                    ? "border-red-400 bg-red-50"
                    : isDraggedOver && !isOccupied
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-300"
                }`}
                style={{
                  gridColumn: col + 1,
                  gridRow: row + 1,
                  zIndex: 1
                }}
              >
                {!isOccupied && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50">
                    <Plus className="w-6 h-6 mb-2" />
                    <span className="text-xs font-medium">Widget Ekle</span>
                  </div>
                )}
              </div>
            )
          })}
          
          {/* Multi-cell widget preview during drag */}
          {draggedOverCell !== null && draggedWidgetSize && (
            <div
              className={`absolute border-2 rounded-lg pointer-events-none ${
                draggedWidget 
                  ? "border-orange-500 bg-orange-100 bg-opacity-30" 
                  : "border-blue-500 bg-blue-100 bg-opacity-30"
              }`}
              style={{
                gridColumn: `${(draggedOverCell % 6) + 1} / span ${draggedWidgetSize.width}`,
                gridRow: `${Math.floor(draggedOverCell / 6) + 1} / span ${draggedWidgetSize.height}`,
                zIndex: 15
              }}
            >
            </div>
          )}
          
          {/* Render placed widgets */}
          {placedWidgets.map((widget) => {
            // Check if this widget is being shifted during drag preview
            const shiftedIndex = shiftedWidgets.get(widget.id)
            const displayIndex = shiftedIndex !== undefined ? shiftedIndex : widget.cellIndex
            
            const row = Math.floor(displayIndex / 6)
            const col = displayIndex % 6
            const isBeingDragged = draggedWidget?.id === widget.id
            const isBeingShifted = shiftedIndex !== undefined
            
            // Skip rendering if the widget would be outside grid bounds
            if (row < 0 || row >= 6 || col < 0 || col >= 6 || 
                col + widget.size.width > 6 || row + widget.size.height > 6) {
              return null
            }
            
            return (
              <div
                key={widget.id}
                className={`relative bg-white border-2 rounded-lg cursor-move transition-all duration-300 overflow-hidden ${
                  isBeingDragged ? "opacity-50 border-gray-400" : 
                  isBeingShifted ? "border-orange-400 bg-orange-50" : "border-green-400"
                }`}
                style={{
                  gridColumn: `${col + 1} / span ${widget.size.width}`,
                  gridRow: `${row + 1} / span ${widget.size.height}`,
                  zIndex: isBeingDragged ? 30 : (isBeingShifted ? 20 : 10)
                }}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation()
                  e.dataTransfer.setData("existingWidget", widget.id)
                  e.dataTransfer.setData("text/plain", widget.id)
                  e.dataTransfer.effectAllowed = "move"
                  
                  // Store the original widget for restoration if needed
                  setOriginalDraggedWidget(widget)
                  setDraggedWidget(widget)
                  
                  console.log(`Started dragging widget ${widget.id}`)
                }}
                onDragEnd={() => {
                  // Clear drag state
                  setDraggedWidget(null)
                  setOriginalDraggedWidget(null)
                  console.log(`Drag ended`)
                }}
                onDrop={(e) => {
                  // Forward drop events to the underlying grid
                  e.preventDefault()
                  e.stopPropagation()
                  
                  // Calculate which cell we're dropping on
                  const rect = e.currentTarget.getBoundingClientRect()
                  const gridContainer = e.currentTarget.parentElement
                  if (gridContainer) {
                    const gridRect = gridContainer.getBoundingClientRect()
                    const relativeX = e.clientX - gridRect.left
                    const relativeY = e.clientY - gridRect.top
                    
                    const cellWidth = gridRect.width / 6
                    const cellHeight = gridRect.height / 6
                    
                    const col = Math.floor(relativeX / cellWidth)
                    const row = Math.floor(relativeY / cellHeight)
                    const cellIndex = row * 6 + col
                    
                    if (cellIndex >= 0 && cellIndex < 36 && col >= 0 && col < 6 && row >= 0 && row < 6) {
                      handleDrop(e, cellIndex)
                    }
                  }
                }}
                onDragOver={(e) => {
                  // Always forward drag over events to underlying drop zones
                  e.preventDefault()
                  e.stopPropagation()
                  
                  // Calculate which cell we're over based on mouse position
                  const rect = e.currentTarget.getBoundingClientRect()
                  const gridContainer = e.currentTarget.parentElement
                  if (gridContainer) {
                    const gridRect = gridContainer.getBoundingClientRect()
                    const relativeX = e.clientX - gridRect.left
                    const relativeY = e.clientY - gridRect.top
                    
                    // Calculate cell dimensions (assuming uniform grid)
                    const cellWidth = gridRect.width / 6
                    const cellHeight = gridRect.height / 6
                    
                    const col = Math.floor(relativeX / cellWidth)
                    const row = Math.floor(relativeY / cellHeight)
                    const cellIndex = row * 6 + col
                    
                    if (cellIndex >= 0 && cellIndex < 36 && col >= 0 && col < 6 && row >= 0 && row < 6) {
                      handleDragEnter(cellIndex, e)
                    }
                  }
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeWidget(widget.id)
                  }}
                  className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 z-50"
                >
                  ×
                </button>
                {renderWidgetContent(widget, dateFrom, dateTo)}
              </div>
            )
          })}
        </div>
      </div>

      {/* Widget Adder */}
      <WidgetAdder 
        onAddWidget={handleAddWidget} 
        onDragStart={handleDragStartFromPopup}
        onDragEnd={handleDragEndFromPopup}
      />

      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center gap-2">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-white hover:text-green-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Save Dashboard Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{backdropFilter: 'blur(3px)'}}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 pointer-events-auto shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Dashboard Kaydet</h2>
              <button
                onClick={handleModalCancel}
                disabled={isLoading}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            <div className="mb-6">
              <label htmlFor="dashboard-name" className="block text-sm font-medium text-gray-700 mb-2">
                Dashboard Adı
              </label>
              <input
                id="dashboard-name"
                type="text"
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && dashboardName.trim() && !isLoading) {
                    handleModalSave()
                  }
                }}
                placeholder="Ekran adını girin..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-colors disabled:bg-gray-100"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between">
                <label htmlFor="dashboard-public" className="block text-sm font-medium text-gray-700">
                  Dashboard Görünürlüğü
                </label>
                <div className="flex items-center space-x-3">
                  <span className={`text-sm ${!isPublic ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>Özel</span>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    disabled={isLoading}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                      isPublic ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm ${isPublic ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>Herkese Açık</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {isPublic ? 'Dashboard tüm kullanıcılar tarafından görüntülenebilir' : 'Dashboard sadece size özeldir'}
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleModalCancel}
                disabled={isLoading}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                İptal
              </button>
              <button
                onClick={handleModalSave}
                disabled={!dashboardName.trim() || isLoading}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {isLoading ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}