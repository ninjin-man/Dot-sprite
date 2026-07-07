// ===== v0.9.5.2 patch: validated eye pair / safer face ellipse =====
(function(){
'use strict';
const VERSION_0952='0.9.5.2';
const PREPROCESSOR_VERSION_0952='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function rectCenter(r){ return {cx:r.x+r.w/2, cy:r.y+r.h/2}; }
function normCandidate(e,scan){
  const relX=Math.abs(e.cx-scan.cx)/Math.max(1,scan.w/2);
  const relY=(e.cy-scan.y)/Math.max(1,scan.h);
  const side=e.cx<scan.cx?'L':'R';
  return {...e, relX:+relX.toFixed(3), relY:+relY.toFixed(3), side};
}
function validateEyeCandidate0952(e,scan){
  const n=normCandidate(e,scan), reasons=[];
  if(n.area<3) reasons.push('area_lt_3');
  if(n.area>36) reasons.push('area_gt_36');
  if(n.w<2) reasons.push('width_lt_2');
  if(n.h<2) reasons.push('height_lt_2');
  if(n.w>12) reasons.push('width_gt_12');
  if(n.h>10) reasons.push('height_gt_10');
  if(n.relY<0.10) reasons.push('too_high');
  if(n.relY>0.70) reasons.push('too_low');
  if(n.relX<0.08) reasons.push('too_center');
  if(n.relX>0.88) reasons.push('too_outer');
  if((n.score||0)<68) reasons.push('score_lt_68');
  // Extremely thin 1-pixel candidates often came from hair/highlight edges in v0.9.5.1.
  const thin=(n.w<=1||n.h<=1);
  if(thin && (n.score||0)<92) reasons.push('thin_edge_candidate');
  return {candidate:n, valid:reasons.length===0, reasons};
}
function buildStrictPairs0952(valid,scan){
  const pairs=[];
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
    const a=valid[i],b=valid[j],left=a.cx<b.cx?a:b,right=a.cx<b.cx?b:a;
    if(left.cx>=scan.cx-scan.w*0.02) continue;
    if(right.cx<=scan.cx+scan.w*0.02) continue;
    const gap=(right.cx-left.cx)/Math.max(1,scan.w);
    const yDiff=Math.abs(left.cy-right.cy)/Math.max(1,scan.h);
    const centerErr=Math.abs(((left.cx+right.cx)/2)-scan.cx)/Math.max(1,scan.w);
    const areaBal=Math.abs(Math.log((left.area+1)/(right.area+1)));
    const minScore=Math.min(left.score||0,right.score||0);
    const reject=[];
    if(gap<0.17) reject.push('gap_too_small');
    if(gap>0.58) reject.push('gap_too_large');
    if(yDiff>0.22) reject.push('y_diff_gt_22pct');
    if(centerErr>0.20) reject.push('center_error_gt_20pct');
    if(areaBal>1.15) reject.push('area_balance_gt_1_15');
    if(minScore<70) reject.push('min_score_lt_70');
    if(reject.length) continue;
    let score=0;
    score += 38-Math.round(yDiff*110);
    score += 28-Math.round(centerErr*120);
    score += 18-Math.round(Math.min(18,areaBal*14));
    score += gap>=0.20&&gap<=0.46?16:8;
    score += Math.round((left.score+right.score)/14);
    pairs.push({left,right,score:clamp(score,0,100),source:'eye_scan_roi_validated'});
  }
  pairs.sort((a,b)=>b.score-a.score);
  return pairs.slice(0,3);
}
function ellipseFromValidPair0952(pair,scan,result){
  const roi=result.faceROI095 || null;
  if(!pair || !scan) return null;
  const cx=(pair.left.cx+pair.right.cx)/2;
  const eyeY=(pair.left.cy+pair.right.cy)/2;
  const gap=pair.right.cx-pair.left.cx;
  const rx=Math.max(scan.w*0.24, Math.min(scan.w*0.44, gap*0.95));
  const ry=Math.max(scan.h*0.42, Math.min((roi?.h||scan.h)*0.30, scan.h*0.72));
  return {cx:+cx.toFixed(1), cy:+(eyeY+ry*0.36).toFixed(1), rx:+rx.toFixed(1), ry:+ry.toFixed(1), source:pair.source};
}
function fallbackFaceEllipse0952(result){
  // Prefer the broader face-region ellipse from v0.9.5, not the false-positive narrow v0.9.5.1 eye ellipse.
  if(result.faceEllipse095 && result.faceEllipse095.source!=='eye_scan_roi_relaxed') return {...result.faceEllipse095, source:'face-region-no-valid-eye-pair'};
  if(result.faceROI095){
    const roi=result.faceROI095;
    return {cx:+roi.cx.toFixed(1), cy:+(roi.y+roi.h*0.48).toFixed(1), rx:+(roi.w*0.34).toFixed(1), ry:+(roi.h*0.34).toFixed(1), source:'face-region-no-valid-eye-pair'};
  }
  return result.faceEllipse || null;
}
function applyEyeValidation0952(result){
  if(!result) return result;
  const scan=result.eyeScanROI0951 || null;
  const raw=(result.eyeCandidates0951 || result.eyeCandidates || []).map(e=>({
    minx:e.minx, miny:e.miny, w:e.w, h:e.h, cx:e.cx, cy:e.cy, area:e.area, score:e.score||0, source:e.source||'unknown'
  }));
  if(!scan){
    result.eyeCandidates0952=raw;
    result.eyePairs0952=[];
    result.faceEllipse0952=fallbackFaceEllipse0952(result);
    result.faceEllipse=result.faceEllipse0952;
    result.eyeValidation0952={enabled:true, reason:'no_scan_roi', raw_count:raw.length, valid_count:0, valid_pair_count:0, rejected:[]};
    return result;
  }
  const checked=raw.map(e=>validateEyeCandidate0952(e,scan));
  const valid=checked.filter(x=>x.valid).map(x=>x.candidate);
  const pairs=buildStrictPairs0952(valid,scan);
  result.eyeCandidates0952=valid;
  result.eyePairs0952=pairs;
  result.eyeCandidates=valid;
  result.eyePairs=pairs;
  result.faceEllipse0952=pairs.length ? ellipseFromValidPair0952(pairs[0],scan,result) : fallbackFaceEllipse0952(result);
  result.faceEllipse=result.faceEllipse0952;
  result.eyeValidation0952={
    enabled:true,
    mode:'precision_first',
    raw_count:raw.length,
    valid_count:valid.length,
    relaxed_pair_count:(result.eyePairs0951||[]).length,
    valid_pair_count:pairs.length,
    rejected:checked.filter(x=>!x.valid).map(x=>({bbox:[x.candidate.minx,x.candidate.miny,x.candidate.w,x.candidate.h],score:x.candidate.score,relX:x.candidate.relX,relY:x.candidate.relY,reasons:x.reasons}))
  };
  return result;
}
function retuneFaceDetails0952(result){
  if(!result||!result.candidates) return;
  const e=result.faceEllipse0952||result.faceEllipse;
  let faceDetail=0, detail=0;
  for(const r of result.candidates){
    // If v0.9.5.1 promoted a face_detail but it sits outside the precision face ellipse, keep it reviewable detail_candidate.
    if(r.label==='face_detail' && e){
      const dx=(r.cx-e.cx)/Math.max(1,e.rx*1.55), dy=(r.cy-e.cy)/Math.max(1,e.ry*1.35);
      if(dx*dx+dy*dy>1.25){
        r.previous_label=r.previous_label||'face_detail';
        r.label='detail_candidate';
        r.reason=(r.reason||'')+' / v0.9.5.2 face_detail outside validated face ellipse';
        r.needsReview=true;
      }
    }
    if(r.label==='face_detail') faceDetail++;
    if(r.label==='detail_candidate') detail++;
  }
  result.detailStats0952={face_detail:faceDetail,detail_candidate:detail};
}
function apply0952(result){
  applyEyeValidation0952(result);
  retuneFaceDetails0952(result);
  result.reviewTargets0952=(result.candidates||[]).filter(r=>r.needsReview && !['soft_shell','bg_residue','background_residue'].includes(r.label));
  result.stats0952={
    eye_candidate_raw:result.eyeValidation0952?.raw_count||0,
    eye_candidate_valid:result.eyeValidation0952?.valid_count||0,
    eye_pair_relaxed:result.eyeValidation0952?.relaxed_pair_count||0,
    eye_pair_valid:result.eyeValidation0952?.valid_pair_count||0,
    face_ellipse_source:result.faceEllipse0952?.source||null,
    detail_candidate:result.detailStats0952?.detail_candidate||0,
    face_detail:result.detailStats0952?.face_detail||0
  };
  return result;
}

const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0952(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  if(state.result&&state.result.candidates){
    apply0952(state.result);
    try{ renderAll(); }catch(e){}
  }
}
window.analyze0952=analyze0952;

if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    if(state.result) apply0952(state.result);
    const all=(state.result?.candidates||[]).filter(r=>r.needsReview && !['soft_shell','bg_residue','background_residue'].includes(r.label));
    const order=['face_detail','detail_candidate','hair_soft','sheer_soft','unknown_soft','ambiguous_overlap','face','hands','ears'];
    const pri=r=>{const i=order.indexOf(r.label);return i<0?99:i;};
    return all.sort((a,b)=>pri(a)-pri(b)||b.area-a.area).slice(0,10);
  };
}

