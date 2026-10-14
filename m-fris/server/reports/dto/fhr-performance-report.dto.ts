/** GET /reports/dashboard-fhr-performance-report — row counts from operated legs only; every percentage uses operated total as denominator, including the cancelled row. */
export type FhrPerformanceReportBucketDto = {
  count: number;
  percentage: string;
};

export type FhrPerformanceReportDto = {
  range: { fromYmd: string; toYmd: string };
  onTime: FhrPerformanceReportBucketDto;
  cancelled: FhrPerformanceReportBucketDto;
  offSkd: FhrPerformanceReportBucketDto;
  groundTimeSaved: FhrPerformanceReportBucketDto;
  departedBeforeStd: FhrPerformanceReportBucketDto;
  agtGtSgt: FhrPerformanceReportBucketDto;
  totalFlights: FhrPerformanceReportBucketDto;
};
