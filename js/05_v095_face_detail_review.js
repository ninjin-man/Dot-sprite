// ===== v0.9.5 patch: face ROI / eye candidates / detail_candidate / review zoom =====
(function(){
'use strict';
const VERSION_095='0.9.5';
const PREPROCESSOR_VERSION_095='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp01(v){ return Math.max(0,Math.min(1,v)); }
function personArea(lines){ return (lines&&lines.bbox&&lines.bbox.area) || Math.max(1,(state.w||1)*(state.h||1)); }
function areaRatio(r,lines){ return (r.area||0)/Math.max(1,personArea(lines)); }
function pointInEllipse(x,y,e,sx=1,sy=1){ if(!e) return false; const dx=(x-e.cx)/Math.max(1,e.rx*sx), dy=(y-e.cy)/Math.max(1,e.ry*sy); return dx*dx+dy*dy<=1; }
function rectUnion(a,b){ if(!a) return b?{...b}:null; if(!b) return {...a}; const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y); const r=Math.max(a.x+a.w,b.x+b.w), bt=Math.max(a.y+a.h,b.y+b.h); return {x,y,w:r-x,h:bt-y}; }
function rectFromRegion(r){ return {x:r.minx,y:r.miny,w:r.w,h:r.h}; }
function expandRect(rect,fx,fy,w,h){ if(!rect) return null; const cx=rect.x+rect.w/2, cy=rect.y+rect.h/2; const rw=rect.w*fx, rh=rect.h*fy; return {x:Math.max(0,Math.floor(cx-rw/2)), y:Math.max(0,Math.floor(cy-rh/2)), w:Math.min(w,Math.ceil(rw)), h:Math.min(h,Math.ceil(rh))}; }
function clampRect(rect,w,h){ if(!rect) return null; let x=Math.max(0,Math.floor(rect.x)), y=Math.max(0,Math.floor(rect.y)); let rw=Math.min(w-x,Math.max(1,Math.floor(rect.w))), rh=Math.min(h-y,Math.max(1,Math.floor(rect.h))); return {x,y,w:rw,h:rh}; }
function luminance(r,g,b){ return (0.2126*r+0.7152*g+0.0722*b)/255; }
function ensureLabels095(){
  try{
    Object.assign(LABELS,{ detail_candidate:'細部候補', face_detail:'顔細部', eye_candidate:'目候補' });
    Object.assign(COLORS,{ detail_candidate:[255,135,95], face_detail:[255,110,150], eye_candidate:[90,190,255] });
    if(typeof makePartButtons==='function') makePartButtons();
  }catch(e){}
}
ensureLabels095();

function deriveFaceROI095(result){
  if(!result || !result.lines || !result.imgData) return null;
  const {lines}=result, w=result.imgData.width, h=result.imgData.height;
  const faces=(result.candidates||[]).filter(r=>r.label==='face');
  const skins=(result.candidates||[]).filter(r=>['face','skin','skin_candidate'].includes(r.label) && (r.visualZone==='face'||r.visualZone==='head'));
  let roi=null;
  for(const r of (faces.length?faces:skins.slice(0,4))){ roi=rectUnion(roi,rectFromRegion(r)); }
  if(!roi){
    const bw=Math.max(18,Math.round((lines.bbox?.w||w)*0.32));
    roi={x:Math.round((lines.cx||w/2)-bw/2), y:Math.max(0,lines.faceTop-4), w:bw, h:Math.max(18,(lines.faceBot-lines.faceTop)+10)};
  }
  roi=expandRect(roi,1.48,1.42,w,h);
  roi=clampRect(roi,w,h);
  roi.cx=roi.x+roi.w/2; roi.cy=roi.y+roi.h/2; roi.source=faces.length?'face-region':'baseline';
  return roi;
}

function buildEyeMask095(result, roi){
  const img=result.imgData, w=img.width, h=img.height, d=img.data, fm=result.pre?.finalMask;
  const mask=new Uint8Array(w*h);
  let sumLum=0,n=0;
  const x0=Math.max(0,roi.x), x1=Math.min(w,roi.x+roi.w), y0=Math.max(0,roi.y), y1=Math.min(h,roi.y+roi.h);
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const p=y*w+x; if(fm && !fm[p]) continue; const i=p*4; if(d[i+3]<12) continue; sumLum+=luminance(d[i],d[i+1],d[i+2]); n++;
  }
  const meanLum=n?sumLum/n:0.65;
  const eyeBandTop = y0 + roi.h*0.14, eyeBandBot = y0 + roi.h*0.68;
  const cx=roi.cx;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
    const p=y*w+x; if(fm && !fm[p]) continue; const i=p*4; if(d[i+3]<12) continue;
    if(y<eyeBandTop || y>eyeBandBot) continue;
    const relX=Math.abs(x-cx)/Math.max(1,roi.w/2); if(relX>.88) continue;
    const r=d[i],g=d[i+1],b=d[i+2];
    const lum=luminance(r,g,b); const hsv=rgb2hsv(r,g,b); const sat=hsv[1], val=hsv[2];
    let score=0;
    if(lum<meanLum-0.11) score+=45; else if(lum<meanLum-0.07) score+=28;
    if(val<0.43) score+=18;
    if(sat<0.46) score+=10;
    if(r<95&&g<95&&b<95) score+=15;
    if(relX>.10&&relX<.75) score+=12;
    if(y<y0+roi.h*0.52) score+=10;
    if(score>=48) mask[p]=1;
  }
  const cleaned=removeSmall(closeMask(mask,w,h,1),w,h,3,false);
  return {mask:cleaned,meanLum:+meanLum.toFixed(4)};
}

