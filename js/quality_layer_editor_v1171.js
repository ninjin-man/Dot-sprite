(function(){
'use strict';
const V='v1.17.1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function clone(src){const c=canvas(src.width,src.height);c.getContext('2d').drawImage(src,0,0);return c;}
function imageData(c){return c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height);}
function fromData(im){const c=canvas(im.width,im.height);c.getContext('2d').putImageData(im,0,0);return c;}
function premulResize(src,w,h){
 const s=imageData(src), sw=s.width,sh=s.height, p=canvas(sw,sh),pi=p.getContext('2d').createImageData(sw,sh);
 for(let i=0;i<s.data.length;i+=4){const a=s.data[i+3]/255;pi.data[i]=s.data[i]*a;pi.data[i+1]=s.data[i+1]*a;pi.data[i+2]=s.data[i+2]*a;pi.data[i+3]=s.data[i+3];}
 p.getContext('2d').putImageData(pi,0,0);
 const r=canvas(w,h),ctx=r.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(p,0,0,w,h);
 const o=imageData(r);for(let i=0;i<o.data.length;i+=4){const a=o.data[i+3]/255;if(a>0.004){o.data[i]=clamp(Math.round(o.data[i]/a),0,255);o.data[i+1]=clamp(Math.round(o.data[i+1]/a),0,255);o.data[i+2]=clamp(Math.round(o.data[i+2]/a),0,255);}else{o.data[i]=o.data[i+1]=o.data[i+2]=0;}}
 r.getContext('2d').putImageData(o,0,0);return r;
}
function alphaBounds(im){const d=im.data,w=im.width,h=im.height;let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(d[(y*w+x)*4+3]>12){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}return x1<0?{x:0,y:0,w,h}:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};}
function edgeMask(src){const im=imageData(src),d=im.data,w=im.width,h=im.height,m=new Uint8Array(w*h);const lum=new Float32Array(w*h);for(let p=0;p<w*h;p++){const i=p*4;lum[p]=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)*(d[i+3]/255);}for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(d[p*4+3]<20)continue;const gx=-lum[p-w-1]-2*lum[p-1]-lum[p+w-1]+lum[p-w+1]+2*lum[p+1]+lum[p+w+1];const gy=-lum[p-w-1]-2*lum[p-w]-lum[p-w+1]+lum[p+w-1]+2*lum[p+w]+lum[p+w+1];m[p]=Math.min(255,Math.hypot(gx,gy));}return m;}
function edgeSharpen(src,amount=.55){const im=imageData(src),d=im.data,w=im.width,h=im.height,e=edgeMask(src),orig=new Uint8ClampedArray(d);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x,i=p*4;if(d[i+3]<20||e[p]<26)continue;for(let c=0;c<3;c++){let sum=0;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)sum+=orig[((y+oy)*w+x+ox)*4+c];const blur=sum/9;d[i+c]=clamp(Math.round(orig[i+c]+(orig[i+c]-blur)*amount*(e[p]/255)),0,255);}}return fromData(im);}
function buildMasks(src){const im=imageData(src),d=im.data,w=im.width,h=im.height,e=edgeMask(src),structure=new Uint8Array(w*h),detail=new Uint8Array(w*h),soft=new Uint8Array(w*h);for(let p=0;p<w*h;p++){const a=d[p*4+3];if(a<10)continue;if(a<205){soft[p]=255;continue;}if(e[p]>48){detail[p]=255;}else structure[p]=255;}return {structure,detail,soft,w,h};}
function maskCanvas(mask,w,h){const c=canvas(w,h),im=c.getContext('2d').createImageData(w,h);for(let p=0;p<mask.length;p++)if(mask[p])im.data[p*4+3]=mask[p];c.getContext('2d').putImageData(im,0,0);return c;}
function masked(src,mask){const im=imageData(src);for(let p=0;p<mask.length;p++)if(!mask[p])im.data[p*4+3]=0;return fromData(im);}
function composite(layers,w,h){const c=canvas(w,h),ctx=c.getContext('2d');for(const l of layers)ctx.drawImage(l,0,0);return c;}
function preserveDetailWidth(detail128){const im=imageData(detail128),d=im.data,w=im.width,h=im.height,orig=new Uint8ClampedArray(d);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=(y*w+x)*4;if(orig[i+3]>80)continue;let best=-1,bi=-1;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const j=((y+oy)*w+x+ox)*4;if(orig[j+3]>best){best=orig[j+3];bi=j;}}if(best>170){d[i]=orig[bi];d[i+1]=orig[bi+1];d[i+2]=orig[bi+2];d[i+3]=Math.min(120,best);}}return fromData(im);}
function buildFaithful128(source512,opt={}){
 const masks=buildMasks(source512);
 const structure=masked(source512,masks.structure), detail=masked(source512,masks.detail), soft=masked(source512,masks.soft);
 let s=premulResize(structure,128,128), d=premulResize(detail,128,128), f=premulResize(soft,128,128);
 s=edgeSharpen(s,opt.structureSharp??.35);d=edgeSharpen(d,opt.detailSharp??.85);d=preserveDetailWidth(d);
 const out=composite([s,f,d],128,128);return {canvas:out,masks,structure128:s,detail128:d,soft128:f};
}
function makeZoneMask(src,b,kind){const im=imageData(src),d=im.data,w=im.width,h=im.height,m=new Uint8Array(w*h);const cx=b.x+b.w/2;for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++){const p=y*w+x;if(d[p*4+3]<12)continue;const yn=(y-b.y)/b.h, xn=(x-cx)/(b.w/2);let ok=false;
 if(kind==='head')ok=yn<.23;
 else if(kind==='torso')ok=yn>=.18&&yn<.56&&Math.abs(xn)<.58;
 else if(kind==='leftArm')ok=yn>=.20&&yn<.66&&xn<-.28;
 else if(kind==='rightArm')ok=yn>=.20&&yn<.66&&xn>.28;
 else if(kind==='leftLeg')ok=yn>=.50&&xn<.10;
 else if(kind==='rightLeg')ok=yn>=.50&&xn>=-.10;
 else if(kind==='hair')ok=yn<.50&&(Math.abs(xn)>.34||yn<.18);
 if(ok)m[p]=255;
 }return m;}
