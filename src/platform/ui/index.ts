/** Публичный вход дизайн-системы Platform 2.0 (P2-0010): токены, примитивы, графики, форматы подписей. */
export { P2_UI_CSS, P2_DARK_THEMES } from './tokens.ts';
export { KpiTile, ProgressBar, StatusBadge, Legend, seriesColor } from './primitives.ts';
export type { Status, SeriesKind, LegendItem } from './primitives.ts';
export { ChartCard, LineChart, BarChart } from './charts.ts';
export type { ChartTable, LineSeries, Bar } from './charts.ts';
export { compactNumber, compactRub, dayMonth, monthLabel, daysBetween, niceStep } from './format.ts';
export { ChessCell, ChessScale, CHESS_STATE_LABEL, P2_CHESS_CSS } from './chess.ts';
export type { ChessState } from './chess.ts';
export { RegistryTable, registryRows } from './registry/RegistryTable.ts';
export type { RegistryProps, RegistryGroupBy } from './registry/RegistryTable.ts';
export { SideCard, Steps, HistoryFeed } from './registry/SideCard.ts';
export type { Step, HistoryItem } from './registry/SideCard.ts';
export { EMPTY_STATE, filterRows, sortRows, groupRows, countTones, filterOptions, chipsOf, visibleColumns, toggleValue, stateToQuery, queryToState, linkFor, queryOf } from './registry/model.ts';
export type { RegistryColumn, RegistryFilter, RegistryState, RegistrySort, RegistryGroup, RegistryChip } from './registry/model.ts';
export { listViews, saveView, deleteView, viewState, syncRegistryAddress } from './registry/views.ts';
export type { SavedView, ViewScope } from './registry/views.ts';
export { buildRegistryXlsx, registryFileName, saveXlsx } from './registry/export.ts';
export { P2_REGISTRY_CSS } from './registry/styles.ts';