function detectEyes095(result){
  const roi=deriveFaceROI095(result); if(!roi) return {roi:null,eyeCandidates:[],eyePairs:[],faceEllipse:null};
  const ctx=buildEyeMask095(result,roi), w=result.imgData.width, h=result.imgData.height;
  const comps=connected(ctx.mask,w,h);
  const maxArea=Math.max(10,Math.round(roi.w*roi.h*0.08));
  const minArea=Math.max(2,Math.round(roi.w*roi.h*0.002));
  const cand=[];
  for(const c of comps){
    if(c.area<minArea||c.area>maxArea) continue;
    const ar=c.w/Math.max(1,c.h), relY=(c.cy-roi.y)/Math.max(1,roi.h), relX=Math.abs(c.cx-roi.cx)/Math.max(1,roi.w/2);
    if(relY<.08||relY>.70) continue;
    if(relX<.08||relX>.82) continue;
    if(ar<.25||ar>5.2) continue;
    let score=0;
    score += relY>.18&&relY<.55 ? 30 : 10;
    score += relX>.20&&relX<.72 ? 24 : 8;
    score += c.w>=2&&c.h>=2 ? 16 : 4;
    score += c.area<=maxArea*.45 ? 12 : 3;
    score += ar>.5&&ar<3.4 ? 12 : 4;
    cand.push({...c,score:Math.round(Math.min(100,score)),meanLum:ctx.meanLum});
  }
  cand.sort((a,b)=>b.score-a.score||a.cy-b.cy);
  const pairs=[];
  for(let i=0;i<cand.length;i++) for(let j=i+1;j<cand.length;j++){
    const a=cand[i], b=cand[j];
    const left=a.cx<b.cx?a:b, right=a.cx<b.cx?b:a;
    if(left.cx>=roi.cx || right.cx<=roi.cx) continue;
    const yDiff=Math.abs(left.cy-right.cy)/Math.max(1,roi.h);
    const areaBalance=Math.abs(Math.log((left.area+1)/(right.area+1)));
    const centerError=Math.abs(((left.cx+right.cx)/2)-roi.cx)/Math.max(1,roi.w);
    const gap=(right.cx-left.cx)/Math.max(1,roi.w);
    if(yDiff>.16||areaBalance>.9||centerError>.16||gap<.12||gap>.62) continue;
    let score=0;
    score += 40 - Math.round(yDiff*140);
    score += 24 - Math.round(centerError*110);
    score += 18 - Math.round(Math.min(18,areaBalance*20));
    score += gap>.18&&gap<.46 ? 14 : 6;
    score += Math.round((left.score+right.score)/10);
    const pair={left,right,score:Math.max(0,Math.min(100,score))};
    pairs.push(pair);
  }
  pairs.sort((a,b)=>b.score-a.score);
  let ellipse=null;
  if(pairs.length){
    const p=pairs[0], cx=(p.left.cx+p.right.cx)/2, cy=(p.left.cy+p.right.cy)/2 + roi.h*0.12;
    const gap=(p.right.cx-p.left.cx), rx=Math.max(roi.w*0.22, Math.min(roi.w*0.46, gap*0.92));
    const ry=Math.max(roi.h*0.26, Math.min(roi.h*0.44, roi.h*0.34));
    ellipse={cx:+cx.toFixed(1),cy:+cy.toFixed(1),rx:+rx.toFixed(1),ry:+ry.toFixed(1),source:'eye_pair'};
  }else{
    ellipse={cx:+roi.cx.toFixed(1),cy:+(roi.y+roi.h*0.48).toFixed(1),rx:+(roi.w*0.34).toFixed(1),ry:+(roi.h*0.34).toFixed(1),source:roi.source||'baseline'};
  }
  return {roi, eyeCandidates:cand.slice(0,10), eyePairs:pairs.slice(0,4), faceEllipse:ellipse, eyeMaskMeanLum:ctx.meanLum};
}

