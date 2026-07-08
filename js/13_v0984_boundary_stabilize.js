// ===== v0.9.8.4 patch: face/chest/cloth-detail boundary stabilization =====
(function(){
'use strict';
const VERSION_0984='0.9.8.4';
const PREPROCESSOR_VERSION_0984='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function labOf(r){ return (r.features&&r.features.mean_lab)||null; }
function hsvOf(r){
  const hsv=r.features&&r.features.mean_hsv; if(Array.isArray(hsv)) return {h:+hsv[0],s:+hsv[1],v:+hsv[2]};
  const c=r.mean||r.mean_color||[0,0,0]; try{ const x=rgb2hsv(c[0],c[1],c[2]); return {h:x[0],s:x[1],v:x[2]}; }catch(e){return {h:0,s:0,v:0};}
}
function isSkinLike0984(r){
  const c=r.mean||r.mean_color||[0,0,0], R=c[0],G=c[1],B=c[2], h=hsvOf(r), lab=labOf(r);
  const rgbSkin = R>95 && G>65 && B>55 && R>=G-4 && G>=B-28 && Math.max(R,G,B)-Math.min(R,G,B)<95;
  const hsvSkin = (h.h<=55||h.h>=330||h.s<0.18) && h.v>0.32 && h.v<0.94;
  const labSkin = !lab || (lab[1]>-4 && lab[1]<22 && lab[2]>-8 && lab[2]<24);
  return !!(rgbSkin && hsvSkin && labSkin);
}
function isGreenCloth0984(r){ const h=hsvOf(r), lab=labOf(r); return ((h.h>=88&&h.h<=185)&&(h.s>.16||h.v<.70)) || (lab&&lab[1]<-7); }
function isGoldOrnament0984(r){ const h=hsvOf(r), lab=labOf(r), ed=r.features?.edge_density||0; return ((h.h<=58||h.h>=340)&&h.s>.18&&h.v>.24&&ed>.45) || (lab&&lab[2]>7&&ed>.62); }
function getBox(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0}; }
function bboxUnion(list){
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1,area=0;
  for(const r of list||[]){ const b=getBox(r); if(!b.w||!b.h) continue; minx=Math.min(minx,b.x); miny=Math.min(miny,b.y); maxx=Math.max(maxx,b.x+b.w-1); maxy=Math.max(maxy,b.y+b.h-1); area+=r.area||0; }
  if(maxx<0) return null; return {x:minx,y:miny,w:maxx-minx+1,h:maxy-miny+1,area};
}
function gate0984(res){
  const old=res?.faceChestQA0983?.gate; if(old&&Number.isFinite(old.splitY)) return {...old, source:(old.source||'0983')+'+0984'};
  const lines=res?.lines||{}, e=res?.faceEllipse0952||res?.faceEllipse0951||res?.faceEllipse095||res?.faceEllipse||null;
  const shoulder=Number.isFinite(lines.shoulder)?lines.shoulder:(e?e.cy+e.ry*.62:140);
  const faceBot=Number.isFinite(lines.faceBot)?lines.faceBot:(e?e.cy+e.ry*.42:shoulder-14);
  const splitY=Math.round(Math.min(shoulder-4, Math.max(faceBot+2, e?e.cy+e.ry*.42:faceBot)));
  return {splitY, shoulder, faceBot, source:'0984_fallback'};
}
function setLabel(r,label,reason,conf=0,review=false){
  const old=r.label; if(old!==label){ r.previous_label=r.previous_label||old; r.label=label; }
  r.needsReview=!!review;
  const base=Number(r.finalConfidence??r.confidence??r.conf??70);
  r.finalConfidence=r.confidence=r.conf=clamp(Math.round(base+conf),0,100);
  r.reason=(r.reason||'')+' / v0.9.8.4 '+reason;
  r.boundaryStabilize0984={from:old,to:label,reason,needs_review:!!review};
}
function stabilizeBoundaries0984(res){
  if(!res||!res.candidates) return res;
  try{ Object.assign(LABELS,{ chest_skin:'胸元肌', cloth_detail:'衣装細部', ornament_detail:'装飾細部', boundary_review:'境界確認' }); Object.assign(COLORS,{ chest_skin:[244,170,150], cloth_detail:[86,190,150], ornament_detail:[224,178,92], boundary_review:[255,95,120] }); }catch(e){}
  const g=gate0984(res), lines=res.lines||{};
  const waist=Number.isFinite(lines.waist)?lines.waist:(g.shoulder+Math.round((state.h||512)*.22));
  const chestMaxY=Math.round(g.shoulder + Math.max(18,(waist-g.shoulder)*0.42));
  let changed=0, warnings=[];
  for(const r of res.candidates){
    const b=getBox(r), bottom=b.y+b.h-1, cy=r.cy??(b.y+b.h/2);
    if(r.label==='chest_skin'){
      if(!isSkinLike0984(r)){
        if(isGoldOrnament0984(r)){ setLabel(r,'ornament_detail','chest_skin_not_skin_gold_guard',6,false); changed++; }
        else if(isGreenCloth0984(r)){ setLabel(r,'cloth_detail','chest_skin_not_skin_green_guard',6,false); changed++; }
        else { r.needsReview=true; r.boundaryWarning0984='chest_skin_color_uncertain'; warnings.push('chest_skin_color_uncertain'); }
      }else if(b.y < g.splitY-10 || bottom > chestMaxY+10){
        r.needsReview=true; r.boundaryWarning0984='chest_skin_position_uncertain'; warnings.push('chest_skin_position_uncertain');
      }
    }
    if(r.label==='cloth_detail'){
      const centerBand = b.x > (res.lines?.cx||state.w/2)-(state.w||368)*.22 && b.x+b.w < (res.lines?.cx||state.w/2)+(state.w||368)*.22;
      const chestBand = cy >= g.splitY-2 && cy <= chestMaxY;
      if(isSkinLike0984(r) && centerBand && chestBand && !isGreenCloth0984(r) && !isGoldOrnament0984(r)){
        setLabel(r,'chest_skin','skin_like_cloth_detail_in_chest_band',5,false); changed++;
      }
    }
    if(r.label==='face'){
      if(r.touches?.torso || bottom > g.splitY+14){ r.needsReview=true; r.boundaryWarning0984='face_leaks_below_split'; warnings.push('face_leaks_below_split'); }
    }
  }
  const face=res.candidates.filter(r=>r.label==='face'), chest=res.candidates.filter(r=>r.label==='chest_skin'), clothDetail=res.candidates.filter(r=>r.label==='cloth_detail'), orn=res.candidates.filter(r=>r.label==='ornament_detail');
  const faceLeak=face.filter(r=>{const b=getBox(r); return r.touches?.torso || b.y+b.h-1>g.splitY+14;}).length;
  const chestLeak=chest.filter(r=>{const b=getBox(r); return b.y<g.splitY-10 || b.y+b.h-1>chestMaxY+10 || !isSkinLike0984(r);}).length;
  res.boundaryStabilize0984={enabled:true,changed,warnings:[...new Set(warnings)],gate:g,chestMaxY,face_count:face.length,chest_count:chest.length,cloth_detail_count:clothDetail.length,ornament_detail_count:orn.length,face_bbox:bboxUnion(face),chest_bbox:bboxUnion(chest),face_leak_count:faceLeak,chest_leak_count:chestLeak,status:(faceLeak||chestLeak)?'needs_review':'ok'};
  return res;
}
const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0984(){ if(!prevAnalyze) return; await prevAnalyze(); try{ stabilizeBoundaries0984(state.result); renderAll(); }catch(e){ console.warn('v0.9.8.4 boundary failed',e); } }
window.analyze0984=analyze0984;
try{ analyze=analyze0984; const run=safeQS('run'); if(run) run.onclick=analyze0984; const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0984; }catch(e){}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta(); m.version=VERSION_0984; m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_0984; m.boundary_stabilize_v0984=state.result?.boundaryStabilize0984||{enabled:true,status:'not_run'};
    if(m.quality_v096){ m.quality_v096.version=VERSION_0984; const qa=state.result?.boundaryStabilize0984; if(qa&&qa.status!=='ok'){ m.quality_v096.ok=false; m.quality_v096.warnings=[...(m.quality_v096.warnings||[]),'boundary_stabilize_needs_review']; } }
    if(Array.isArray(m.parts)){ for(const p of m.parts){ const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id); if(live){ p.label=live.label; p.label_ja=(LABELS&&LABELS[live.label])||live.label; p.needs_review=!!live.needsReview; p.boundary_stabilize_v0984=live.boundaryStabilize0984||null; p.boundary_warning_v0984=live.boundaryWarning0984||null; } } }
    m.region=m.region||{}; m.region.review_after=(state.result?.candidates||[]).filter(r=>r.needsReview).length; return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){ prevLog(); const q=state.result?.boundaryStabilize0984||{}, log=safeQS('log'); if(log) log.textContent+=`\n[v0.9.8.4 boundary]\nstatus=${q.status||'-'} changed=${q.changed||0} faceLeak=${q.face_leak_count||0} chestLeak=${q.chest_leak_count||0} splitY=${q.gate?.splitY||'-'} chestMaxY=${q.chestMaxY||'-'}\n`; };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.8.4'; const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.8.4';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.8.4: 顔・胸元肌・衣装細部の境界安定化。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_8_4.json','application/json');};
}catch(e){}
})();
