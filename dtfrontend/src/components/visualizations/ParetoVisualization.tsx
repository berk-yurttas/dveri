import React from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const ParetoVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS, scale = 1 }) => {
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

  // Pareto chart implementation (bar + line combination)
  const paretoData = chartData
    .map(item => ({
      category: item[visualization.xAxis || columns[0]],
      value: parseFloat(item[visualization.yAxis || columns[1]]) || 0
    }))
    .sort((a, b) => b.value - a.value) // Sort descending

  // Calculate cumulative percentages
  const totalValue = paretoData.reduce((sum, item) => sum + item.value, 0)
  let cumulative = 0
  const paretoChartData = paretoData.map(item => {
    cumulative += item.value
    return {
      ...item,
      cumulative: (cumulative / totalValue) * 100
    }
  })

  return (
    <ResponsiveContainer width="100%" height={400 * scale}>
      <ComposedChart data={paretoChartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="category" />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
        <Tooltip
          formatter={(value, name) => {
            if (name === 'cumulative') {
              return [`${Number(value).toFixed(1)}%`, 'Cumulative %']
            }
            return [value, name]
          }}
        />
        {visualization.showLegend && <Legend />}
        <Bar yAxisId="left" dataKey="value" fill={colors[0]} name="Value" />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulative"
          stroke={colors[1] || '#ff7300'}
          strokeWidth={2}
          dot={{ fill: colors[1] || '#ff7300' }}
          name="Cumulative %"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

