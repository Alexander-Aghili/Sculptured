import type { PointerEvent } from 'react';
import type { EdgeGeom } from '../shell/edgeGeometry';

/** Visible endpoints for pointer editing; Enter opens the equivalent form controls. */
export function ArrowHandles({ geometry, label, ends = ['from', 'to'], onDrag, onEdit }: {
  geometry: EdgeGeom; label: string; ends?: ('from' | 'to')[];
  onDrag: (end: 'from' | 'to', event: PointerEvent<HTMLButtonElement>) => void; onEdit: () => void;
}) {
  return <>{ends.map(end => {
    const point = geometry.pts[end === 'from' ? 0 : 3];
    return <button key={end} type="button" className="arrow-handle" style={{left:point.x,top:point.y}}
      aria-label={`Change ${end === 'from' ? 'source' : 'destination'} of ${label}`} title="Drag to an agent, or press Enter to edit"
      onPointerDown={e => onDrag(end,e)} onClick={e => { if (e.detail === 0) onEdit(); }} />;
  })}</>;
}
