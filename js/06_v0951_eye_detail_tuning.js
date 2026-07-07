// ===== v0.9.5.1 patch: eye-scan ROI / relaxed eye-pair / safer detail candidates =====
(function(){
'use strict';
const VERSION_0951='0.9.5.1';
const PREPROCESSOR_VERSION_0951='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function personArea(lines){ return (lines&&lines.bbox&&lines.bbox.area) || Math.max(1,(state.w||1)*(state.h||1)); }
function areaRatio(r,lines){ return (r.area||0)/Math.max(1,personArea(lines)); }
function rectFromRegion(r){ return {x:r.minx,y:r.miny,w:r.w,h:r.h}; }
function clampRect(rect,w,h){ if(!rect) return null; let x=clamp(Math.floor(rect.x),0,w-1), y=clamp(Math.floor(rect.y),0,h-1); let rw=clamp(Math.floor(rect.w),1,w-x), rh=clamp(Math.floor(rect.h),1,h-y); return {x,y,w:rw,h:rh,cx:x+rw/2,cy:y+rh/2}; }
function pointInEllipse(x,y,e,sx=1,sy=1){ if(!e)return false; const dx=(x-e.cx)/Math.max(1,e.rx*sx),dy=(y-e.cy)/Math.max(1,e.ry*sy); return dx*dx+dy*dy<=1; }
function luminance(r,g,b){ return (0.2126*r+0.7152*g+0.0722*b)/255; }
function ensureLabels0951(){
  try{
    Object.assign(LABELS,{eye_candidate:'目候補', eye_pair:'目ペア'});
    Object.assign(COLORS,{eye_candidate:[80,200,255], eye_pair:[255,235,80]});
    if(typeof makePartButtons==='function') makePartButtons();
  }catch(e){}
}
ensureLabels0951();

function makeEyeScanROI0951(result){
  const img=result&&result.imgData, roi=result&&result.faceROI095; if(!img||!roi) return null;
  const w=img.width,h=img.height;
  // Keep Face ROI for review, but scan only upper-middle of it for eyes.
  const padX=roi.w*0.12;
  const x=roi.x+padX;
  const y=roi.y+roi.h*0.14;
  const rw=roi.w-padX*2;
  const rh=roi.h*0.43;
  return clampRect({x,y,w:rw,h:rh},w,h);
}
function buildEyeMask0951(result, scan){
  const img=result.imgData,w=img.width,h=img.height,d=img.data,fm=result.pre&&result.pre.finalMask;
  const mask=new Uint8Array(w*h);
  const x0=scan.x,y0=scan.y,x1=scan.x+scan.w,y1=scan.y+scan.h;
  let lumVals=[];
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const p=y*w+x; if(fm&&!fm[p])continue; const i=p*4; if(d[i+3]<12)continue; lumVals.push(luminance(d[i],d[i+1],d[i+2]));
  }
  lumVals.sort((a,b)=>a-b);
  const med=lumVals.length?lumVals[(lumVals.length/2)|0]:0.55;
  const darkCut=Math.max(0.16,med-0.095);
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const p=y*w+x; if(fm&&!fm[p])continue; const i=p*4; if(d[i+3]<12)continue;
    const r=d[i],g=d[i+1],b=d[i+2],lum=luminance(r,g,b),hsv=rgb2hsv(r,g,b),sat=hsv[1],val=hsv[2];
    const relY=(y-y0)/Math.max(1,scan.h), relX=Math.abs(x-scan.cx)/Math.max(1,scan.w/2);
    let score=0;
    if(lum<darkCut)score+=46; else if(lum<med-0.055)score+=30;
    if(val<0.50)score+=15;
    if(sat<0.55)score+=8;
    if(relY>.12&&relY<.82)score+=10;
    if(relX>.08&&relX<.88)score+=8;
    // Avoid taking too much of hair fringe at the very top.
    if(relY<.10)score-=18;
    if(score>=42) mask[p]=1;
  }
  return {mask:removeSmall(closeMask(mask,w,h,1),w,h,2,false), median_luminance:+med.toFixed(4), dark_cut:+darkCut.toFixed(4)};
}
function detectEyeCandidates0951(result){
  const scan=makeEyeScanROI0951(result); if(!scan) return {scan:null,candidates:[],pairs:[]};
  const ctx=buildEyeMask0951(result,scan), comps=connected(ctx.mask,result.imgData.width,result.imgData.height);
  const minArea=2,maxArea=Math.max(8,Math.round(scan.w*scan.h*0.10));
  const cands=[];
  for(const c of comps){
    if(c.area<minArea||c.area>maxArea)continue;
    const ar=c.w/Math.max(1,c.h), relX=Math.abs(c.cx-scan.cx)/Math.max(1,scan.w/2), relY=(c.cy-scan.y)/Math.max(1,scan.h);
    if(ar<0.18||ar>6.2)continue;
    if(relX>.95||relY<.03||relY>.92)continue;
    let score=0;
    score+=relY>.18&&relY<.76?28:12;
    score+=relX>.11&&relX<.86?24:10;
    score+=ar>.35&&ar<4.6?15:5;
    score+=c.area<maxArea*.55?14:5;
    score+=c.w>=2&&c.h>=2?12:4;
    cands.push({...c,score:Math.round(Math.min(100,score)),source:'eye_scan_roi'});
  }
  cands.sort((a,b)=>b.score-a.score||a.cy-b.cy);
  return {scan,candidates:cands.slice(0,12),pairs:makePairs0951(cands,scan)};
}
function makePairs0951(cands,scan){
  const pairs=[];
  for(let i=0;i<cands.length;i++)for(let j=i+1;j<cands.length;j++){
    const a=cands[i],b=cands[j],left=a.cx<b.cx?a:b,right=a.cx<b.cx?b:a;
    const gap=(right.cx-left.cx)/Math.max(1,scan.w);
    const yDiff=Math.abs(left.cy-right.cy)/Math.max(1,scan.h);
    const centerErr=Math.abs(((left.cx+right.cx)/2)-scan.cx)/Math.max(1,scan.w);
    const areaBal=Math.abs(Math.log((left.area+1)/(right.area+1)));
    // Relaxed compared with v0.9.5. Allows slanted faces and partial hair occlusion.
    if(gap<.08||gap>.70)continue;
    if(yDiff>.30)continue;
    if(centerErr>.26)continue;
    if(areaBal>1.35)continue;
    let score=0;
    score+=34-Math.round(yDiff*80);
    score+=26-Math.round(centerErr*85);
    score+=18-Math.round(Math.min(18,areaBal*12));
    score+=gap>.15&&gap<.54?16:8;
    score+=Math.round((left.score+right.score)/12);
    pairs.push({left,right,score:Math.max(0,Math.min(100,score)),source:'eye_scan_roi_relaxed'});
  }
  // Fallback: if exactly two plausible candidates exist, keep them as weak pair when separated enough.
  if(!pairs.length&&cands.length>=2){
    const sorted=cands.slice(0,6).sort((a,b)=>a.cx-b.cx);
    for(let i=0;i<sorted.length;i++)for(let j=sorted.length-1;j>i;j--){
      const left=sorted[i],right=sorted[j];
      const gap=(right.cx-left.cx)/Math.max(1,scan.w), yDiff=Math.abs(left.cy-right.cy)/Math.max(1,scan.h);
      if(gap>=.10&&gap<=.75&&yDiff<=.38){pairs.push({left,right,score:52,source:'eye_scan_roi_fallback'});i=999;break;}
    }
  }
  pairs.sort((a,b)=>b.score-a.score);
  return pairs.slice(0,4);
}
function ellipseFromPair0951(pair,scan,result){
  if(!pair) return result.faceEllipse095||result.faceEllipse||null;
  const cx=(pair.left.cx+pair.right.cx)/2;
  const eyeY=(pair.left.cy+pair.right.cy)/2;
  const gap=pair.right.cx-pair.left.cx;
  const rx=Math.max(scan.w*0.22,Math.min(scan.w*0.48,gap*0.98));
  const ry=Math.max(scan.h*0.55,Math.min((result.faceROI095?.h||scan.h)*0.34,scan.h*0.95));
  return {cx:+cx.toFixed(1),cy:+(eyeY+ry*.33).toFixed(1),rx:+rx.toFixed(1),ry:+ry.toFixed(1),source:pair.source||'eye_scan_roi'};
}
function tuneDetails0951(result){
  if(!result||!result.candidates) return;
  const faceEllipse=result.faceEllipse095||result.faceEllipse;
  let detail=0,faceDetail=0,demoted=0;
  for(const r of result.candidates){
    const old=r.label, ar=areaRatio(r,result.lines), orn=r.edgeTexture094?.ornament_detail_score||0;
    const nearFace=!!(faceEllipse&&pointInEllipse(r.cx,r.cy,faceEllipse,1.55,1.35));
    // Safer: only very tiny/high-detail ornaments stay as ornaments. Others become detail_candidate for review.
    if(['hair_ornament','body_ornament','shoe_ornament'].includes(r.label)){
      const keep = ar<0.00055 && orn>=86;
      if(!keep){
        r.previous_label=r.previous_label||old;
        r.label='detail_candidate';
        r.reason=(r.reason||'')+' / v0.9.5.1 ornament safely demoted';
        r.needsReview=true;
        r.conf=r.confidence=r.finalConfidence=Math.min(r.finalConfidence??r.confidence??r.conf??71,71);
        demoted++;
      }
    }
    // Face-detail: allow tiny hair_soft/detail fragments near face, but do not touch stable large hair/face/cloth.
    if(nearFace && ar<0.0045 && ['detail_candidate','unknown_soft','hair_soft','cloth_detail'].includes(r.label)){
      const e=r.edgeTexture094?.edge_density||0, ht=r.edgeTexture094?.hair_texture_score||0;
      if(e>0.32 || ht>=70 || orn>=70){
        r.previous_label=r.previous_label||old;
        r.label='face_detail';
        r.reason=(r.reason||'')+' / v0.9.5.1 relaxed face_detail';
        r.needsReview=true;
        r.conf=r.confidence=r.finalConfidence=Math.min(r.finalConfidence??r.confidence??r.conf??72,74);
      }
    }
    if(r.label==='detail_candidate') detail++;
    if(r.label==='face_detail') faceDetail++;
  }
  result.detailStats0951={detail_candidate:detail,face_detail:faceDetail,ornament_demoted:demoted};
}
function apply0951(result){
  if(!result) return result;
  const det=detectEyeCandidates0951(result);
  result.eyeScanROI0951=det.scan;
  // Prefer v0.9.5.1 candidates when they find at least as many as v0.9.5.
  const oldCands=result.eyeCandidates095||result.eyeCandidates||[];
  const bestCands=det.candidates.length>=oldCands.length?det.candidates:oldCands;
  const relaxedPairs=det.pairs&&det.pairs.length?det.pairs:(result.eyePairs095||result.eyePairs||[]);
  result.eyeCandidates0951=bestCands;
  result.eyePairs0951=relaxedPairs;
  result.eyeCandidates=bestCands;
  result.eyePairs=relaxedPairs;
  if(relaxedPairs.length){ result.faceEllipse0951=ellipseFromPair0951(relaxedPairs[0],det.scan,result); result.faceEllipse=result.faceEllipse0951; }
  else { result.faceEllipse0951=result.faceEllipse095||result.faceEllipse||null; }
  tuneDetails0951(result);
  result.reviewTargets0951=(result.candidates||[]).filter(r=>r.needsReview && !['soft_shell','bg_residue','background_residue'].includes(r.label));
  result.stats0951={
    eye_scan_roi:!!det.scan,
    eye_candidate_count:bestCands.length,
    eye_pair_count:relaxedPairs.length,
    pair_source:relaxedPairs[0]?.source||null,
    detail_candidate:result.detailStats0951?.detail_candidate||0,
    face_detail:result.detailStats0951?.face_detail||0,
    ornament_demoted:result.detailStats0951?.ornament_demoted||0
  };
  return result;
}

