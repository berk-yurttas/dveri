import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { AlertCircle } from 'lucide-react'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const HistogramVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS, scale = 1 }) => {
  const { visualization } = query
  const { data, columns } = result

  // Convert data to format suitable for charts
  const chartData = data.map(row => {
    const item: any = {}
    columns.forEach((col, index) => {
      item[col] = row[index]
    })
    return item
  })

  // Histogram implementation
  const histogramValues = chartData.map(item =>
    parseFloat(item[visualization.yAxis || columns[1]]) || 0
  ).filter(val => !isNaN(val))

  if (histogramValues.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-yellow-400" />
          <div className="ml-3">
            <p className="text-sm text-yellow-800">
              No numeric data available for histogram.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Calculate histogram bins
  const minVal = Math.min(...histogramValues)
  const maxVal = Math.max(...histogramValues)
  const binCount = Math.min(20, Math.max(5, Math.ceil(Math.sqrt(histogramValues.length))))
  const binWidth = (maxVal - minVal) / binCount

  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: minVal + i * binWidth,
    binEnd: minVal + (i + 1) * binWidth,
    count: 0,
    binLabel: `${(minVal + i * binWidth).toFixed(1)}-${(minVal + (i + 1) * binWidth).toFixed(1)}`
  }))

  // Count values in each bin
  histogramValues.forEach(value => {
    const binIndex = Math.min(binCount - 1, Math.floor((value - minVal) / binWidth))
    if (binIndex >= 0 && binIndex < bins.length) {
      bins[binIndex].count++
    }
  })

  return (
    <ResponsiveContainer width="100%" height={400 * scale}>
      <BarChart data={bins}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="binLabel"
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis />
        <Tooltip
          formatter={(value, name) => [value, 'Frequency']}
          labelFormatter={(label) => `Range: ${label}`}
        />
        {visualization.showLegend && <Legend />}
        <Bar dataKey="count" fill={colors[0]} name="Frequency" />
      </BarChart>
    </ResponsiveContainer>
  )
}