function relabelDetails095(result){
  if(!result||!result.candidates) return;
  const faceEllipse=result.faceEllipse095||result.faceEllipse||null;
  let detailCount=0, faceDetailCount=0;
  for(const r of result.candidates){
    const old=r.label;
    const orn=(r.edgeTexture094?.ornament_detail_score||0), edgeD=(r.edgeTexture094?.edge_density||0), hairT=(r.edgeTexture094?.hair_texture_score||0);
    const ar=areaRatio(r,result.lines);
    const nearFace = faceEllipse && pointInEllipse(r.cx,r.cy,faceEllipse,1.40,1.22);
    if(['hair_ornament','body_ornament','shoe_ornament'].includes(r.label)){
      if(orn<84 || ar>.005){
        r.previous_label=r.previous_label||old;
        r.label='detail_candidate';
        r.reason=(r.reason||'')+' / v0.9.5 ornament->detail_candidate';
        r.needsReview=true;
        r.conf=r.confidence=r.finalConfidence=Math.min(r.finalConfidence??r.confidence??r.conf??72,72);
      }
    }
    if(nearFace && ar<.006 && ['detail_candidate','unknown_soft','hair_soft','cloth_detail'].includes(r.label)){
      if(edgeD>.15 || hairT>=56 || orn>=62){
        r.previous_label=r.previous_label||old;
        r.label='face_detail';
        r.reason=(r.reason||'')+' / v0.9.5 near face detail';
        r.needsReview=true;
        r.conf=r.confidence=r.finalConfidence=Math.min(r.finalConfidence??r.confidence??r.conf??70,74);
      }
    }
    if(r.label==='detail_candidate') detailCount++;
    if(r.label==='face_detail') faceDetailCount++;
  }
  result.detailStats095={detail_candidate:detailCount, face_detail:faceDetailCount};
}

function applyFaceDetail095(result){
  if(!result||!result.imgData||!result.lines) return result;
  const det=detectEyes095(result);
  result.faceROI095=det.roi;
  result.eyeCandidates095=det.eyeCandidates;
  result.eyePairs095=det.eyePairs;
  result.faceEllipse095=det.faceEllipse;
  result.eyeCandidates=det.eyeCandidates;
  result.eyePairs=det.eyePairs;
  result.faceEllipse=det.faceEllipse;
  result.faceDetectStats095={eye_candidate_count:det.eyeCandidates.length, eye_pair_count:det.eyePairs.length, eye_mask_mean_luminance:det.eyeMaskMeanLum};
  relabelDetails095(result);
  result.reviewTargets095=(result.candidates||[]).filter(r=>r.needsReview || ['detail_candidate','face_detail'].includes(r.label));
  result.reviewStats095={
    face_detail:(result.candidates||[]).filter(r=>r.label==='face_detail').length,
    detail_candidate:(result.candidates||[]).filter(r=>r.label==='detail_candidate').length,
    eye_candidate_count:det.eyeCandidates.length,
    eye_pair_count:det.eyePairs.length
  };
  return result;
}

const prevAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze095(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  if(state.result && state.result.candidates){
    applyFaceDetail095(state.result);
    try{ renderAll(); }catch(e){}
  }
}
window.analyze095=analyze095;

function overlayReviewZoom095(){
  const c=safeQS('reviewCanvas'), ctx=c&&c.getContext&&c.getContext('2d');
  const result=state.result, current=state.review&&state.review.current, img=result&&result.imgData;
  if(!ctx||!current||!img) return;
  const faceEllipse=result.faceEllipse095||result.faceEllipse, faceROI=result.faceROI095;
  // Full-view overlays (safe for freehand because no coordinate remap)
  if(faceEllipse){
    ctx.save();
    ctx.strokeStyle='rgba(88,166,255,0.95)'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.ellipse(faceEllipse.cx,faceEllipse.cy,faceEllipse.rx,faceEllipse.ry,0,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='rgba(88,166,255,0.95)'; ctx.font='14px sans-serif'; ctx.fillText('FACE', faceEllipse.cx-faceEllipse.rx, Math.max(14, faceEllipse.cy-faceEllipse.ry-4));
    const pairs=result.eyePairs095||[]; const eyes=(pairs[0]?[pairs[0].left,pairs[0].right]:(result.eyeCandidates095||[]).slice(0,2));
    ctx.strokeStyle='rgba(255,230,90,0.95)';
    for(const e of eyes){ if(!e) continue; ctx.strokeRect(e.minx,e.miny,e.w,e.h); }
    ctx.restore();
  }
  // Inset zooms: face and current detail.
  const sourceCanvas=imageDataToCanvas(img);
  const insetW=Math.max(120,Math.round(c.width*0.28)), insetH=Math.max(100,Math.round(c.height*0.22));
  const margin=8;
  const faceRect=faceROI ? clampRect(faceROI,img.width,img.height) : null;
  const detailRect=clampRect(expandRect(rectFromRegion(current),2.1,2.1,img.width,img.height),img.width,img.height);
  function drawInset(rect,dx,dy,title,stroke){
    if(!rect) return;
    ctx.save();
    ctx.fillStyle='rgba(8,12,18,0.88)'; ctx.fillRect(dx,dy,insetW,insetH); ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.strokeRect(dx+.5,dy+.5,insetW-1,insetH-1);
    ctx.drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, dx+4, dy+22, insetW-8, insetH-26);
    ctx.fillStyle='#e8eef8'; ctx.font='13px sans-serif'; ctx.fillText(title,dx+8,dy+15);
    ctx.restore();
  }
  drawInset(faceRect, c.width-insetW-margin, margin, 'Face Zoom', '#58a6ff');
  drawInset(detailRect, c.width-insetW-margin, insetH+margin*2, 'Detail Zoom', '#ff4f68');
}

if(typeof drawReviewCanvas==='function'){
  const prevDrawReviewCanvas=drawReviewCanvas;
  drawReviewCanvas=function(){ prevDrawReviewCanvas(); overlayReviewZoom095(); };
}

if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    const all=(state.result?.candidates||[]).filter(r=>r.needsReview && !['soft_shell','bg_residue','background_residue'].includes(r.label));
    const order=['face_detail','detail_candidate','face','hair_ornament','body_ornament','hair_soft','sheer_soft','unknown_soft','ambiguous_overlap','hands','ears'];
    const pri=(r)=>{ const i=order.indexOf(r.label); return i<0?99:i; };
    return all.sort((a,b)=>pri(a)-pri(b)||b.area-a.area).slice(0,10);
  };
}

if(typeof showReviewItem==='function'){
  const prevShowReviewItem=showReviewItem;
  showReviewItem=function(){
    prevShowReviewItem();
    const r=state.review&&state.review.current, result=state.result;
    if(!r||!result) return;
    const meta=safeQS('reviewMeta'); if(!meta) return;
    const facePairs=result.eyePairs095?.length||0, eyeCands=result.eyeCandidates095?.length||0;
    meta.textContent += ` / faceROI ${result.faceROI095 ? Math.round(result.faceROI095.w)+'×'+Math.round(result.faceROI095.h) : '-'} / eyeCand ${eyeCands} / eyePair ${facePairs}`;
  };
}