const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0951(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  if(state.result&&state.result.candidates){
    apply0951(state.result);
    try{ renderAll(); }catch(e){}
  }
}
window.analyze0951=analyze0951;

if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    if(state.result) apply0951(state.result);
    const all=(state.result?.candidates||[]).filter(r=>r.needsReview && !['soft_shell','bg_residue','background_residue'].includes(r.label));
    const order=['face_detail','detail_candidate','hair_soft','sheer_soft','unknown_soft','ambiguous_overlap','body_ornament','hair_ornament','face','hands','ears'];
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
    const scan=result.eyeScanROI0951, pairs=result.eyePairs0951||[], cands=result.eyeCandidates0951||[];
    ctx.save();
    if(scan){ ctx.strokeStyle='rgba(80,200,255,0.95)'; ctx.lineWidth=2; ctx.strokeRect(scan.x,scan.y,scan.w,scan.h); ctx.fillStyle='rgba(80,200,255,0.95)'; ctx.font='13px sans-serif'; ctx.fillText('EYE SCAN',scan.x,Math.max(14,scan.y-4)); }
    ctx.strokeStyle='rgba(255,235,80,0.95)'; ctx.lineWidth=2;
    for(const e of cands.slice(0,6)){ ctx.strokeRect(e.minx,e.miny,e.w,e.h); }
    if(pairs[0]){ ctx.strokeStyle='rgba(120,255,120,0.95)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(pairs[0].left.cx,pairs[0].left.cy); ctx.lineTo(pairs[0].right.cx,pairs[0].right.cy); ctx.stroke(); }
    ctx.restore();
  };
}

