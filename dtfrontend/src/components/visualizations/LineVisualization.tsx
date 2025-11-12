import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const LineVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS, scale = 1 }) => {
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
    <ResponsiveContainer width="100%" height={450 * scale}>
      <LineChart data={chartData} margin={{ top: 20 * scale, right: 30 * scale, left: 10 * scale, bottom: 80 * scale }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={visualization.xAxis || columns[0]}
          stroke="#6b7280"
          style={{ fontSize: '10px', fontWeight: 500 }}
          tickLine={false}
          interval={0}
          padding={{ left: 30, right: 30 }}
          angle={-25}
          textAnchor="end"
          height={70}
        />
        <YAxis
          stroke="#6b7280"
          style={{ fontSize: '13px', fontWeight: 500 }}
          tickLine={false}
          label={{ value: visualization.yAxis || columns[1], angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
            padding: '12px'
          }}
          cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
        />
        <Line
          type="monotone"
          dataKey={visualization.yAxis || columns[1]}
          stroke={colors[0]}
          strokeWidth={2}
          dot={{ r: 4 }}
          name={visualization.yAxis || columns[1]}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

