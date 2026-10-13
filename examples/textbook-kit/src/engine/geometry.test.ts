import {describe,it,expect} from 'vitest';
import {curve,surface,cameraMatrix,DEFAULT_CAMERA} from './geometry';
describe('general mathematical geometry',()=>{
 it('samples a helix at exact endpoints',()=>{const g=curve(t=>[Math.cos(t),Math.sin(t),t],[0,Math.PI*2],8);expect(g.positions.length).toBe(48);expect(g.positions[0]).toBe(1);expect(g.positions.at(-1)).toBeCloseTo(Math.PI*2);});
 it('triangulates a parameter plane with consistent orientation',()=>{const g=surface((u,v)=>[u,v,0],[0,1],[0,1],1);expect([...g.positions]).toEqual([0,0,0,1,0,0,0,1,0,1,0,0,1,1,0,0,1,0]);});
 it('rejects singular samples and excessive work',()=>{expect(()=>curve(t=>[1/t,0,0],[0,1])).toThrow();expect(()=>surface((u,v)=>[u,v,0],[0,1],[0,1],10000)).toThrow();});
 it('centers a translated camera and keeps depth in WebGPU range',()=>{const c={...DEFAULT_CAMERA,center:[4,5,6] as const},m=cameraMatrix(c,1.5);const out=[0,1,2].map(i=>m[i]*4+m[4+i]*5+m[8+i]*6+m[12+i]);expect(out[0]).toBeCloseTo(0);expect(out[1]).toBeCloseTo(0);expect(out[2]).toBeCloseTo(.5);expect(()=>cameraMatrix({...c,span:0},1)).toThrow();});
});