if(typeof drawReviewCanvas==='function'){
  const prevDraw=drawReviewCanvas;
  drawReviewCanvas=function(){
    prevDraw();
    const c=safeQS('reviewCanvas'),ctx=c&&c.getContext&&c.getContext('2d'),r=state.review?.current,result=state.result;
    if(!ctx||!r||!result) return;
    const scan=result.eyeScanROI0951, valid=result.eyeCandidates0952||[], rejected=result.eyeValidation0952?.rejected||[], pairs=result.eyePairs0952||[];
    ctx.save();
    if(scan){ctx.strokeStyle='rgba(80,200,255,0.95)';ctx.lineWidth=2;ctx.strokeRect(scan.x,scan.y,scan.w,scan.h);ctx.fillStyle='rgba(80,200,255,0.95)';ctx.font='13px sans-serif';ctx.fillText('EYE SCAN',scan.x,Math.max(14,scan.y-4));}
    ctx.strokeStyle='rgba(255,120,120,0.85)';ctx.lineWidth=1.5;
    for(const e of rejected.slice(0,8)){ctx.strokeRect(e.bbox[0],e.bbox[1],e.bbox[2],e.bbox[3]);}
    ctx.strokeStyle='rgba(255,235,80,0.95)';ctx.lineWidth=2.5;
    for(const e of valid.slice(0,6)){ctx.strokeRect(e.minx,e.miny,e.w,e.h);}
    if(pairs[0]){ctx.strokeStyle='rgba(120,255,120,0.95)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(pairs[0].left.cx,pairs[0].left.cy);ctx.lineTo(pairs[0].right.cx,pairs[0].right.cy);ctx.stroke();}
    ctx.restore();
  };
}

try{
  document.title='Sprite Studio Region Viewer v0.9.5.2';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.5.2';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.5.2: eye_pair検証を厳格化し、誤ペア時はface-region楕円に戻す安全版。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、AIなしで補正しやすい候補Regionを作る。v0.9.5.2は目ペアを数だけ増やさず、信頼できる候補だけ通す安全版です。';
  analyze=analyze0952;
  const run=safeQS('run'); if(run) run.onclick=analyze0952;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0952;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze0952();};});
}catch(e){}

