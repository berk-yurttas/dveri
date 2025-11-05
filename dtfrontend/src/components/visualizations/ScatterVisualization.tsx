import React from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const ScatterVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS }) => {
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

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={visualization.xAxis || columns[0]} />
        <YAxis dataKey={visualization.yAxis || columns[1]} />
        <Tooltip />
        {visualization.showLegend && <Legend />}
        <Scatter
          name={query.name}
          data={chartData}
          fill={colors[0]}
        />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

