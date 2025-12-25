import React from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const AreaVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS, scale = 1 }) => {
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
    <ResponsiveContainer width="100%" height={400 * scale}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey={visualization.xAxis || columns[0]} />
        <YAxis />
        <Tooltip />
        {visualization.showLegend && <Legend />}
        <Area 
          type="monotone" 
          dataKey={visualization.yAxis || columns[1]} 
          stroke={colors[0]}
          fill={colors[0]}
          fillOpacity={0.6}
          name={visualization.yAxis || columns[1]}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

