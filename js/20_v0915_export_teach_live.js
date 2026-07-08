// ===== v0.9.15 fix: compact export + live teaching application =====
(function(){
'use strict';
const VERSION_0915='0.9.15-export-teach-live';
const PREPROCESSOR_VERSION_0915='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline+phase1-review-policy-baseline+phase2-confirm-small-parts+phase3-structure-graph+phase4-hair-cloth-semantics+phase5-pixel-simplification+compact-export+live-teach';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function box(r){ return {x:r.minx??0,y:r.miny??0,w:r.w??0,h:r.h??0,maxx:r.maxx??((r.minx??0)+(r.w??0)-1),maxy:r.maxy??((r.miny??0)+(r.h??0)-1),cx:r.cx??((r.minx??0)+(r.w??0)/2),cy:r.cy??((r.miny??0)+(r.h??0)/2)}; }
function rgbHex(m){ m=m||[0,0,0]; return '#'+[m[0]||0,m[1]||0,m[2]||0].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join(''); }
function quant(n,d=2){ return Number.isFinite(+n)?+(+n).toFixed(d):n; }
function countBy(list,keyFn){ const out={}; for(const x of list||[]){ const k=keyFn(x); out[k]=(out[k]||0)+1; } return out; }
function featureMini0915(f){
  if(!f) return null;
  return {
    label:f.label||null,
    zone:f.visual_zone||f.visualZone||null,
    ox:quant(f.cx_norm??f.x_norm??0,3),
    oy:quant(f.cy_norm??f.y_norm??0,3),
    ar:quant(f.aspect??0,3),
    area:quant(f.area_ratio??0,4),
    color:f.mean_rgb?rgbHex(f.mean_rgb):null
  };
}
function partMini0915(r){
  const b=box(r);
  return {
    id:r.mid||r.id||null,
    label:r.label||'unknown',
    ja:labelName(r.label||'unknown'),
    conf:Math.round(r.finalConfidence??r.confidence??r.conf??0),
    review:r.reviewType0910||'none',
    action:r.pixelAction0914||null,
    parent:r.pixelParent0914||null,
    role:r.structureRole0912||null,
    zone:r.structureZone0912||r.visualZone||r.originZone||null,
    bbox:[Math.round(b.x),Math.round(b.y),Math.round(b.w),Math.round(b.h)],
    area:Math.round(r.area||0),
    color:rgbHex(r.mean),
    reason:(r.pixelReason0914||r.phase4Semantic0913||r.phase2Kind0911||r.reason||'').slice(0,90)
  };
}
function compactMetadata0915(){
  if(!state.result) return {version:VERSION_0915,status:'no_result'};
  const res=state.result, pre=res.pre||{}, lines=res.lines||{}, candidates=res.candidates||[];
  const px=res.pixelSimplify0914||{};
  const pol=res.reviewPolicy0914||res.reviewPolicy0913||res.reviewPolicy0912||res.reviewPolicy0911||res.reviewPolicy0910||{};
  return {
    version:VERSION_0915,
    mode:'compact',
    size:{w:state.w,h:state.h},
    preprocessor:{
      version:PREPROCESSOR_VERSION_0915,
      score:pre.score,
      bg:pre.bg,
      bbox:pre.bbox,
      ratios:{
        foreground:quant(pre.layers?.finalRatio,4),
        core:quant(pre.layers?.coreRatio,4),
        soft:quant(pre.layers?.softRatio,4)
      }
    },
    lines:{
      faceTop:lines.faceTop, faceBot:lines.faceBot, neck:lines.neckLine||lines.neck,
      shoulder:lines.shoulder, waist:lines.waist, crotch:lines.crotch, ankle:lines.ankle, cx:lines.cx,
      shoulderLeft:lines.shoulderLeft, shoulderRight:lines.shoulderRight
    },
    quality:{
      ok:!!(pol.ok ?? (pol.blocking_count===0)),
      blocking:pol.blocking_count||0,
      candidate:pol.candidate_count||0,
      info:pol.info_count||0,
      warnings:pol.warnings||px.warnings||[]
    },
    counts:{
      labels:countBy(candidates,r=>r.label||'unknown'),
      pixel_actions:countBy(candidates,r=>r.pixelAction0914||'none'),
      review_types:countBy(candidates,r=>r.reviewType0910||'none')
    },
    pixel_simplify:{
      status:px.status||'not_run',
      target:px.target_size||{w:32,h:32},
      scale:px.scale||null,
      silhouette:px.silhouette||null,
      palette:(px.palette||[]).slice(0,12)
    },
    parts:candidates.map(partMini0915),
    memory:{
      sample_count:((typeof loadMemory==='function'?loadMemory():{samples:[]}).samples||[]).length,
      key:typeof MEMORY_KEY!=='undefined'?MEMORY_KEY:null
    },
    export_note:'compact export excludes raw pixels, full features, large score maps, and debug internals'
  };
}
function fullMetadataSafe0915(){
  // Full export is still available but stripped of the largest fields.
  const raw=(typeof metadata092==='function')?metadata092():compactMetadata0915();
  const seen=new WeakSet();
  function clean(v){
    if(v==null) return v;
    if(typeof v!=='object') return v;
    if(seen.has(v)) return '[circular]';
    seen.add(v);
    if(Array.isArray(v)){
      if(v.length>300 && typeof v[0]==='number') return `[numeric_array:${v.length}]`;
      return v.slice(0,500).map(clean);
    }
    const out={};
    for(const [k,val] of Object.entries(v)){
      if(['pixels','data','mask','finalMask','core','soft','shadow','strong','mid','weak','labels','labD','alphaHint','features'].includes(k)){
        if(Array.isArray(val) || (val && typeof val.length==='number')) out[k]=`[omitted:${val.length||'object'}]`;
        else out[k]='[omitted]';
        continue;
      }
      if(k==='parts' && Array.isArray(val)){
        out[k]=val.map(p=>({
          id:p.id,label:p.label,label_ja:p.label_ja,confidence:p.confidence,
          needs_review:p.needs_review,review_type:p.review_type_v0910,
          bbox:p.bbox,area:p.area,mean_color:p.mean_color,
          pixel_action_v0914:p.pixel_action_v0914,pixel_parent_v0914:p.pixel_parent_v0914,
          structure_role_v0912:p.structure_role_v0912,phase4_semantic_v0913:p.phase4_semantic_v0913
        }));
        continue;
      }
      out[k]=clean(val);
    }
    return out;
  }
  const cleaned=clean(raw);
  cleaned.mode='full_safe';
  cleaned.export_note='large raw arrays and feature blobs are omitted';
  return cleaned;
}
function compactMemory0915(){
  const mem=(typeof loadMemory==='function'?loadMemory():{samples:[]});
  const samples=(mem.samples||[]).slice(-120).map(s=>({
    id:s.id, part_id:s.part_id, auto_label:s.auto_label, final_label:s.final_label,
    feedback_type:s.feedback_type, confidence_before:s.confidence_before,
    user_circle:s.user_circle||null,
    feature:featureMini0915(s.features)
  }));
  return {version:VERSION_0915, mode:'compact_memory', sample_count:(mem.samples||[]).length, exported_count:samples.length, samples};
}
function downloadJson0915(obj,name){
  if(typeof downloadBlob==='function') downloadBlob(JSON.stringify(obj,null,2),name,'application/json');
}
function ellipseContains0915(x,y,e){
  if(!e||!e.rx||!e.ry) return false;
  const dx=(x-e.cx)/Math.max(1,e.rx), dy=(y-e.cy)/Math.max(1,e.ry);
  return dx*dx+dy*dy<=1;
}
function applyLiveCorrection0915(region,type,ellipse=null){
  if(!state.result || !region) return {ok:false,reason:'no_result_or_region'};
  const res=state.result, candidates=res.candidates||[];
  const before={label:region.label,conf:region.confidence??region.conf??0,review:region.reviewType0910||'none'};
  if(type==='accepted'){
    region.needsReview=false;
    region.reviewType0910='none';
    region.candidateReview0910=false;
    region.blockingReview0910=false;
    region.qualityBlocking0910=false;
    region.finalConfidence=region.confidence=region.conf=Math.max(88,region.confidence??region.conf??0);
    region.liveTeachApplied0915='accepted_now';
  }else if(type==='rejected'){
    region.needsReview=false;
    region.reviewType0910='info';
    region.infoReview0910=true;
    region.candidateReview0910=false;
    region.blockingReview0910=false;
    region.qualityBlocking0910=false;
    region.pixelAction0914='omit';
    region.pixelReason0914='user rejected live';
    region.finalConfidence=region.confidence=region.conf=Math.min(25,region.confidence??region.conf??25);
    region.liveTeachApplied0915='rejected_now';
  }else if(type==='skipped'){
    region.reviewType0910='candidate';
    region.candidateReview0910=true;
    region.qualityBlocking0910=false;
    region.liveTeachApplied0915='skipped_now';
  }else if(type==='corrected_by_circle' && ellipse){
    const baseLabel=region.label;
    let affected=0, insideArea=0;
    for(const r of candidates){
      let hit=0, total=0;
      if(Array.isArray(r.pixels) && r.pixels.length){
        const step=Math.max(1,Math.ceil(r.pixels.length/1000));
        for(let i=0;i<r.pixels.length;i+=step){
          const p=r.pixels[i], x=p%state.w, y=(p/state.w)|0;
          total++;
          if(ellipseContains0915(x,y,ellipse)) hit++;
        }
      }else{
        const b=box(r);
        total=1;
        hit=ellipseContains0915(b.cx,b.cy,ellipse)?1:0;
      }
      const ratio=total?hit/total:0;
      if(r===region || ratio>=0.18){
        if(r!==region){
          r.liveTeachSourceLabel0915=r.label;
          r.label=baseLabel;
        }
        r.needsReview=false;
        r.reviewType0910='none';
        r.candidateReview0910=false;
        r.blockingReview0910=false;
        r.qualityBlocking0910=false;
        r.finalConfidence=r.confidence=r.conf=Math.max(78,r.confidence??r.conf??0);
        r.liveTeachApplied0915='circle_label_applied';
        affected++;
        insideArea+=r.area||0;
      }
    }
    region.userCircle0915={cx:+ellipse.cx.toFixed(2),cy:+ellipse.cy.toFixed(2),rx:+ellipse.rx.toFixed(2),ry:+ellipse.ry.toFixed(2)};
    region.liveTeachAffected0915=affected;
    region.liveTeachInsideArea0915=insideArea;
  }
  if(typeof pixelSimplify0914==='function'){
    try{ pixelSimplify0914(res); }catch(e){}
  }
  // Refresh simple review policy after live correction.
  const blocking=candidates.filter(r=>r.needsReview||r.reviewType0910==='blocking');
  const candidate=candidates.filter(r=>r.reviewType0910==='candidate');
  const info=candidates.filter(r=>r.reviewType0910==='info');
  const pol={
    enabled:true,status:blocking.length?'needs_blocking_review':'ok',
    total:candidates.length,blocking_count:blocking.length,candidate_count:candidate.length,info_count:info.length,
    warnings:blocking.length?['blocking_review_exists']:[],ok:blocking.length===0,live_teach_reapplied:true
  };
  res.reviewPolicy0915=pol; res.reviewPolicy0914=pol; res.reviewPolicy0913=pol; res.reviewPolicy0912=pol; res.reviewPolicy0911=pol; res.reviewPolicy0910=pol;
  res.reviewTargets0910=blocking.concat(candidate).sort((a,b)=>(b.area||0)-(a.area||0));
  const after={label:region.label,conf:region.confidence??region.conf??0,review:region.reviewType0910||'none'};
  return {ok:true,type,before,after};
}
function showLiveMessage0915(msg){
  const hint=safeQS('reviewHint');
  if(hint) hint.textContent=msg;
  const log=safeQS('log');
  if(log) log.textContent += '\n[v0.9.15] '+msg+'\n';
}
function nextReviewLive0915(){
  if(!state.review) return;
  if(typeof renderAll==='function') renderAll();
  state.review.queue = (typeof makeReviewQueue==='function') ? makeReviewQueue() : [];
  state.review.index = 0;
  if(!state.review.queue.length){
    const panel=safeQS('reviewPanel'); if(panel) panel.style.display='none';
    showLiveMessage0915('その場で反映しました。現在のレビュー対象はありません。');
    return;
  }
  if(typeof showReviewItem==='function') showReviewItem();
}
function installLiveTeach0915(){
  const accept=safeQS('reviewAccept'), reject=safeQS('reviewReject'), skip=safeQS('reviewSkip');
  if(accept) accept.onclick=()=>{
    const r=state.review?.current; if(!r) return;
    if(typeof saveFeedback==='function') saveFeedback(r,'accepted');
    const res=applyLiveCorrection0915(r,'accepted');
    showLiveMessage0915('合っている → 現在の解析結果へ反映しました。'+JSON.stringify(res.after));
    nextReviewLive0915();
  };
  if(reject) reject.onclick=()=>{
    const r=state.review?.current; if(!r) return;
    if(typeof saveFeedback==='function') saveFeedback(r,'rejected');
    const res=applyLiveCorrection0915(r,'rejected');
    showLiveMessage0915('違う → この部位を省略/参考扱いに変更しました。'+JSON.stringify(res.after));
    nextReviewLive0915();
  };
  if(skip) skip.onclick=()=>{
    const r=state.review?.current; if(!r) return;
    if(typeof saveFeedback==='function') saveFeedback(r,'skipped');
    applyLiveCorrection0915(r,'skipped');
    showLiveMessage0915('あとで → 候補確認として残しました。');
    nextReviewLive0915();
  };
  const c=safeQS('reviewCanvas');
  if(c && !c.dataset.liveTeach0915){
    c.dataset.liveTeach0915='1';
    let down=false,start=null;
    function point(ev){
      const rect=c.getBoundingClientRect(), p=ev.touches?ev.touches[0]:ev;
      return {x:(p.clientX-rect.left)*c.width/rect.width,y:(p.clientY-rect.top)*c.height/rect.height};
    }
    function startEv(ev){ if(!state.review?.circleMode) return; ev.preventDefault(); down=true; start=point(ev); }
    function moveEv(ev){ if(!down||!state.review?.circleMode) return; ev.preventDefault(); const b=point(ev); state.review.ellipse={cx:(start.x+b.x)/2,cy:(start.y+b.y)/2,rx:Math.abs(b.x-start.x)/2,ry:Math.abs(b.y-start.y)/2}; if(typeof drawReviewCanvas==='function') drawReviewCanvas(); }
    function endEv(ev){
      if(!down||!state.review?.circleMode) return;
      ev.preventDefault(); down=false;
      const e=state.review.ellipse, r=state.review.current;
      if(r&&e&&e.rx>3&&e.ry>3){
        if(typeof saveFeedback==='function') saveFeedback(r,'corrected_by_circle',e);
        const res=applyLiveCorrection0915(r,'corrected_by_circle',e);
        showLiveMessage0915(`フリーハンド補正 → ${res.ok?'反映':'未反映'} / affected=${r.liveTeachAffected0915||0}`);
        nextReviewLive0915();
      }
    }
    c.addEventListener('mousedown',startEv);
    c.addEventListener('mousemove',moveEv);
    window.addEventListener('mouseup',endEv);
    c.addEventListener('touchstart',startEv,{passive:false});
    c.addEventListener('touchmove',moveEv,{passive:false});
    c.addEventListener('touchend',endEv,{passive:false});
  }
}
function installExport0915(){
  const jsonBtn=safeQS('json');
  if(jsonBtn) jsonBtn.onclick=()=>{ if(!state.result) return; downloadJson0915(compactMetadata0915(),'sprite_region_metadata_compact_v0_9_15.json'); };
  const memBtn=safeQS('memoryJson');
  if(memBtn) memBtn.onclick=()=>downloadJson0915(compactMemory0915(),'correction_memory_compact_v0_9_15.json');
  // Add optional full-safe export button without changing existing layout too much.
  const bar=document.querySelector('.bar');
  if(bar && !safeQS('jsonFullSafe')){
    const b=document.createElement('button');
    b.id='jsonFullSafe'; b.textContent='安全版JSON';
    b.onclick=()=>{ if(!state.result) return; downloadJson0915(fullMetadataSafe0915(),'sprite_region_metadata_fullsafe_v0_9_15.json'); };
    bar.appendChild(b);
  }
}
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_0915;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0915;
    m.export_policy_v0915={
      default_json:'compact',
      raw_pixels:false,
      full_features:false,
      large_debug_arrays:false,
      fullsafe_button:true
    };
    m.live_teach_v0915={
      enabled:true,
      applies_to_current_result:true,
      note:'accept/reject/circle update current labels, review state, and pixel plan immediately'
    };
    return m;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.15';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.15';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.15: JSONを軽量化し、部位を教える操作をその場で現在結果へ反映します。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.15は保存方式と補正UIの実効性修正版です。通常JSONは軽量版、部位レビューは押した直後に現在の解析結果へ反映されます。';
  installExport0915();
  installLiveTeach0915();
}catch(e){ console.warn('v0.9.15 setup failed',e); }
window.compactMetadata0915=compactMetadata0915;
window.fullMetadataSafe0915=fullMetadataSafe0915;
window.applyLiveCorrection0915=applyLiveCorrection0915;
})();