class LayerEditor{
 constructor(){this.source=null;this.layers=[];this.selected=0;this.mode='add';this.brush=16;this.preview=null;}
 setSource(src){this.source=clone(src);const b=alphaBounds(imageData(src));const defs=[['head','頭・顔'],['hair','髪'],['torso','胴体'],['leftArm','左腕・袖'],['rightArm','右腕・袖'],['leftLeg','左脚'],['rightLeg','右脚']];this.layers=defs.map(([key,name])=>({key,name,mask:makeZoneMask(src,b,key),visible:true,dx:0,dy:0,sx:1,sy:1,rot:0}));this.selected=0;this.render();}
 get selectedLayer(){return this.layers[this.selected];}
 paint(x,y,add=true){const l=this.selectedLayer;if(!l)return;const w=this.source.width,h=this.source.height,r=this.brush/2;for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(h,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<Math.min(w,Math.ceil(x+r));xx++){if((xx-x)**2+(yy-y)**2<=r*r)l.mask[yy*w+xx]=add?255:0;}this.render();}
 render(){if(!this.source)return null;const out=canvas(this.source.width,this.source.height),ctx=out.getContext('2d');for(const l of this.layers){if(!l.visible)continue;const part=masked(this.source,l.mask);const bx=alphaBounds(imageData(part)),cx=bx.x+bx.w/2,cy=bx.y+bx.h/2;ctx.save();ctx.translate(cx+l.dx,cy+l.dy);ctx.rotate(l.rot*Math.PI/180);ctx.scale(l.sx,l.sy);ctx.drawImage(part,-cx,-cy);ctx.restore();}this.preview=out;return out;}
 renderMaskOverlay(){if(!this.source)return null;const c=clone(this.source),ctx=c.getContext('2d');ctx.globalAlpha=.48;const colors=['#ffcc00','#b366ff','#29d3ff','#31d07c','#ff5f7a','#5d8cff','#ff954d'];this.layers.forEach((l,idx)=>{const mc=maskCanvas(l.mask,this.source.width,this.source.height),t=canvas(mc.width,mc.height),tc=t.getContext('2d');tc.fillStyle=colors[idx%colors.length];tc.fillRect(0,0,t.width,t.height);tc.globalCompositeOperation='destination-in';tc.drawImage(mc,0,0);ctx.drawImage(t,0,0);});ctx.globalAlpha=1;return c;}
 resetTransforms(){this.layers.forEach(l=>Object.assign(l,{dx:0,dy:0,sx:1,sy:1,rot:0}));this.render();}
 applyPreset(name){const map={faithful:{head:[1,1],hair:[1,1],torso:[1,1],leftArm:[1,1],rightArm:[1,1],leftLeg:[1,1],rightLeg:[1,1]},five:{head:[1.12,1.10],hair:[1.10,1.08],torso:[1,.94],leftArm:[1,.92],rightArm:[1,.92],leftLeg:[1.03,.88],rightLeg:[1.03,.88]},four:{head:[1.24,1.20],hair:[1.18,1.16],torso:[1.04,.86],leftArm:[1.06,.82],rightArm:[1.06,.82],leftLeg:[1.10,.72],rightLeg:[1.10,.72]}}[name]||{};for(const l of this.layers){const v=map[l.key];if(v){l.sx=v[0];l.sy=v[1];}}
 // Pull parts toward body center to maintain overlaps.
 const b=alphaBounds(imageData(this.source));const cy=b.y+b.h*.52;for(const l of this.layers){if(l.key==='head'||l.key==='hair')l.dy=name==='four'?34:(name==='five'?18:0);if(l.key.includes('Leg'))l.dy=name==='four'?-26:(name==='five'?-12:0);if(l.key==='torso')l.dy=name==='four'?12:(name==='five'?6:0);}this.render();}
}
window.SpriteQualityLayer={VERSION:V,buildFaithful128,buildMasks,premulResize,edgeSharpen,LayerEditor,clone};
})();
