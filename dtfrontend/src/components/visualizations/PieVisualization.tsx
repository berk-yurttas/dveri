import React from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { VisualizationProps } from './types'

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316']

export const PieVisualization: React.FC<VisualizationProps> = ({ query, result, colors = DEFAULT_COLORS, scale = 1 }) => {
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

  const pieData = chartData.map((item, index) => ({
    name: item[visualization.labelField || columns[0]],
    value: parseFloat(item[visualization.valueField || columns[1]]) || 0,
    fill: colors[index % colors.length]
  }))

  // Custom label with line connector
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, name, value, percent } = props
    const RADIAN = Math.PI / 180
    const sin = Math.sin(-midAngle * RADIAN)
    const cos = Math.cos(-midAngle * RADIAN)
    const sx = cx + (outerRadius + 5) * cos
    const sy = cy + (outerRadius + 5) * sin
    const mx = cx + (outerRadius + 15) * cos
    const my = cy + (outerRadius + 15) * sin
    const ex = mx + (cos >= 0 ? 1 : -1) * 10
    const ey = my
    const textAnchor = cos >= 0 ? 'start' : 'end'

    // Split long labels into multiple lines
    const maxCharsPerLine = 12
    const words = name.split(' ')
    const lines: string[] = []
    let currentLine = ''

    words.forEach((word: string) => {
      if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
        currentLine = (currentLine + ' ' + word).trim()
      } else {
        if (currentLine) lines.push(currentLine)
        currentLine = word
      }
    })
    if (currentLine) lines.push(currentLine)

    // Dynamic font size based on text length
    const nameFontSize = name.length > 20 ? '9px' : name.length > 12 ? '10px' : '11px'
    const valueFontSize = name.length > 20 ? '8px' : '9px'
    const lineHeight = name.length > 20 ? 10 : 11

    // Calculate vertical offset to center multiple lines
    const totalHeight = lines.length * lineHeight
    const startY = ey - totalHeight / 2

    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke="#999" fill="none" strokeWidth={1} />
        <circle cx={ex} cy={ey} r={2} fill="#999" />
        {lines.map((line, index) => (
          <text
            key={index}
            x={ex + (cos >= 0 ? 1 : -1) * 6}
            y={startY + index * lineHeight}
            textAnchor={textAnchor}
            fill="#333"
            fontSize={nameFontSize}
            fontWeight="500"
          >
            {line}
          </text>
        ))}
        <text
          x={ex + (cos >= 0 ? 1 : -1) * 6}
          y={startY + lines.length * lineHeight + 8}
          textAnchor={textAnchor}
          fill="#666"
          fontSize={valueFontSize}
        >
          {value} ({(percent * 100).toFixed(0)}%)
        </text>
      </g>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '300px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={(visualization.chartOptions?.innerRadius || 0)}
            outerRadius="60%"
            paddingAngle={2}
            dataKey="value"
            label={renderCustomLabel}
            labelLine={false}
          >
            {pieData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