if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_0952;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0952;
    m.face_detection={...(m.face_detection||{}),
      eye_candidate_count:state.result?.eyeCandidates0952?.length||0,
      eye_pair_count:state.result?.eyePairs0952?.length||0,
      face_ellipse:state.result?.faceEllipse0952||state.result?.faceEllipse||null,
      eye_validation:state.result?.eyeValidation0952||null,
      eye_candidates_valid:(state.result?.eyeCandidates0952||[]).map(e=>({bbox:[e.minx,e.miny,e.w,e.h],cx:+e.cx.toFixed(1),cy:+e.cy.toFixed(1),area:e.area,score:e.score,source:e.source||'unknown'})),
      eye_pairs_valid:(state.result?.eyePairs0952||[]).map(p=>({left:[p.left.minx,p.left.miny,p.left.w,p.left.h],right:[p.right.minx,p.right.miny,p.right.w,p.right.h],score:p.score,source:p.source}))
    };
    m.review_v0952={
      validated_eye_pair:true,
      precision_first:true,
      fallback_face_ellipse:true,
      review_target_count:state.result?.reviewTargets0952?.length||0,
      review_labels:(state.result?.reviewTargets0952||[]).map(r=>({id:r.mid||r.id,label:r.label,confidence:r.confidence||r.conf||0}))
    };
    m.analysis_v0952={stats:state.result?.stats0952||null};
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(!live) continue;
        p.label=live.label; p.label_ja=LABELS[live.label]||live.label;
        p.confidence=live.confidence||live.conf||p.confidence;
        p.final_confidence=live.finalConfidence??p.final_confidence;
        p.needs_review=!!live.needsReview;
        p.previous_label=live.previous_label||p.previous_label||null;
        p.reason=live.reason||p.reason;
        p.analysis_v0952={near_validated_eye:false};
      }
    }
    return m;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_5_2.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.5.2 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_5_2.png','image/png'));};
}catch(e){}

if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log||!state.result)return;
    const st=state.result.stats0952||{};
    log.textContent += `\n[v0.9.5.2 validated eye pair]\nraw=${st.eye_candidate_raw||0} / valid=${st.eye_candidate_valid||0} / relaxed_pairs=${st.eye_pair_relaxed||0} / valid_pairs=${st.eye_pair_valid||0} / ellipse=${st.face_ellipse_source||'-'} / detail=${st.detail_candidate||0} / face_detail=${st.face_detail||0}\n`;
  };
}
})();
