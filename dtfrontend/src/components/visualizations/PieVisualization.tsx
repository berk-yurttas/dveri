import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const PieVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS }) => {
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

  const pieData = chartData.slice(0, 10).map((item, index) => ({
    name: item[visualization.labelField || columns[0]],
    value: parseFloat(item[visualization.valueField || columns[1]]) || 0,
    fill: colors[index % colors.length]
  }))

  return (
    <ResponsiveContainer width="100%" height={400}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          innerRadius={visualization.chartOptions?.innerRadius || 0}
          outerRadius={150}
          paddingAngle={5}
          dataKey="value"
        >
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip />
        {visualization.showLegend && <Legend />}
      </PieChart>
    </ResponsiveContainer>
  )
}

