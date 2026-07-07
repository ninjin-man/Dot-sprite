// ===== v0.9.8 patch: review reduction / detail subtype classification =====
(function(){
'use strict';
const VERSION_098='0.9.8.1';
const PREPROCESSOR_VERSION_098='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+hairsoft-safety';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function labelName(label){ return (LABELS&&LABELS[label]) || label; }
function safeColor(label){ return (COLORS && (COLORS[label]||COLORS.unknown)) || [255,80,120]; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function ar(r){ return (r&&r.area||0)/Math.max(1,(state.w||1)*(state.h||1)); }
function ensureLabels098(){
  try{
    Object.assign(LABELS,{ cloth_detail:'衣装細部', hair_tip:'髪端', ornament_detail:'装飾細部' });
    Object.assign(COLORS,{ cloth_detail:[86,190,150], hair_tip:[204,174,218], ornament_detail:[224,178,92] });
    if(typeof makePartButtons==='function') makePartButtons();
  }catch(e){}
}
ensureLabels098();
function regionHSV(r){
  const hsv=r.features&&r.features.mean_hsv; if(Array.isArray(hsv)) return {h:hsv[0],s:hsv[1],v:hsv[2]};
  const c=r.mean||r.mean_color||r.color||[0,0,0]; try{ const x=rgb2hsv(c[0],c[1],c[2]); return {h:x[0],s:x[1],v:x[2]}; }catch(e){return {h:0,s:0,v:0};}
}
function isGreenClothLike(r){
  const h=regionHSV(r), lab=r.features&&r.features.mean_lab;
  const greenHue=(h.h>=95&&h.h<=180);
  const darkGreen=greenHue&&h.s>=0.18&&h.v<=0.62;
  const mint=greenHue&&h.s<0.22&&h.v>=0.48;
  const labGreen=lab&&lab[1]<-4;
  return !!(darkGreen||mint||labGreen);
}
function isGoldOrnamentLike(r){
  const h=regionHSV(r), lab=r.features&&r.features.mean_lab;
  return (h.h<=55||h.h>=340) && h.s>=0.18 && h.v>=0.25 || (lab&&lab[2]>7&&r.features.edge_density>0.75);
}
function isLavenderHairLike(r){
  const h=regionHSV(r), lab=r.features&&r.features.mean_lab;
  return ((h.h>=200&&h.h<=330)&&h.s<=0.26) || (lab&&lab[1]>0&&lab[2]<2);
}
function inFaceCore098(r,res){
  const e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse; if(!e) return false;
  const dx=(r.cx-e.cx)/Math.max(1,e.rx*0.92), dy=(r.cy-e.cy)/Math.max(1,e.ry*0.58);
  return dx*dx+dy*dy<=1 && r.cy < e.cy + e.ry*0.10;
}
function belowEyeArea098(r,res){
  const eye=res.face_detection?.eye_scan_roi || res.eyeScanROI0951 || res.eyeScanROI0952;
  if(eye && r.cy > eye.y + eye.h*0.82) return true;
  const e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse;
  return e ? r.cy > e.cy + e.ry*0.28 : false;
}
function setLabel098(r,label,review,reason,confAdd=0){
  const old=r.label;
  if(old!==label){ r.previous_label=r.previous_label||old; r.label=label; }
  r.needsReview=!!review;
  const base=Number(r.finalConfidence??r.confidence??r.conf??70);
  r.finalConfidence=r.confidence=r.conf=clamp(Math.round(base+confAdd),0,100);
  r.reason=(r.reason||'')+' / v0.9.8 '+reason;
  r.reviewReduction098={from:old,to:label,needs_review:!!review,reason};
}
function refineReview098(res){
  if(!res||!res.candidates) return res;
  let changed=0, autoCleared=0;
  for(const r of res.candidates){
    if(['soft_shell','bg_residue','background_residue'].includes(r.label)) { r.needsReview=false; continue; }
    const small=ar(r)<0.0045;
    if(r.label==='face_detail'){
      if(!inFaceCore098(r,res) || belowEyeArea098(r,res) || isGreenClothLike(r)){
        setLabel098(r,'cloth_detail',false,'face_detail->cloth_detail_safe',7); changed++; autoCleared++;
      }
    }else if(r.label==='detail_candidate'){
      if(isGoldOrnamentLike(r) && (r.visualZone==='torso'||r.origin_zone==='torso'||r.originZone==='torso')){
        setLabel098(r,'ornament_detail',false,'detail_candidate->ornament_detail_safe',8); changed++; autoCleared++;
      }else if(isGreenClothLike(r)){
        setLabel098(r,'cloth_detail',false,'detail_candidate->cloth_detail_safe',7); changed++; autoCleared++;
      }
    }else if(r.label==='hair_soft'){
      const safeHair = isLavenderHairLike(r) && (r.touches?.head || r.origin_zone==='head' || r.visualZone==='head' || r.visual_zone==='head') && !(r.touches?.waist||r.touches?.ankle) && ar(r)<0.004;
      const clothSoft = isGreenClothLike(r) && !(r.touches?.waist||r.touches?.ankle) && ar(r)<0.004;
      if(safeHair && (r.finalConfidence||r.confidence||0)>=72){ setLabel098(r,'hair_tip',false,'hair_soft->hair_tip_safe',5); changed++; autoCleared++; }
      else if(clothSoft){ setLabel098(r,'cloth_detail',false,'hair_soft->cloth_detail_safe',6); changed++; autoCleared++; }
      else if(safeHair){ r.needsReview=true; r.reason=(r.reason||'')+' / v0.9.8.1 keep_review_low_conf_hair_tip'; }
    }
  }
  // Limit review queue to genuinely ambiguous items.
  const reviewLabels=new Set(['hair_soft','unknown_soft','ambiguous_overlap','detail_candidate','face_detail']);
  for(const r of res.candidates){
    if(!reviewLabels.has(r.label)) r.needsReview=false;
  }
  res.reviewReduction098={changed,auto_cleared:autoCleared,review_target_count:res.candidates.filter(r=>r.needsReview).length};
  return res;
}
const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze098(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  try{ refineReview098(state.result); renderAll(); }catch(e){ console.warn('v0.9.8 refine failed',e); }
}
window.analyze098=analyze098;
try{
  analyze=analyze098;
  const run=safeQS('run'); if(run) run.onclick=analyze098;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze098;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze098();};});
}catch(e){}
if(typeof makeReviewQueue==='function'){
  const prevQueue=makeReviewQueue;
  makeReviewQueue=function(){
    const q=(state.result?.candidates||[]).filter(r=>r.needsReview && !['soft_shell','cloth_detail','ornament_detail','hair_tip','bg_residue'].includes(r.label));
    if(q.length) return q.sort((a,b)=>b.area-a.area).slice(0,8);
    try{return prevQueue().filter(r=>r.needsReview).slice(0,4);}catch(e){return [];}
  };
}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_098;
    m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_098;
    if(m.quality_v096) { m.quality_v096.version=VERSION_098; m.quality_v096.review_target_count=state.result?.reviewReduction098?.review_target_count??m.quality_v096.review_target_count; }
    if(m.export_v096) m.export_v096.review_reduction=true;
    m.review_v098={enabled:true,...(state.result?.reviewReduction098||{}),labels:(state.result?.candidates||[]).filter(r=>r.reviewReduction098).map(r=>({id:r.mid||r.id,...r.reviewReduction098}))};
    if(Array.isArray(m.parts)){
      for(const p of m.parts){ const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id); if(live){ p.label=live.label; p.label_ja=labelName(live.label); p.needs_review=!!live.needsReview; p.confidence=live.confidence||live.conf||p.confidence; p.final_confidence=live.finalConfidence??p.final_confidence; p.review_reduction_v098=live.reviewReduction098||null; }}
    }
    m.region=m.region||{}; m.region.review_after=(state.result?.candidates||[]).filter(r=>r.needsReview).length;
    return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log) return;
    const rr=state.result?.reviewReduction098||{};
    log.textContent += `\n[v0.9.8 review reduction]\nchanged=${rr.changed||0} autoCleared=${rr.auto_cleared||0} review=${rr.review_target_count||0}\n`;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.8.1';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.8.1';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.8.1: レビュー対象の自動安全整理・髪端/薄布の安全再分類。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、手動補正しやすい候補Regionを作る。v0.9.8.1はレビュー対象を減らし、髪端と薄布の混同を安全側で整理する検証版です。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_8_1.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.8.1 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_8_1.png','image/png'));};
  const memBtn=safeQS('memoryJson'); if(memBtn && typeof loadMemory==='function') memBtn.onclick=()=>downloadBlob(JSON.stringify(loadMemory(),null,2),'correction_memory_v0_9_8_1.json','application/json');
}catch(e){ console.warn('v0.9.8 setup failed',e); }
})();
