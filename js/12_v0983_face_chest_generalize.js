// ===== v0.9.8.3 patch: generic face/chest split validation + internal QA metadata =====
(function(){
'use strict';
const VERSION_0983='0.9.8.3';
const PREPROCESSOR_VERSION_0983='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function bboxUnion(list){
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1,area=0;
  for(const r of list||[]){ if(!r) continue; const x=r.minx??r.bbox?.[0], y=r.miny??r.bbox?.[1], w=r.w??r.bbox?.[2], h=r.h??r.bbox?.[3]; if(x==null) continue; minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x+w-1); maxy=Math.max(maxy,y+h-1); area+=r.area||0; }
  if(maxx<0) return null; return {x:minx,y:miny,w:maxx-minx+1,h:maxy-miny+1,area};
}
function centerOf(r){ const b=Array.isArray(r.bbox)?{x:r.bbox[0],y:r.bbox[1],w:r.bbox[2],h:r.bbox[3]}:r; return {cx:b.x+b.w/2, cy:b.y+b.h/2}; }
function getBox(r){ return Array.isArray(r.bbox)?{x:r.bbox[0],y:r.bbox[1],w:r.bbox[2],h:r.bbox[3]}:{x:r.minx,y:r.miny,w:r.w,h:r.h}; }
function computeGenericFaceChestGate0983(res){
  const lines=res?.lines||{};
  const e=res?.faceEllipse0952||res?.faceEllipse0951||res?.faceEllipse095||res?.faceEllipse||null;
  const faceROI=res?.faceROI0951||res?.faceROI095||res?.faceROI||null;
  const top=Number.isFinite(lines.faceTop)?lines.faceTop:(faceROI?.y ?? e?.cy-e?.ry ?? 0);
  const shoulder=Number.isFinite(lines.shoulder)?lines.shoulder:(faceROI?faceROI.y+faceROI.h*0.72:(e?e.cy+e.ry*0.72:140));
  const faceBot=Number.isFinite(lines.faceBot)?lines.faceBot:(e?e.cy+e.ry*0.50:shoulder-12);
  const ellipseChin=e ? e.cy + e.ry*0.42 : faceBot;
  // Generic split line: below facial ellipse/chin, but always above shoulder.
  let splitY=Math.round(Math.min(shoulder-4, Math.max(faceBot+2, ellipseChin)));
  if(faceROI) splitY=clamp(splitY, faceROI.y+Math.round(faceROI.h*0.42), shoulder-4);
  return {splitY, top, shoulder, faceBot, ellipseChin:+ellipseChin.toFixed(1), source:e?'face_ellipse+baselines':'baselines'};
}
function scoreFaceChestSeparation0983(res){
  const face=(res?.candidates||[]).filter(r=>r.label==='face');
  const chest=(res?.candidates||[]).filter(r=>r.label==='chest_skin');
  const gate=computeGenericFaceChestGate0983(res);
  let faceLeak=0, chestLeak=0;
  for(const r of face){ const b=getBox(r); if(b.y+b.h-1 > gate.splitY+6 || r.touches?.torso) faceLeak++; }
  for(const r of chest){ const b=getBox(r); if(b.y < gate.splitY-4 || !r.touches?.torso) chestLeak++; }
  const fb=bboxUnion(face), cb=bboxUnion(chest);
  let status='ok'; const warnings=[];
  if(faceLeak) { status='needs_guard'; warnings.push('face_extends_below_generic_split'); }
  if(chestLeak) { status='needs_guard'; warnings.push('chest_above_generic_split_or_not_torso'); }
  if(chest.length===0) warnings.push('no_chest_skin_detected');
  return {enabled:true, status, warnings, gate, face_count:face.length, chest_count:chest.length, face_bbox:fb, chest_bbox:cb, face_leak_count:faceLeak, chest_leak_count:chestLeak};
}
function applyGenericSafety0983(res){
  if(!res||!res.candidates) return res;
  const qa=scoreFaceChestSeparation0983(res);
  res.faceChestQA0983=qa;
  // Do not add image-specific coordinates. Only mark suspect face/chest items for review if generic constraints fail.
  if(qa.face_leak_count || qa.chest_leak_count){
    for(const r of res.candidates){
      if(r.label==='face'){
        const b=getBox(r);
        if(b.y+b.h-1 > qa.gate.splitY+6 || r.touches?.torso){
          r.needsReview=true;
          r.reason=(r.reason||'')+' / v0.9.8.3 generic face/chest leak review';
          r.genericFaceChestWarning0983='face_below_split_or_torso_touch';
        }
      }
      if(r.label==='chest_skin'){
        const b=getBox(r);
        if(b.y < qa.gate.splitY-4 || !r.touches?.torso){
          r.needsReview=true;
          r.reason=(r.reason||'')+' / v0.9.8.3 generic chest position review';
          r.genericFaceChestWarning0983='chest_above_split_or_not_torso';
        }
      }
    }
  }
  return res;
}
const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0983(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  try{
    applyGenericSafety0983(state.result);
    renderAll();
  }catch(e){ console.warn('v0.9.8.3 generic face/chest guard failed',e); }
}
window.analyze0983=analyze0983;
try{
  analyze=analyze0983;
  const run=safeQS('run'); if(run) run.onclick=analyze0983;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0983;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze0983();};});
}catch(e){}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_0983;
    m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_0983;
    m.face_chest_qa_v0983=state.result?.faceChestQA0983 || {enabled:true,status:'not_run'};
    if(m.quality_v096){
      m.quality_v096.version=VERSION_0983;
      const qa=state.result?.faceChestQA0983;
      if(qa && qa.status!=='ok'){
        m.quality_v096.ok=false;
        m.quality_v096.warnings=[...(m.quality_v096.warnings||[]),'face_chest_split_needs_review'];
      }
    }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(!live) continue;
        p.needs_review=!!live.needsReview;
        p.generic_face_chest_warning_v0983=live.genericFaceChestWarning0983||null;
      }
    }
    m.region=m.region||{}; m.region.review_after=(state.result?.candidates||[]).filter(r=>r.needsReview).length;
    return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const qa=state.result?.faceChestQA0983||{}; const log=safeQS('log'); if(!log) return;
    log.textContent += `\n[v0.9.8.3 face/chest QA]\nstatus=${qa.status||'-'} splitY=${qa.gate?.splitY||'-'} face=${qa.face_count||0} chest=${qa.chest_count||0} warnings=${(qa.warnings||[]).join(',')||'none'}\n`;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.8.3';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.8.3';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.8.3: 顔/胸元肌分離の汎用ガード・内部検証レポート追加。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、手動補正しやすい候補Regionを作る。v0.9.8.3は特定画像依存ではなく、基準線・face ellipse・肩/胴体接続で顔と胸元肌を分ける検証版です。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_8_3.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.8.3 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_8_3.png','image/png'));};
}catch(e){ console.warn('v0.9.8.3 setup failed',e); }
})();
