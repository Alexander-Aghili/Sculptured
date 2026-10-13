export function Parameter({ label, value, onChange, min, max, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return <label className="parameter"><span>{label} <output>{value.toFixed(2)}</output></span><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))} /></label>;
}
