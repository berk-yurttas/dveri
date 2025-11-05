import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const BoxPlotVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS }) => {
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

  // Box plot implementation using custom components
  const boxPlotData = chartData.map(item => ({
    category: item[visualization.xAxis || columns[0]],
    value: parseFloat(item[visualization.yAxis || columns[1]]) || 0
  }))

  // Group data by category and calculate quartiles
  const groupedData = boxPlotData.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = []
    }
    acc[item.category].push(item.value)
    return acc
  }, {} as Record<string, number[]>)

  const boxPlotChartData = Object.entries(groupedData).map(([category, values]) => {
    const sorted = values.sort((a, b) => a - b)
    const q1 = sorted[Math.floor(sorted.length * 0.25)]
    const median = sorted[Math.floor(sorted.length * 0.5)]
    const q3 = sorted[Math.floor(sorted.length * 0.75)]
    const min = Math.min(...sorted)
    const max = Math.max(...sorted)

    return {
      category,
      min,
      q1,
      median,
      q3,
      max,
      values: sorted
    }
  })

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={boxPlotChartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="category" />
        <YAxis />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload
              return (
                <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                  <p className="font-medium">{`${label}`}</p>
                  <p className="text-blue-600">{`Min: ${data.min}`}</p>
                  <p className="text-blue-600">{`Q1: ${data.q1}`}</p>
                  <p className="text-blue-600">{`Median: ${data.median}`}</p>
                  <p className="text-blue-600">{`Q3: ${data.q3}`}</p>
                  <p className="text-blue-600">{`Max: ${data.max}`}</p>
                  <p className="text-gray-600">{`Count: ${data.values.length}`}</p>
                </div>
              )
            }
            return null
          }}
        />
        {visualization.showLegend && <Legend />}
        <Bar dataKey="median" fill={colors[0]} name="Box Plot" />
      </BarChart>
    </ResponsiveContainer>
  )
}

