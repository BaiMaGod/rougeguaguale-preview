/** Native Canvas 2D foil over the LayaAir/WebGL symbol board.
 * Each cell handles pointer capture, interpolated brush strokes and alpha sampling.
 */
export interface ScratchCellOptions {
  index:number;x:number;y:number;size:number;onFinished:(index:number)=>void;
}
export class ScratchLayer {
  private holder:HTMLElement;
  private cells=new Map<number,HTMLCanvasElement>();
  private locked=new Set<number>();
  constructor(holder:HTMLElement){this.holder=holder;}
  clear():void{this.holder.replaceChildren();this.cells.clear();this.locked.clear();}
  add({index,x,y,size,onFinished}:ScratchCellOptions):void{
    const canvas=document.createElement('canvas');
    const ratio=1.5;
    canvas.width=Math.round(size*ratio);canvas.height=Math.round(size*ratio);
    canvas.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px;touch-action:none;border-radius:17px;cursor:crosshair;';
    canvas.dataset.index=String(index);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx) throw new Error('浏览器无法创建 Canvas2D 刮擦层');
    ctx.scale(ratio,ratio);
    const silver=ctx.createLinearGradient(0,0,size,size);
    silver.addColorStop(0,'#5d7089');silver.addColorStop(.25,'#e7f4ff');
    silver.addColorStop(.49,'#9eaec2');silver.addColorStop(.75,'#f4f9ff');
    silver.addColorStop(1,'#657b95');
    ctx.fillStyle=silver;ctx.fillRect(0,0,size,size);
    ctx.fillStyle='rgba(255,255,255,.20)';
    for(let k=-size;k<size*2;k+=16){ctx.fillRect(k,0,1,size);}
    ctx.textAlign='center';ctx.font='bold 17px sans-serif';ctx.fillStyle='#45566d';
    ctx.fillText('✦ 刮 开 ✦',size/2,size/2+5);
    const brush=20;let down=false;let last:{x:number;y:number}|null=null;
    const pos=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*size/r.width,y:(e.clientY-r.top)*size/r.height};};
    const stroke=(a:{x:number;y:number},b:{x:number;y:number})=>{
      ctx.globalCompositeOperation='destination-out';
      ctx.strokeStyle='rgba(0,0,0,1)';ctx.lineWidth=brush;
      ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      ctx.beginPath();ctx.arc(b.x,b.y,brush/2,0,Math.PI*2);ctx.fill();
      ctx.globalCompositeOperation='source-over';
    };
    const finish=()=>{
      if(!down)return;down=false;last=null;
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let transparent=0,sampled=0;
      for(let y=0;y<canvas.height;y+=6) for(let x=0;x<canvas.width;x+=6){
        sampled++;if(data[(y*canvas.width+x)*4+3]<72) transparent++;
      }
      if(transparent/sampled>=.52){
        this.locked.add(index);
        canvas.remove();
        this.cells.delete(index);
        onFinished(index);
      }
    };
    canvas.addEventListener('pointerdown',e=>{
      if(this.locked.has(index))return;
      e.preventDefault();down=true;last=pos(e);canvas.setPointerCapture(e.pointerId);
      stroke(last,last);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!down||!last)return;
      e.preventDefault();const next=pos(e);stroke(last,next);last=next;
    });
    canvas.addEventListener('pointerup',finish);
    canvas.addEventListener('pointercancel',finish);
    canvas.addEventListener('lostpointercapture',finish);
    this.holder.appendChild(canvas);this.cells.set(index,canvas);
  }
  reveal(index:number):void{const cell=this.cells.get(index);if(cell)cell.style.opacity='.32';}
  remove(index:number):void{this.locked.add(index);this.cells.get(index)?.remove();this.cells.delete(index);}
  setEnabled(enabled:boolean):void{
    for(const el of this.cells.values())el.style.pointerEvents=enabled?'auto':'none';
  }
}
