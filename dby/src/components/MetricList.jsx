export default function MetricList({ label, rows }) {
  return (
    <dl aria-label={label} className="divide-y divide-line rounded-md border border-line bg-surface px-4">
      {rows.map(([name, value, detail]) => (
        <div key={name} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 py-2">
          <dt className="text-sm text-ink">{name}</dt>
          <dd className="text-right font-mono text-sm tabular-nums">{value}</dd>
          {detail && <dd className="col-span-2 text-xs text-muted">{detail}</dd>}
        </div>
      ))}
    </dl>
  );
}
