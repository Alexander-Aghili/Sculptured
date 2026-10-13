export type Vec3 = readonly [number, number, number];
export type Color = readonly [number, number, number, number];
export type Geometry = { positions: Float32Array; topology: 'line-list' | 'triangle-list'; color: Color };
export const MAX_VERTICES = 300_000;
const finite = (p: Vec3) => p.every(Number.isFinite);
export function curve(fn: (t: number) => Vec3, range: readonly [number, number], segments = 128, color: Color = [0.3,0.7,1,1]): Geometry {
  if (!range.every(Number.isFinite) || range[0] >= range[1] || !Number.isInteger(segments) || segments < 1 || segments * 2 > MAX_VERTICES) throw Error('Invalid curve domain or sampling budget');
  const out: number[] = [];
  for (let i=0;i<segments;i++) {
    const a=fn(range[0]+(range[1]-range[0])*i/segments), b=fn(range[0]+(range[1]-range[0])*(i+1)/segments);
    if (!finite(a)||!finite(b)) throw Error('Curve contains a non-finite point; split singular domains explicitly');
    out.push(...a,...b);
  }
  return {positions:new Float32Array(out),topology:'line-list',color};
}
export function surface(fn:(u:number,v:number)=>Vec3, u:readonly[number,number],v:readonly[number,number],steps=32,color:Color=[0.35,0.6,0.8,1]):Geometry {
  if(![...u,...v].every(Number.isFinite)||u[0]>=u[1]||v[0]>=v[1]||!Number.isInteger(steps)||steps<1||steps*steps*6>MAX_VERTICES) throw Error('Invalid surface domain or sampling budget');
  const out:number[]=[];
  const point=(i:number,j:number)=>{const p=fn(u[0]+(u[1]-u[0])*i/steps,v[0]+(v[1]-v[0])*j/steps);if(!finite(p))throw Error('Surface contains a non-finite point');return p;};
  for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){const a=point(i,j),b=point(i+1,j),c=point(i,j+1),d=point(i+1,j+1);out.push(...a,...b,...c,...b,...d,...c);}
  return {positions:new Float32Array(out),topology:'triangle-list',color};
}
export type Camera={yaw:number;pitch:number;span:number;center:Vec3};
export const DEFAULT_CAMERA:Camera={yaw:0.5,pitch:-0.35,span:4,center:[0,0,0]};
/** Column-major orthographic transform. Right-handed world; WebGPU depth [0,1]. */
export function cameraMatrix(c:Camera,aspect:number):Float32Array{
  if(![c.yaw,c.pitch,c.span,aspect,...c.center].every(Number.isFinite)||c.span<=0||aspect<=0)throw Error('Invalid camera');
  const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
  const sx=2/(c.span*aspect),s=2/c.span,z=1/(c.span*20);
  const rows=[[cy*sx,0,sy*sx],[-sp*sy*s,cp*s,sp*cy*s],[-cp*sy*z,-sp*z,cp*cy*z]];
  const m=new Float32Array(16);for(let row=0;row<3;row++){for(let col=0;col<3;col++)m[col*4+row]=rows[row][col];m[12+row]=-rows[row].reduce((n,x,i)=>n+x*c.center[i],0)+(row===2?0.5:0);}m[15]=1;return m;
}
