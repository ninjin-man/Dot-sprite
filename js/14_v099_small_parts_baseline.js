// ===== v0.9.9 patch: baseline face control + eye/ear/hand/ornament candidates =====
(function(){
'use strict';
const VERSION_099='0.9.9';
const PREPROCESSOR_VERSION_099='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function lum(r,g,b){ return 0.299*r+0.587*g+0.114*b; }
function hsv(r,g,b){ try{return rgb2hsv(r,g,b);}catch(e){return [0,0,0];} }
function getBox(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0}; }
function skinPixel(d,i){ const R=d[i],G=d[i+1],B=d[i+2],h=hsv(R,G,B); return R>95&&G>62&&B>52&&R>=G-8&&G>=B-35&&Math.max(R,G,B)-Math.min(R,G,B)<115&&((h[0]<=60||h[0]>=330||h[1]<.20)&&h[2]>.30&&h[2]<.96); }
function goldPixel(d,i){ const R=d[i],G=d[i+1],B=d[i+2],h=hsv(R,G,B); return (R>80&&G>55&&B<95&&R>=G-8&&G>=B-18&&(h[0]<=65||h[0]>=340)&&h[1]>.16); }
function darkEyePixel(d,i){ const R=d[i],G=d[i+1],B=d[i+2]; return lum(R,G,B)<115 && Math.max(R,G,B)-Math.min(R,G,B)>8; }
function lavenderPixel(d,i){ const R=d[i],G=d[i+1],B=d[i+2],h=hsv(R,G,B); return (h[0]>=210&&h[0]<=330&&h[1]<.35&&h[2]>.22) || (B>=G-12&&R>=G-20&&R<220); }
function bboxOfPixels(pixels,w){ if(!pixels.length)return null; let minx=1e9,miny=1e9,maxx=-1,maxy=-1,sx=0,sy=0; for(const p of pixels){const x=p%w,y=(p/w)|0; minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x); maxy=Math.max(maxy,y); sx+=x; sy+=y;} return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1,cx:sx/pixels.length,cy:sy/pixels.length,area:pixels.length}; }
function makeRegion(label,pixels,res,reason,conf=62){
  const img=res.imgData,w=img.width,d=img.data,b=bboxOfPixels(pixels,w); if(!b||b.area<3) return null; let sum=[0,0,0],alpha=0; for(const p of pixels){const i=p*4; sum[0]+=d[i]; sum[1]+=d[i+1]; sum[2]+=d[i+2]; alpha+=d[i+3];}
  const mean=sum.map(v=>Math.round(v/pixels.length)), h=hsv(mean[0],mean[1],mean[2]);
  return {...b,pixels:[...pixels],id:900000+Math.floor(Math.random()*99999),mid:900000+Math.floor(Math.random()*99999),cluster:-9,mean,hue:h[0],sat:h[1],val:h[2],alphaMean:alpha/pixels.length,label,conf,confidence:conf,finalConfidence:conf,needsReview:true,reason:'v0.9.9 '+reason,originZone:'detail',visualZone:'detail',smallPartCandidate099:true,touches:{},adjacentParts:[]};
}
function compsFromMask(mask,w,h,minArea=3,maxArea=500){
  if(typeof connected!=='function') return [];
  return connected(mask,w,h).filter(c=>c.area>=minArea&&c.area<=maxArea);
}
function addLabelDefs(){ try{ Object.assign(LABELS,{eye_candidate:'目候補',ear_candidate:'耳候補',hand_candidate:'手候補',ornament_candidate:'装飾候補',baseline_adjusted:'基準線補正'}); Object.assign(COLORS,{eye_candidate:[80,170,255],ear_candidate:[255,170,145],hand_candidate:[255,185,150],ornament_candidate:[240,190,80],baseline_adjusted:[120,220,255]}); }catch(e){} }
function addFaceSlider099(){
  if(safeQS('adjFace')) return;
  const shoulder=safeQS('adjShoulder'); if(!shoulder) return;
  const label=document.createElement('label'); label.className='tag'; label.innerHTML='顔下 <input id="adjFace" type="range" min="-40" max="40" value="0">';
  const parent=shoulder.closest('label')?.parentNode; if(parent) parent.insertBefore(label, shoulder.closest('label'));
}
const prevApply=(typeof applyLineAdjust==='function')?applyLineAdjust:null;
if(prevApply){
  applyLineAdjust=function(lines){
    let out=prevApply(lines); if(!out) return out; const a=state.lineAdjust||{};
    if(Number.isFinite(+a.face)&&+a.face!==0){ out.faceBot=clamp(out.faceBot+(+a.face), out.faceTop+8, out.shoulder-4); out.head=clamp(Math.round(out.faceTop+(out.faceBot-out.faceTop)*0.68), out.faceTop+2, out.faceBot-2); }
    return out;
  };
}
function wireSliders099(handler){
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=safeQS(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)}; handler(); }; });
}
function autoBaselineQA099(res){
  const lines=res?.lines; if(!lines) return {enabled:true,status:'no_lines'};
  const before={faceTop:lines.faceTop,faceBot:lines.faceBot,shoulder:lines.shoulder,waist:lines.waist};
  const gate=res?.boundaryStabilize0984?.gate||res?.faceChestQA0983?.gate||null;
  // Display/QA correction only. Full reclassification remains rule-based; manual slider can force a rerun.
  if(gate&&Number.isFinite(gate.splitY)) lines.faceBot=clamp(Math.round(gate.splitY), lines.faceTop+8, lines.shoulder-3);
  const chest=(res.candidates||[]).filter(r=>r.label==='chest_skin');
  if(chest.length){ const top=Math.min(...chest.map(r=>getBox(r).y)); lines.shoulder=clamp(Math.round((lines.shoulder*2+top)/3), lines.faceBot+4, lines.waist-4); }
  return {enabled:true,status:'ok',manual_adjust:state.lineAdjust||{},before,after:{faceTop:lines.faceTop,faceBot:lines.faceBot,shoulder:lines.shoulder,waist:lines.waist},changed:(before.faceBot!==lines.faceBot||before.shoulder!==lines.shoulder)};
}
function detectSmallParts099(res){
  if(!res||!res.imgData||!res.pre) return {enabled:true,status:'no_image'};
  addLabelDefs();
  const img=res.imgData,w=img.width,h=img.height,d=img.data,mask=res.pre.finalMask||new Uint8Array(w*h), lines=res.lines||{};
  const e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse||null;
  const roi=res.eyeScanROI0951||res.faceROI095||res.faceROI||null;
  let added=[];
  function pushBest(label, comps, reason, conf, maxN){
    comps.sort((a,b)=>b.area-a.area);
    for(const c of comps.slice(0,maxN)){ const r=makeRegion(label,c.pixels,res,reason,conf); if(r){ res.candidates.push(r); added.push({label,area:r.area,bbox:{x:r.minx,y:r.miny,w:r.w,h:r.h}}); } }
  }
  // Eye candidates: dark compact blobs inside eye scan/upper face.
  if(roi||e){
    const x0=Math.max(0,Math.floor(roi?roi.x:(e.cx-e.rx*.75))), x1=Math.min(w-1,Math.ceil(roi?roi.x+roi.w:(e.cx+e.rx*.75)));
    const y0=Math.max(0,Math.floor(roi?roi.y:(e.cy-e.ry*.62))), y1=Math.min(h-1,Math.ceil(roi?roi.y+roi.h*.55:(e.cy-e.ry*.05)));
    const m=new Uint8Array(w*h);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){ const p=y*w+x,i=p*4; if(mask[p]&&d[i+3]>0&&darkEyePixel(d,i)) m[p]=1; }
    const comps=compsFromMask(m,w,h,3,42).filter(c=>c.w>=2&&c.h>=2&&c.w<=14&&c.h<=10);
    pushBest('eye_candidate', comps, 'dark compact blob in eye scan ROI', 66, 4);
  }
  // Ear candidates: skin-like side blobs near face/upper shoulder.
  if(e){
    const m=new Uint8Array(w*h), cx=e.cx;
    const x0=Math.max(0,Math.floor(e.cx-e.rx*1.65)), x1=Math.min(w-1,Math.ceil(e.cx+e.rx*1.65));
    const y0=Math.max(0,Math.floor(e.cy-e.ry*.65)), y1=Math.min(h-1,Math.ceil(e.cy+e.ry*.25));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){ const p=y*w+x,i=p*4; const side=Math.abs(x-cx)>e.rx*.55; if(side&&mask[p]&&d[i+3]>0&&skinPixel(d,i)) m[p]=1; }
    const comps=compsFromMask(m,w,h,10,800).filter(c=>c.w>=4&&c.h>=5);
    pushBest('ear_candidate', comps, 'skin-like side blob near face', 58, 3);
  }
  // Hand candidates: skin-like blobs below shoulder and outside torso center.
  {
    const cx=lines.cx||w/2, shoulder=lines.shoulder||h*.28, waist=lines.waist||h*.52;
    const m=new Uint8Array(w*h);
    for(let y=Math.max(0,Math.floor(shoulder));y<=Math.min(h-1,Math.ceil(waist+40));y++)for(let x=0;x<w;x++){ const p=y*w+x,i=p*4; const side=Math.abs(x-cx)>w*.13; if(side&&mask[p]&&d[i+3]>0&&skinPixel(d,i)) m[p]=1; }
    const comps=compsFromMask(m,w,h,18,1100).filter(c=>c.w>=5&&c.h>=7);
    pushBest('hand_candidate', comps, 'skin-like side blob below shoulder', 60, 4);
  }
  // Ornament candidates: gold/high-detail pixels around cloth/chest.
  {
    const shoulder=lines.shoulder||h*.28, crotch=lines.crotch||h*.60, cx=lines.cx||w/2;
    const m=new Uint8Array(w*h);
    for(let y=Math.max(0,Math.floor(shoulder-30));y<=Math.min(h-1,Math.ceil(crotch));y++)for(let x=Math.max(0,Math.floor(cx-w*.22));x<=Math.min(w-1,Math.ceil(cx+w*.22));x++){ const p=y*w+x,i=p*4; if(mask[p]&&d[i+3]>0&&goldPixel(d,i)) m[p]=1; }
    const comps=compsFromMask(m,w,h,8,700).filter(c=>c.w>=3&&c.h>=3);
    pushBest('ornament_candidate', comps, 'gold/high-detail in torso center', 63, 6);
  }
  res.smallParts099={enabled:true,status:'ok',added_count:added.length,added,counts:added.reduce((a,x)=>{a[x.label]=(a[x.label]||0)+1;return a;},{})};
  return res.smallParts099;
}
const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze099(){ if(!prevAnalyze) return; await prevAnalyze(); try{ state.result.baselineQA099=autoBaselineQA099(state.result); detectSmallParts099(state.result); if(!state.selectedPart||state.selectedPart==='soft_shell') state.selectedPart='full_foreground'; renderAll(); }catch(e){ console.warn('v0.9.9 small parts/baseline failed',e); } }
window.analyze099=analyze099;
try{ addFaceSlider099(); analyze=analyze099; const run=safeQS('run'); if(run) run.onclick=analyze099; const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze099; wireSliders099(analyze099); }catch(e){}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta(); m.version=VERSION_099; m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_099;
    m.baseline_correction_v099=state.result?.baselineQA099||{enabled:true,status:'not_run'}; m.small_parts_v099=state.result?.smallParts099||{enabled:true,status:'not_run'};
    if(m.quality_v096){ m.quality_v096.version=VERSION_099; m.quality_v096.small_part_candidates=true; }
    m.region=m.region||{}; m.region.review_after=(state.result?.candidates||[]).filter(r=>r.needsReview).length;
    return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){ prevLog(); const b=state.result?.baselineQA099||{}, s=state.result?.smallParts099||{}, log=safeQS('log'); if(log) log.textContent+=`\n[v0.9.9 baseline/small parts]\nbaseline=${b.status||'-'} changed=${b.changed?'Y':'N'} faceBot=${b.after?.faceBot||'-'} shoulder=${b.after?.shoulder||'-'} added=${s.added_count||0} counts=${JSON.stringify(s.counts||{})}\n`; };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.9'; const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.9';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.9: 顔下/肩ライン補正 + 目/耳/手/装飾候補抽出。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.9は基準線を解析に反映する段階です。顔下ラインと肩ラインは自動QA＋手動スライダーで調整できます。小部位は安全のため候補扱いです。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_9.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.9 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_9.png','image/png'));};
}catch(e){ console.warn('v0.9.9 setup failed',e); }
})();
