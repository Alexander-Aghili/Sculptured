import {expect,it} from 'vitest';
import {fitViewport} from './viewport';
it('fits a wide ten-child tree without clipping either side',()=>{
 const b={x0:0,y0:0,x1:3000,y1:1200};const v=fitViewport(b,700,480);
 expect(v.x).toBeGreaterThanOrEqual(0);expect(v.y).toBeGreaterThanOrEqual(0);
 expect(v.x+b.x1*v.k).toBeLessThanOrEqual(700);expect(v.y+b.y1*v.k).toBeLessThanOrEqual(480);
});
