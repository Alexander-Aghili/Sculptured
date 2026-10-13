import { useMemo, useState } from 'react';
import { curvePath, sampleCurve } from '../math/sampling';
import { Parameter } from './Controls';

/** An explicitly labeled toolkit demonstration, not a generated course section. */
export function ToolkitPreview() {
  const [a, setA] = useState(2), [b, setB] = useState(1);
  const points = useMemo(() => sampleCurve(t => ({ x: a * Math.cos(t), y: b * Math.sin(t) }), 0, Math.PI * 2), [a, b]);
  return <section className="lab"><div className="lab-controls"><span className="eyebrow">Toolkit preview · not course content</span><h2>Make a relationship visible</h2>
    <p>A small example of the reusable controls, bounded mathematical sampling, labeled plot and text fallback available to each interaction builder.</p>
    <p><code>x(t) = a cos(t), y(t) = b sin(t)</code></p><Parameter label="Horizontal radius a" value={a} onChange={setA} min={0.2} max={3} /><Parameter label="Vertical radius b" value={b} onChange={setB} min={0.2} max={3} />
    <button onClick={() => { setA(2); setB(1); }}>Reset example</button><p aria-live="polite">Width {2 * a}, height {2 * b}. {a === b ? 'Equal radii give a circle.' : 'Unequal radii give an ellipse.'}</p>
  </div><div><svg viewBox="0 0 400 400" role="img" aria-label={`Ellipse with horizontal radius ${a} and vertical radius ${b}`}><title>Parametric ellipse, sampled at 161 points</title><path d="M10 200H390 M200 10V390" stroke="#5b687c" /><text x="380" y="190">x</text><text x="210" y="18">y</text><text x="207" y="217">0</text><path d={curvePath(points)} fill="none" stroke="#75dfbc" strokeWidth="3" /></svg>
    <details><summary>Coordinate table & numerical limits</summary><p>The curve uses 161 samples. The formula defines the ellipse; the sampled drawing is an illustration, not a proof.</p><table><thead><tr><th>Point</th><th>x</th><th>y</th></tr></thead><tbody>{points.filter((_, i) => i % 40 === 0).map((p,i) => <tr key={i}><td>{i}</td><td>{p?.x.toFixed(3)}</td><td>{p?.y.toFixed(3)}</td></tr>)}</tbody></table></details>
  </div></section>;
}
