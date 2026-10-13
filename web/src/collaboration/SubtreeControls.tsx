import type { CompiledRig } from '../generated/CompiledRig';
import { parentForest, subtreeIds, type ParentLink } from '../release/treeLayout';
export function SubtreeControls({compiled,children,root,selected,onChange}: {
  compiled:CompiledRig;children:ParentLink[];root?:string;selected?:string;onChange:(id:string)=>void;
}) {
  if(!children.length && !root) return null;
  const family=parentForest(compiled,children);
  const parent=family.find(l=>l.child===root)?.parent;
  const exists=compiled.seats.some(s=>s.id===root);
  return <div className="subtree-controls">
    <label>View <select aria-label="View subtree" value={root ?? ''} onChange={e=>onChange(e.target.value)}>
      <option value="">Whole tree</option>
      {root && !exists && <option value={root}>Previous subtree (unavailable)</option>}
      {compiled.seats.map(s=><option key={s.id} value={s.id}>{s.label ?? s.member} · {subtreeIds(compiled,family,s.id).size} agents</option>)}
    </select></label>
    {selected && selected!==root && compiled.seats.some(s=>s.id===selected) && <button className="btn btn-ghost" onClick={()=>onChange(selected)}>Focus selected subtree</button>}
    {parent && <button className="btn btn-ghost" onClick={()=>onChange(parent)}>Up to parent</button>}
    {root && <button className="btn btn-ghost" onClick={()=>onChange('')}>Whole tree</button>}
  </div>;
}
