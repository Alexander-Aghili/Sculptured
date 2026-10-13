import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { lessons } from './registry';
import { validateLessons } from './contract';
import { ToolkitPreview } from './interactions/ToolkitPreview';
import './style.css';
import { EnginePreview } from './engine/EnginePreview';

function App() {
  const [id, setId] = useState(decodeURIComponent(location.hash.slice(1))), [query, setQuery] = useState(''), [reading, setReading] = useState(false);
  useEffect(() => { const change = () => setId(decodeURIComponent(location.hash.slice(1))); addEventListener('hashchange', change); return () => removeEventListener('hashchange', change); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setReading(false); }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, []);
  const ordered = [...lessons].sort((a,b) => a.order - b.order), current = ordered.find(l => l.id === id), problems = validateLessons(lessons);
  return <div className={`book${reading ? ' reading' : ''}`}>
    <header><a className="brand" href="#">LIVE / TEXTBOOK</a><span>Understand through exploration</span><button onClick={() => setReading(true)}>Text Mode</button></header>
    {reading && <button className="exit" onClick={() => setReading(false)}>Exit Text Mode</button>}
    <aside><label>Find a topic<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this book" /></label><nav aria-label="Chapters">{ordered.filter(l => `${l.title} ${l.summary} ${l.chapter}`.toLowerCase().includes(query.toLowerCase())).map(l => <a key={l.id} href={`#${l.id}`} aria-current={id === l.id ? 'page' : undefined}><small>{l.chapter}</small>{l.title}</a>)}</nav>{!lessons.length && <p>Your chapters will appear here after the first accepted batch.</p>}</aside>
    <main>{problems.length > 0 && <section role="alert"><h2>Assembly needs attention</h2><ul>{problems.map((p,i) => <li key={i}>{p}</li>)}</ul></section>}
      {current ? <><span className="eyebrow">{current.chapter}</span><h1>{current.title}</h1><p className="intro">{current.summary}</p><details><summary>Learning goals & prerequisites</summary><ul>{current.objectives.map(x => <li key={x}>{x}</li>)}</ul>{current.prerequisites.map(p => <a key={p} href={`#${p}`}>{ordered.find(l => l.id === p)?.title || p} </a>)}</details><current.Content />{current.Interaction && <current.Interaction />}<section><h2>Sources & evidence</h2><ul>{current.sources.map((s,i) => <li key={i}>{s.url ? <a href={s.url}>{s.title}</a> : s.title} · {s.section} · {s.author} · {s.license}</li>)}</ul><p>Artifact revision: {current.revision}. Check results below are reported evidence, not a guarantee of correctness.</p>{current.checks.map((c,i) => <p key={i}>{c.kind}: {c.status} · {c.reviewer} · {c.evidence}</p>)}</section><nav className="lesson-nav" aria-label="Reading order">{ordered[ordered.indexOf(current)-1] && <a href={`#${ordered[ordered.indexOf(current)-1].id}`}>← Previous section</a>}{ordered[ordered.indexOf(current)+1] && <a href={`#${ordered[ordered.indexOf(current)+1].id}`}>Next section →</a>}</nav></> : <><span className="eyebrow">Reusable textbook studio</span><h1>Ideas become<br />things you can explore.</h1><p className="intro">Your textbook has not been generated yet. Add source links, notes and learning goals in the project’s Input block. The team will plan meaningful interactions, review them and assemble your book here.</p><div className="steps"><span>01 / Source & plan</span><span>02 / Build & review</span><span>03 / Read & explore</span></div><EnginePreview /><ToolkitPreview /></>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
