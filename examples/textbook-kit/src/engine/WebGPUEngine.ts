/// <reference types="@webgpu/types" />
import { cameraMatrix, DEFAULT_CAMERA, MAX_VERTICES, type Camera, type Geometry } from './geometry';
const shader=`struct Camera { matrix: mat4x4f }; @group(0) @binding(0) var<uniform> camera: Camera;
struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec4f };
@vertex fn vertex(@location(0) p:vec3f,@location(1) color:vec4f)->Vertex { var v:Vertex; v.position=camera.matrix*vec4f(p,1);v.color=color;return v; }
@fragment fn fragment(v:Vertex)->@location(0) vec4f{return v.color;}`;
/** Small shared engine. Render on change, dispose on unmount. No animation loop or mathematical claims. */
export class WebGPUEngine {
  static readonly version='0.1.0';
  private buffers:{buffer:GPUBuffer;count:number;topology:Geometry['topology']}[]=[];
  private depth?:GPUTexture; private closed=false;
  private camera:Camera=DEFAULT_CAMERA;
  private uniform:GPUBuffer;
  private pipelines:Record<Geometry['topology'],GPURenderPipeline>;
  private bindings:Record<Geometry['topology'],GPUBindGroup>;
  static async create(canvas:HTMLCanvasElement,onError:(message:string)=>void):Promise<WebGPUEngine>{
    if(!navigator.gpu)throw Error('WebGPU unavailable. Keep the text/table explanation visible.');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter available.');
    const device=await adapter.requestDevice();
    const context=canvas.getContext('webgpu');if(!context){device.destroy();throw Error('No WebGPU canvas context.');}
    const engine=new WebGPUEngine(canvas,device,context);
    device.lost.then(info=>{if(!engine.closed){engine.dispose();onError(`WebGPU device lost: ${info.message}. Recreate the view to retry.`);}});
    device.addEventListener('uncapturederror',e=>onError(e.error.message));
    return engine;
  }
  private constructor(private canvas:HTMLCanvasElement,private device:GPUDevice,private context:GPUCanvasContext){
    const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format,alphaMode:'opaque'});
    const module=device.createShaderModule({code:shader});
    this.uniform=device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const pipeline=(topology:Geometry['topology'])=>device.createRenderPipeline({layout:'auto',vertex:{module,entryPoint:'vertex',buffers:[{arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x4'}]}]},fragment:{module,entryPoint:'fragment',targets:[{format}]},primitive:{topology,cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'}});
    this.pipelines={'line-list':pipeline('line-list'),'triangle-list':pipeline('triangle-list')};
    const bind=(p:GPURenderPipeline)=>device.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
    this.bindings={'line-list':bind(this.pipelines['line-list']),'triangle-list':bind(this.pipelines['triangle-list'])};
  }
  setScene(geometries:Geometry[]){
    if(this.closed)throw Error('Engine disposed');
    if(geometries.reduce((n,g)=>n+g.positions.length/3,0)>MAX_VERTICES)throw Error('Scene exceeds vertex budget');
    for(const g of geometries)if(g.positions.length%3||!g.positions.every(Number.isFinite)||g.color.length!==4||!g.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!['line-list','triangle-list'].includes(g.topology)||g.positions.length/3%(g.topology==='line-list'?2:3))throw Error('Invalid geometry');
    this.buffers.forEach(g=>g.buffer.destroy());this.buffers=[];
    for(const g of geometries){const count=g.positions.length/3;if(!count)continue;const packed=new Float32Array(count*7);for(let i=0;i<count;i++){packed.set(g.positions.subarray(i*3,i*3+3),i*7);packed.set(g.color,i*7+3);}
      const buffer=this.device.createBuffer({size:packed.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});this.device.queue.writeBuffer(buffer,0,packed);this.buffers.push({buffer,count,topology:g.topology});}
    this.render();
  }
  setCamera(camera:Camera){cameraMatrix(camera,1);this.camera={...camera,center:[...camera.center]};this.render();}
  render(){
    if(this.closed)return;
    const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),max=this.device.limits.maxTextureDimension2D;
    const width=Math.min(max,Math.max(1,Math.round(rect.width*dpr))),height=Math.min(max,Math.max(1,Math.round(rect.height*dpr)));
    if(!this.depth||this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;this.depth?.destroy();this.depth=this.device.createTexture({size:[width,height],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});}
    this.device.queue.writeBuffer(this.uniform,0,cameraMatrix(this.camera,width/height).buffer as ArrayBuffer);
    const encoder=this.device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:[0.035,0.05,0.075,1],loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
    for(const g of this.buffers){pass.setPipeline(this.pipelines[g.topology]);pass.setBindGroup(0,this.bindings[g.topology]);pass.setVertexBuffer(0,g.buffer);pass.draw(g.count);}
    pass.end();this.device.queue.submit([encoder.finish()]);
  }
  dispose(){if(this.closed)return;this.closed=true;this.buffers.forEach(g=>g.buffer.destroy());this.uniform.destroy();this.depth?.destroy();this.context.unconfigure();this.device.destroy();}
}
