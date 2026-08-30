import type { AnalysisResult } from "../contracts";
import { useI18n } from "../i18n";

interface StatsProps {
  analysis: AnalysisResult | null;
  diagnosticCount: number;
}

export function Stats({ analysis, diagnosticCount }: StatsProps) {
  const { messages } = useI18n();
  if (analysis === null) {
    return null;
  }

  const values = [
    [messages.stats.bytes, analysis.stats.bytes],
    [messages.stats.lines, analysis.stats.lines],
    [messages.stats.keys, analysis.stats.keys],
    [
      messages.stats.tables,
      analysis.stats.tables + analysis.stats.array_tables,
    ],
    [messages.stats.tokens, analysis.stats.tokens],
    [messages.stats.diagnostics, diagnosticCount],
  ];

  return (
    <dl
      className="result-stats"
      role="region"
      aria-label={messages.stats.regionLabel}
      data-stats
    >
      {values.map(([label, value]) => (
        <div className="result-stat" data-stat key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
