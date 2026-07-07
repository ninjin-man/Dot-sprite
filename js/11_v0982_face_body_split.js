// ===== v0.9.8.2 patch: face/chest skin split + safer default preview =====
(function(){
'use strict';
const VERSION_0982='0.9.8.2';
const PREPROCESSOR_VERSION_0982='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function labelName(label){ return (LABELS&&LABELS[label]) || label; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function ensureLabels0982(){
  try{
    Object.assign(LABELS,{ chest_skin:'胸元肌', full_foreground:'全体前景' });
    Object.assign(COLORS,{ chest_skin:[245,178,170], full_foreground:[180,220,255] });
    if(state && (!state.selectedPart || state.selectedPart==='soft_shell')) state.selectedPart='full_foreground';
    if(typeof makePartButtons==='function') makePartButtons();
  }catch(e){}
}
ensureLabels0982();
function bboxFromPixels(pixels,w){
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(const p of pixels){ const x=p%w,y=(p/w)|0; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; }
  if(maxx<0) return null;
  const bw=maxx-minx+1,bh=maxy-miny+1;
  let sx=0,sy=0; for(const p of pixels){ sx+=p%w; sy+=(p/w)|0; }
  return {minx,miny,maxx,maxy,w:bw,h:bh,area:pixels.length,cx:sx/pixels.length,cy:sy/pixels.length};
}
function meanRGBFromPixels(pixels,img){
  const d=img.data; let r=0,g=0,b=0,a=0,n=0;
  for(const p of pixels){ const i=p*4; r+=d[i]; g+=d[i+1]; b+=d[i+2]; a+=d[i+3]; n++; }
  if(!n) return {rgb:[0,0,0], alpha:0};
  return {rgb:[Math.round(r/n),Math.round(g/n),Math.round(b/n)], alpha:a/n};
}
function makeRegion0982(base,pixels,label,res,reason){
  const w=res.imgData.width, h=res.imgData.height;
  const bb=bboxFromPixels(pixels,w); if(!bb) return null;
  const mc=meanRGBFromPixels(pixels,res.imgData);
  let hsv=[0,0,0], lab=[0,0,0]; try{ hsv=rgb2hsv(mc.rgb[0],mc.rgb[1],mc.rgb[2]); }catch(e){} try{ lab=rgb2lab(mc.rgb[0],mc.rgb[1],mc.rgb[2]); }catch(e){}
  const r={...base,...bb,pixels:[...pixels],label,mean:mc.rgb,mean_color:mc.rgb,meanAlpha:mc.alpha,mean_alpha:mc.alpha,alpha_mean:mc.alpha};
  r.id=r.mid=base.mid||base.id;
  if(label==='chest_skin') r.mid=r.id=(base.mid||base.id)*100+82;
  r.visualZone=(typeof visualZoneOf==='function' && res.lines)?visualZoneOf(r,res.lines):(base.visualZone||base.visual_zone||'torso');
  r.visual_zone=r.visualZone;
  r.originZone=(typeof originZoneOf==='function' && res.lines)?originZoneOf(r,res.lines):(base.originZone||base.origin_zone||'torso');
  r.origin_zone=r.originZone;
  r.touches={...(base.touches||{})};
  if(res.lines){
    r.touches.head=r.miny<=res.lines.head && r.maxy>=res.lines.top;
    r.touches.shoulder=r.miny<=res.lines.shoulder+8 && r.maxy>=res.lines.shoulder-8;
    r.touches.torso=r.maxy>=res.lines.shoulder-6 && r.miny<=res.lines.waist+10;
    r.touches.waist=r.miny<=res.lines.waist+8&&r.maxy>=res.lines.waist-8;
    r.touches.ankle=r.miny<=res.lines.ankle+8&&r.maxy>=res.lines.ankle-8;
  }
  r.features={...(base.features||{}),mean_rgb:mc.rgb,mean_hsv:[+hsv[0].toFixed?.(2)||hsv[0],+hsv[1].toFixed?.(3)||hsv[1],+hsv[2].toFixed?.(3)||hsv[2]],mean_lab:[+lab[0].toFixed?.(2)||lab[0],+lab[1].toFixed?.(2)||lab[1],+lab[2].toFixed?.(2)||lab[2]],relative_bbox:[+(bb.minx/w).toFixed(4),+(bb.miny/h).toFixed(4),+(bb.w/w).toFixed(4),+(bb.h/h).toFixed(4)],relative_center:[+(bb.cx/w).toFixed(4),+(bb.cy/h).toFixed(4)],area_ratio:+(pixels.length/Math.max(1,w*h)).toFixed(6),visual_zone:r.visual_zone,origin_zone:r.origin_zone,touches:r.touches};
  r.confidence=r.conf=r.finalConfidence=label==='face'?78:74;
  r.base_confidence=r.baseConfidence=r.conf;
  r.needsReview=false;
  r.reason=(base.reason||'')+' / v0.9.8.2 '+reason;
  r.previous_label=base.previous_label||null;
  r.reject_reason=base.reject_reason||[];
  r.faceBodySplit0982={from:base.label,to:label,split:true,reason};
  return r;
}
function findFaceSplitY0982(res){
  const lines=res.lines||{};
  const e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse||null;
  let candidates=[];
  if(Number.isFinite(lines.faceBot)) candidates.push(lines.faceBot+6);
  if(Number.isFinite(lines.shoulder)) candidates.push(lines.shoulder-8);
  if(e) candidates.push(e.cy+e.ry*0.34);
  if(!candidates.length) return null;
  let y=Math.round(candidates.reduce((a,b)=>a+b,0)/candidates.length);
  if(Number.isFinite(lines.faceTop)&&Number.isFinite(lines.shoulder)) y=clamp(y,lines.faceTop+28,lines.shoulder-2);
  return y;
}
function splitFaceBody0982(res){
  if(!res||!res.candidates||!res.imgData||!res.lines) return res;
  const splitY=findFaceSplitY0982(res); if(splitY==null) return res;
  const out=[]; let splitCount=0, movedArea=0;
  for(const r of res.candidates){
    if(r.label!=='face' || !Array.isArray(r.pixels) || r.pixels.length<80){ out.push(r); continue; }
    const spansLow = r.maxy > splitY + 8 || r.touches?.torso || r.touches?.shoulder;
    if(!spansLow){ out.push(r); continue; }
    const upper=[], lower=[];
    for(const p of r.pixels){ const y=(p/res.imgData.width)|0; if(y>splitY) lower.push(p); else upper.push(p); }
    if(lower.length<35 || upper.length<45){ out.push(r); continue; }
    const face=makeRegion0982(r,upper,'face',res,'face_upper_kept');
    const chest=makeRegion0982(r,lower,'chest_skin',res,'lower_skin_to_chest');
    if(face) out.push(face);
    if(chest) out.push(chest);
    splitCount++; movedArea+=lower.length;
  }
  res.candidates=out;
  res.faceBodySplit0982={enabled:true,split_y:splitY,split_count:splitCount,moved_area:movedArea};
  return res;
}
const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0982(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  try{
    splitFaceBody0982(state.result);
    if(state.selectedPart==='soft_shell') state.selectedPart='full_foreground';
    if(!state.selectedPart) state.selectedPart='full_foreground';
    renderAll();
  }catch(e){ console.warn('v0.9.8.2 face/body split failed',e); }
}
window.analyze0982=analyze0982;
try{
  analyze=analyze0982;
  const run=safeQS('run'); if(run) run.onclick=analyze0982;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0982;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze0982();};});
}catch(e){}
// Extend selected part rendering to support full foreground without changing old exporter.
if(typeof drawPart==='function'){
  const prevDrawPart=drawPart;
  drawPart=function(c,img,cands,label){
    if(label!=='full_foreground') return prevDrawPart(c,img,cands,label);
    if(!img||!c) return;
    const w=img.width,h=img.height,out=makeImageData(w,h,[0,0,0,0]),src=img.data;
    const skip=new Set(['bg_residue','background_residue']);
    const mask=new Uint8Array(w*h);
    for(const r of (cands||[])){ if(skip.has(r.label)) continue; for(const p of r.pixels||[]) mask[p]=1; }
    for(let p=0;p<w*h;p++) if(mask[p]){ const i=p*4; out.data[i]=src[i]; out.data[i+1]=src[i+1]; out.data[i+2]=src[i+2]; out.data[i+3]=src[i+3]; }
    drawImageData(c,out);
    const ctx=c.getContext('2d'); ctx.save(); ctx.fillStyle='rgba(15,21,32,0.82)'; ctx.fillRect(0,0,c.width,30); ctx.fillStyle='#b4dcff'; ctx.font='16px sans-serif'; ctx.fillText('全体前景 / full_foreground / soft_shell含む',8,21); ctx.restore();
  };
}
if(typeof makePartButtons==='function'){
  const prevMakePartButtons=makePartButtons;
  makePartButtons=function(){
    prevMakePartButtons();
    const div=safeQS('partButtons'); if(!div) return;
    if(!div.querySelector('[data-full-foreground]')){
      const b=document.createElement('button'); b.className='tag'; b.dataset.fullForeground='1'; b.textContent='全体前景'; b.style.border='1px solid rgb(180,220,255)';
      b.onclick=()=>{state.selectedPart='full_foreground'; if(typeof drawSelectedPart096==='function') drawSelectedPart096('full_foreground'); makePartButtons();};
      div.insertBefore(b, div.firstChild && div.firstChild.nextSibling ? div.firstChild.nextSibling : div.firstChild);
    }
  };
}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_0982;
    m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_0982;
    m.face_body_split_v0982=state.result?.faceBodySplit0982||{enabled:true,split_count:0};
    if(m.quality_v096) m.quality_v096.version=VERSION_0982;
    if(m.export_v096) { m.export_v096.full_foreground_preview=true; m.export_v096.face_body_split=true; }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){ const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id); if(live){ p.label=live.label; p.label_ja=labelName(live.label); p.face_body_split_v0982=live.faceBodySplit0982||null; p.needs_review=!!live.needsReview; }}
    }
    m.part_stats_v096 = typeof partStats096==='function' ? partStats096() : m.part_stats_v096;
    m.region=m.region||{}; m.region.review_after=(state.result?.candidates||[]).filter(r=>r.needsReview).length;
    return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log) return;
    const sp=state.result?.faceBodySplit0982||{};
    log.textContent += `\n[v0.9.8.2 face/body split]\nsplit=${sp.split_count||0} moved=${sp.moved_area||0} splitY=${sp.split_y||'-'}\n`;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.8.2';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.8.2';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.8.2: 顔/胸元肌の分離・全体前景Preview改善。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、手動補正しやすい候補Regionを作る。v0.9.8.2は顔に混ざった胸元肌を安全に分離する検証版です。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_8_2.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.8.2 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_8_2.png','image/png'));};
  const memBtn=safeQS('memoryJson'); if(memBtn && typeof loadMemory==='function') memBtn.onclick=()=>downloadBlob(JSON.stringify(loadMemory(),null,2),'correction_memory_v0_9_8_2.json','application/json');
}catch(e){ console.warn('v0.9.8.2 setup failed',e); }
})();