try{
  document.title='Sprite Studio Region Viewer v0.9.5.1';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.5.1';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.5.1: eye_scan_roi・緩めのeye_pair・detail_candidate安全化を追加。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、AIなしで補正しやすい候補Regionを作る。v0.9.5.1は目候補ペアリングと細部候補の安全化版です。';
  analyze=analyze0951;
  const run=safeQS('run'); if(run) run.onclick=analyze0951;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0951;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze0951();};});
}catch(e){}

if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_0951;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0951;
    m.face_detection={...(m.face_detection||{}),
      eye_candidate_count:state.result?.eyeCandidates0951?.length||0,
      eye_pair_count:state.result?.eyePairs0951?.length||0,
      face_ellipse:state.result?.faceEllipse0951||state.result?.faceEllipse||null,
      face_roi:state.result?.faceROI095||null,
      eye_scan_roi:state.result?.eyeScanROI0951||null,
      eye_candidates:(state.result?.eyeCandidates0951||[]).map(e=>({bbox:[e.minx,e.miny,e.w,e.h],cx:+e.cx.toFixed(1),cy:+e.cy.toFixed(1),area:e.area,score:e.score,source:e.source||'unknown'})),
      eye_pairs:(state.result?.eyePairs0951||[]).map(p=>({left:[p.left.minx,p.left.miny,p.left.w,p.left.h],right:[p.right.minx,p.right.miny,p.right.w,p.right.h],score:p.score,source:p.source}))
    };
    m.review_v0951={
      eye_scan_roi:true,
      relaxed_eye_pair:true,
      detail_candidate_safety:true,
      review_target_count:state.result?.reviewTargets0951?.length||0,
      review_labels:(state.result?.reviewTargets0951||[]).map(r=>({id:r.mid||r.id,label:r.label,confidence:r.confidence||r.conf||0}))
    };
    m.analysis_v0951={stats:state.result?.stats0951||null};
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
        p.analysis_v0951={near_eye_scan:!!(state.result?.eyeScanROI0951 && live.cx>=state.result.eyeScanROI0951.x && live.cx<=state.result.eyeScanROI0951.x+state.result.eyeScanROI0951.w && live.cy>=state.result.eyeScanROI0951.y && live.cy<=state.result.eyeScanROI0951.y+state.result.eyeScanROI0951.h)};
      }
    }
    return m;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_5_1.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.5.1 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_5_1.png','image/png'));};
}catch(e){}

if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log||!state.result)return;
    const st=state.result.stats0951||{};
    log.textContent += `\n[v0.9.5.1 eye/detail tuning]\neye_scan_roi=${st.eye_scan_roi?'ON':'OFF'} / eye_candidates=${st.eye_candidate_count||0} / eye_pairs=${st.eye_pair_count||0} / pair_source=${st.pair_source||'-'} / detail=${st.detail_candidate||0} / face_detail=${st.face_detail||0} / demoted=${st.ornament_demoted||0}\n`;
  };
}
})();