try{
  document.title='Sprite Studio Region Viewer v0.9.5';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.5';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.5: 顔ROI・簡易目候補検出・detail_candidate整理・レビュー用Face/Detail Zoomを追加。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、AIなしで補正しやすい候補Regionを作る。v0.9.5は顔まわりの再確認とレビュー強化版です。';
  analyze=analyze095;
  const run=safeQS('run'); if(run) run.onclick=analyze095;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze095;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze095();};});
}catch(e){}

if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_095;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_095;
    m.review_perf={...(m.review_perf||{}), face_zoom:true, detail_zoom:true};
    m.face_detection={
      eye_candidate_count:state.result?.eyeCandidates095?.length||0,
      eye_pair_count:state.result?.eyePairs095?.length||0,
      face_ellipse:state.result?.faceEllipse095||null,
      face_roi:state.result?.faceROI095||null,
      baseline_source:state.result?.faceROI095?.source||state.result?.lines?.source||'baseline'
    };
    m.review_v095={
      face_detail_review:true,
      detail_candidate_relabel:true,
      review_target_count:state.result?.reviewTargets095?.length||0,
      review_labels:(state.result?.reviewTargets095||[]).map(r=>({id:r.mid||r.id,label:r.label,confidence:r.confidence||r.conf||0}))
    };
    m.analysis_v095={
      face_roi:true,
      eye_candidate_detector:true,
      eye_pairing:true,
      detail_candidate:true,
      stats:{...(state.result?.reviewStats095||{}), ...(state.result?.faceDetectStats095||{}), ...(state.result?.detailStats095||{})}
    };
    m.region=m.region||{};
    const hold=new Set(['unknown','needs_review','unknown_soft','soft_edge','ambiguous_overlap','hair_soft','sheer_soft','detail_candidate','face_detail']);
    m.region.review_after=(state.result?.candidates||[]).filter(r=>hold.has(r.label)).length;
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(!live) continue;
        p.label=live.label; p.label_ja=LABELS[live.label]||live.label;
        p.confidence=live.confidence||live.conf||p.confidence;
        p.final_confidence=live.finalConfidence??p.final_confidence;
        p.needs_review=!!live.needsReview;
        p.previous_label=live.previous_label||p.previous_label||null;
        p.reject_reason=live.reject_reason||p.reject_reason||[];
        p.reason=live.reason||p.reason;
        p.analysis_v095={near_face:!!(state.result?.faceEllipse095 && pointInEllipse(live.cx,live.cy,state.result.faceEllipse095,1.4,1.22)), eye_candidate:false};
      }
    }
    return m;
  };
}

try{
  const json=safeQS('json'); if(json) json.onclick=()=>{ if(!state.result) return; downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_5.json','application/json'); };
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{ let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean); let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part']; let W=960,H=1850,c=document.createElement('canvas'); c.width=W;c.height=H; let ctx=c.getContext('2d'); ctx.fillStyle='#0f1520'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#e8eef8'; ctx.font='26px sans-serif'; ctx.fillText('Sprite Studio Region Viewer v0.9.5 Summary',20,36); let cellW=290,cellH=320; for(let i=0;i<cards.length;i++){ let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35); ctx.fillStyle='#202a3a'; ctx.fillRect(x,y,cellW,32); ctx.fillStyle='#e8eef8'; ctx.font='16px sans-serif'; ctx.fillText(titles[i],x+8,y+22); ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width)); } c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_5.png','image/png')); };
}catch(e){}

if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log||!state.result) return;
    const st=state.result.reviewStats095||{}, face=state.result.faceDetectStats095||{};
    log.textContent += `\n[v0.9.5 face/detail]\nface_roi=${state.result.faceROI095 ? 'ON' : 'OFF'} / eye_candidates=${face.eye_candidate_count||0} / eye_pairs=${face.eye_pair_count||0} / face_detail=${st.face_detail||0} / detail_candidate=${st.detail_candidate||0}\n`;
  };
}
})();
