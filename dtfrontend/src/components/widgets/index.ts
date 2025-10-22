export { EfficiencyWidget } from './efficiency-widget'
export { GaugeWidget } from './gauge-widget'
export { ProductTestWidget } from './product-test-widget'
export { TestAnalysisWidget } from './test-analysis-widget'
export { TestDurationWidget } from './test-duration-widget'
export { ExcelExportWidget } from './excel-export-widget'
export { MeasurementWidget } from './measurement-widget'
export { SerialNoComparisonWidget } from './serialno-comparison-widget'
export { TestDurationAnalysisWidget } from './test-duration-analysis-widget'
export { CapacityAnalysisWidget } from './capacity-analysis-widget'
export { MachineOeeWidget } from './machine-oee-widget'

// Export widget configurations
import { EfficiencyWidget } from './efficiency-widget'
import { GaugeWidget } from './gauge-widget'
import { ProductTestWidget } from './product-test-widget'
import { TestAnalysisWidget } from './test-analysis-widget'
import { TestDurationWidget } from './test-duration-widget'
import { ExcelExportWidget } from './excel-export-widget'
import { MeasurementWidget } from './measurement-widget'
import { SerialNoComparisonWidget } from './serialno-comparison-widget'
import { TestDurationAnalysisWidget } from './test-duration-analysis-widget'
import { CapacityAnalysisWidget } from './capacity-analysis-widget'
import { MachineOeeWidget } from './machine-oee-widget'

export const widgetConfigs = [
  EfficiencyWidget.config,
  //GaugeWidget.config,
  ProductTestWidget.config,
  TestAnalysisWidget.config,
  TestDurationWidget.config,
  ExcelExportWidget.config,
  MeasurementWidget.config,
  SerialNoComparisonWidget.config,
  TestDurationAnalysisWidget.config,
  CapacityAnalysisWidget.config,
  MachineOeeWidget.config
]
