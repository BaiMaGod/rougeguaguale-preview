/** Metallic scratch coating for the LayaAir 3.4 board.
 * A persistent Canvas2D mask is used per symbol and a pooled overlay emits
 * short-lived silver flakes. Partial strokes survive ordinary UI redraws.
 */
export interface ScratchCellOptions {
  index: number; x: number; y: number; size: number; onFinished: (index: number) => void;
  canStart?: () => boolean; onStarted?: (index:number) => void; shape?: 'heart';
}
interface Point { x:number; y:number; }
interface Dust {
  x:number; y:number; vx:number; vy:number;
  age:number; life:number; size:number; angle:number; spin:number; color:string;
}
const DESIGN_W=750, DESIGN_H=1334;
const FOIL_RATIO=1.5;
const BRUSH=30;
const FINISH_PERCENT=.52;
const PARTICLE_LIMIT=200;
const SILVERS=['#ecf1fa','#d6e1ee','#b3c1d2','#8493aa','#f8fbff','#99a8bf'];
function coating(size:number):HTMLCanvasElement {
  const pixels=Math.round(size*FOIL_RATIO);
  const cv=document.createElement('canvas');cv.width=pixels;cv.height=pixels;
  const ctx=cv.getContext('2d');if(!ctx)throw new Error('Canvas2D coating unavailable');
  const data=ctx.createImageData(pixels,pixels);
  let rand=0x935f1b7;
  const random=():number=>{rand=(Math.imul(rand,1664525)+1013904223)>>>0;return rand/4294967296;};
  for(let y=0;y<pixels;y++){
    for(let x=0;x<pixels;x++){
      const n=random()-.5;
      // Brushed aluminum: broad diagonal illumination, fine unaligned grain,
      // irregular pale and dark specks, and faint horizontal machine strokes.
      const beam=16*Math.cos((x+y*.44-pixels*.7)*.024);
      const brushing=5*Math.sin(y*.73+x*.035)+3*Math.sin(y*1.8);
      const fleck=random();
      const l=Math.max(83,Math.min(245,175+beam+brushing+n*35+(fleck>.983?29:0)-(fleck<.018?24:0)));
      const i=(y*pixels+x)*4;
      data.data[i]=Math.floor(l-3);
      data.data[i+1]=Math.floor(l+2);
      data.data[i+2]=Math.floor(Math.min(255,l+12));
      data.data[i+3]=255;
    }
  }
  ctx.putImageData(data,0,0);
  ctx.save();ctx.scale(FOIL_RATIO,FOIL_RATIO);
  const sheen=ctx.createLinearGradient(0,size*.72,size,size*.1);
  sheen.addColorStop(0,'rgba(255,255,255,0)');
  sheen.addColorStop(.38,'rgba(255,255,255,.03)');
  sheen.addColorStop(.51,'rgba(255,255,255,.3)');
  sheen.addColorStop(.60,'rgba(255,255,255,.025)');
  sheen.addColorStop(1,'rgba(37,53,75,.20)');
  ctx.fillStyle=sheen;ctx.fillRect(0,0,size,size);
  ctx.lineWidth=.5;
  for(let k=4;k<size;k+=9){
    ctx.strokeStyle=k%3?'rgba(255,255,255,.095)':'rgba(31,46,67,.065)';
    ctx.beginPath();ctx.moveTo(0,k+.5);ctx.lineTo(size,k+.5);ctx.stroke();
  }
  ctx.restore();
  return cv;
}
class ScratchSound {
  private ctx:AudioContext|null=null;
  private buffer:AudioBuffer|null=null;
  private current:{source:AudioBufferSourceNode;gain:GainNode}|null=null;
  start():void{
    try{
      this.stop();
      this.ctx??=new AudioContext();
      if(this.ctx.state==='suspended')void this.ctx.resume().catch(()=>{});
      if(!this.buffer){
        const len=Math.floor(this.ctx.sampleRate*.22);
        this.buffer=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
        const samples=this.buffer.getChannelData(0);
        for(let i=0;i<len;i++)samples[i]=(Math.random()*2-1)*.8;
      }
      const source=this.ctx.createBufferSource();source.buffer=this.buffer;source.loop=true;
      const filter=this.ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=1650;filter.Q.value=.75;
      const gain=this.ctx.createGain();gain.gain.value=.001;
      source.connect(filter);filter.connect(gain);gain.connect(this.ctx.destination);
      source.start();this.current={source,gain};
    }catch{/* unavailable audio must not block scratching */}
  }
  move(distance:number):void{
    if(!this.ctx||!this.current)return;
    const now=this.ctx.currentTime;
    this.current.gain.gain.setTargetAtTime(Math.min(.040,.010+distance*.00065),now,.035);
  }
  stop():void{
    if(!this.current||!this.ctx)return;
    const {source,gain}=this.current;this.current=null;
    const t=this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(.0001,t,.022);
    try{source.stop(t+.13);}catch{/* already stopped */}
  }
}
export class ScratchLayer {
  private holder:HTMLElement;
  private cells=new Map<number,HTMLCanvasElement>();
  private seen=new Set<number>();
  private completed=new Set<number>();
  private epoch=0;
  private foilTextures=new Map<number,HTMLCanvasElement>();
  private dust:Dust[]=[];
  private fx:HTMLCanvasElement;
  private fxContext:CanvasRenderingContext2D;
  private raf=0;
  private audio=new ScratchSound();
  private emissions=0;
  constructor(holder:HTMLElement){
    this.holder=holder;
    this.fx=document.createElement('canvas');
    this.fx.width=DESIGN_W;this.fx.height=DESIGN_H;
    this.fx.id='foil-particles';
    this.fx.style.cssText='position:absolute;inset:0;width:750px;height:1334px;z-index:99;pointer-events:none;';
    this.fx.dataset.emissions='0';
    const ctx=this.fx.getContext('2d');
    if(!ctx)throw new Error('Cannot create particle canvas');
    this.fxContext=ctx;
    this.holder.appendChild(this.fx);
  }
  /** Keep unfinished cells and their erased pixels across score/UI redraws. */
  beginFrame():void{this.seen.clear();}
  endFrame():void{
    for(const [index,cv] of this.cells){
      if(!this.seen.has(index)){cv.remove();this.cells.delete(index);}
    }
  }
  /** New ticket only; reset foil coverage and cancel stale reveal callbacks. */
  clear():void{
    this.epoch++;this.audio.stop();this.seen.clear();this.completed.clear();
    for(const canvas of this.cells.values())canvas.remove();
    this.cells.clear();this.dust=[];
    this.fxContext.clearRect(0,0,DESIGN_W,DESIGN_H);
    if(this.raf){cancelAnimationFrame(this.raf);this.raf=0;}
    this.emissions=0;this.fx.dataset.emissions='0';
  }
  add({index,x,y,size,onFinished,canStart,onStarted,shape}:ScratchCellOptions):void{
    this.seen.add(index);
    if(this.cells.has(index))return;
    if(!this.foilTextures.has(size))this.foilTextures.set(size,coating(size));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(size*FOIL_RATIO);canvas.height=Math.round(size*FOIL_RATIO);
    canvas.dataset.index=String(index);
    canvas.dataset.material='silver-grain-v2';
    canvas.dataset.coverage='0';
    canvas.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px;touch-action:none;border-radius:15px;cursor:crosshair;overflow:hidden;';
    if(shape==='heart')canvas.style.clipPath='polygon(50% 94%,8% 53%,2% 32%,9% 15%,25% 7%,40% 12%,50% 24%,60% 12%,75% 7%,91% 15%,98% 32%,92% 53%)';
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('Cannot create foil canvas');
    ctx.drawImage(this.foilTextures.get(size)!,0,0,canvas.width,canvas.height);
    ctx.scale(FOIL_RATIO,FOIL_RATIO);
    // Subtle embossed print replaces flat opaque gradient and giant fake text.
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 13px sans-serif';ctx.fillStyle='rgba(58,75,99,.53)';
    ctx.fillText('✦  SCRATCH  ✦',size/2,size/2+1);
    ctx.fillStyle='rgba(255,255,255,.44)';
    ctx.fillText('✦  SCRATCH  ✦',size/2,size/2-1);
    let down=false,prior:Point|null=null,lastSample=0;
    const epoch=this.epoch;
    const where=(event:PointerEvent):Point=>{
      const r=canvas.getBoundingClientRect();
      return {x:(event.clientX-r.left)*size/r.width,y:(event.clientY-r.top)*size/r.height};
    };
    const erase=(a:Point,b:Point):void=>{
      const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy);
      if(dist<.01)return;
      ctx.save();ctx.globalCompositeOperation='destination-out';
      ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=BRUSH;
      ctx.strokeStyle='#000';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      const steps=Math.min(30,Math.ceil(dist/7));
      const nx=-dy/dist,ny=dx/dist;
      for(let i=0;i<=steps;i++){
        const t=i/Math.max(1,steps);
        const cx=a.x+dx*t,cy=a.y+dy*t;
        if(i%2===0){
          // Scalloped, uneven edge instead of one perfectly straight soft line.
          const side=i%4===0?1:-1;
          const offset=(BRUSH*.44)+(Math.random()*5);
          ctx.beginPath();
          ctx.arc(cx+nx*offset*side,cy+ny*offset*side,1.2+Math.random()*2.6,0,Math.PI*2);
          ctx.fill();
        }
      }
      ctx.restore();
      const emitSteps=Math.min(12,Math.max(1,Math.floor(dist/6)));
      for(let i=0;i<emitSteps;i++){
        const t=(i+.5)/emitSteps;
        const bx=a.x+dx*t,by=a.y+dy*t;
        this.emit(x+bx,y+by,dx/dist,dy/dist,2+(i%2));
      }
      this.audio.move(dist);
      const now=performance.now();
      if(now-lastSample>95){lastSample=now;measure();}
    };
    const measure=():number=>{
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let exposed=0,total=0;
      for(let py=4;py<canvas.height-3;py+=6){
        for(let px=4;px<canvas.width-3;px+=6){
          total++;if(data[(py*canvas.width+px)*4+3]<72)exposed++;
        }
      }
      const value=total?exposed/total:0;
      canvas.dataset.coverage=value.toFixed(3);
      return value;
    };
    const finish=():void=>{
      if(!down)return;
      down=false;prior=null;this.audio.stop();
      if(measure()<FINISH_PERCENT)return;
      if(this.completed.has(index))return;
      this.completed.add(index);
      canvas.style.pointerEvents='none';
      canvas.style.transition='opacity 170ms ease-out,filter 170ms ease-out,transform 170ms ease-out';
      canvas.style.opacity='0';
      canvas.style.filter='brightness(1.35)';
      canvas.style.transform='scale(1.03)';
      this.emit(x+size/2,y+size/2,0,-1,23);
      // Wait for the foil to fade before allowing the game's existing reveal logic.
      window.setTimeout(()=>{
        if(this.epoch!==epoch)return;
        this.cells.delete(index);canvas.remove();
        onFinished(index);
      },175);
    };
    canvas.addEventListener('pointerdown',e=>{
      if(this.completed.has(index)||canStart&&!canStart())return;
      onStarted?.(index);
      e.preventDefault();down=true;prior=where(e);canvas.setPointerCapture(e.pointerId);
      this.audio.start();
      // Initial pressure mark should be visible, but clicking alone reveals little.
      ctx.save();ctx.globalCompositeOperation='destination-out';
      ctx.beginPath();ctx.arc(prior.x,prior.y,BRUSH*.38,0,Math.PI*2);ctx.fill();ctx.restore();
      this.emit(x+prior.x,y+prior.y,0,-1,3);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!down||!prior)return;
      e.preventDefault();const p=where(e);
      erase(prior,p);prior=p;
    });
    canvas.addEventListener('pointerup',finish);
    canvas.addEventListener('pointercancel',()=>{down=false;prior=null;this.audio.stop();});
    canvas.addEventListener('lostpointercapture',finish);
    this.holder.appendChild(canvas);
    this.cells.set(index,canvas);
  }
  reveal(index:number):void{
    const cell=this.cells.get(index);
    if(cell)cell.style.opacity='.45';
  }
  setEnabled(enabled:boolean):void{
    for(const [index,el] of this.cells)
      el.style.pointerEvents=enabled&&!this.completed.has(index)?'auto':'none';
  }
  setCellEnabled(index:number,enabled:boolean):void{
    const el=this.cells.get(index);if(el)el.style.pointerEvents=enabled&&!this.completed.has(index)?'auto':'none';
  }
  private emit(x:number,y:number,dx:number,dy:number,count:number):void{
    const nx=-dy,ny=dx;
    for(let i=0;i<count;i++){
      if(this.dust.length>=PARTICLE_LIMIT)this.dust.shift();
      const side=(Math.random()-.5)*2;
      const speed=1.4+Math.random()*4.2;
      this.dust.push({
        x:x+(Math.random()-.5)*9,y:y+(Math.random()-.5)*9,
        vx:dx*(.35+Math.random()*1.5)+nx*side*speed,
        vy:dy*(.35+Math.random())+ny*side*speed-1.5,
        age:0,life:14+Math.floor(Math.random()*16),
        size:.8+Math.random()*3.2,angle:Math.random()*6.283,
        spin:(Math.random()-.5)*.33,
        color:SILVERS[Math.floor(Math.random()*SILVERS.length)]
      });
      this.emissions++;
    }
    this.fx.dataset.emissions=String(this.emissions);
    if(!this.raf)this.raf=requestAnimationFrame(()=>this.tick());
  }
  private tick():void{
    this.raf=0;
    const ctx=this.fxContext;
    ctx.clearRect(0,0,DESIGN_W,DESIGN_H);
    this.dust=this.dust.filter(p=>{
      p.age++;if(p.age>=p.life)return false;
      p.x+=p.vx;p.y+=p.vy;p.vy+=.19;p.vx*=.975;
      const a=(1-p.age/p.life)*.85;
      ctx.save();ctx.globalAlpha=a;ctx.translate(p.x,p.y);ctx.rotate(p.angle+=p.spin);
      ctx.fillStyle=p.color;
      ctx.beginPath();
      if(p.size>2.5){
        ctx.moveTo(-p.size,0);ctx.lineTo(p.size*.9,-p.size*.45);
        ctx.lineTo(p.size*.5,p.size*.6);ctx.closePath();
      }else{
        ctx.rect(-p.size/2,-p.size/2,p.size,p.size*.62);
      }
      ctx.fill();ctx.restore();
      return true;
    });
    if(this.dust.length)this.raf=requestAnimationFrame(()=>this.tick());
  }
}

