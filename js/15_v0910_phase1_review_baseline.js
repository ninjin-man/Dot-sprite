// ===== v0.9.10 Phase1 patch: review policy split + baseline anchors =====
(function(){
'use strict';
const VERSION_0910='0.9.10-phase1';
const PREPROCESSOR_VERSION_0910='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline+phase1-review-policy-baseline';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function colorOf(label){ return (typeof COLORS!=='undefined' && (COLORS[label]||COLORS.unknown)) || [255,80,120]; }
function box(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0}; }
function ensureLabels0910(){
  try{
    Object.assign(LABELS,{neck_anchor:'首推定',shoulder_anchor:'肩推定',candidate_review:'候補確認',blocking_review:'要修正',info_review:'参考'});
    Object.assign(COLORS,{neck_anchor:[120,220,255],shoulder_anchor:[255,210,102],candidate_review:[255,207,90],blocking_review:[255,79,104],info_review:[154,168,189]});
  }catch(e){}
}
ensureLabels0910();
const SMALL_PARTS=new Set(['eye_candidate','ear_candidate','hand_candidate','ornament_candidate']);
const INFO_LABELS=new Set(['soft_shell','hair_soft','sheer_soft','unknown_soft','soft_edge','bg_residue','background_residue','cloth_detail','ornament_detail','hair_tip','face_detail','detail_candidate']);
const BLOCKING_LABELS=new Set(['needs_review','unknown','boundary_review','skin_candidate','ambiguous_overlap']);
function estimateAnchors0910(res){
  const lines=res?.lines; if(!lines) return {enabled:true,status:'no_lines'};
  const w=res?.imgData?.width||state.w||1, h=res?.imgData?.height||state.h||1;
  const e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse||null;
  const before={...lines};
  const faceTop=Number.isFinite(lines.faceTop)?lines.faceTop:(e?Math.round(e.cy-e.ry):Math.round(h*.08));
  const faceBot=Number.isFinite(lines.faceBot)?lines.faceBot:(e?Math.round(e.cy+e.ry*.45):Math.round(h*.25));
  const shoulder=Number.isFinite(lines.shoulder)?lines.shoulder:Math.round(h*.34);
  const waist=Number.isFinite(lines.waist)?lines.waist:Math.round(h*.55);
  const cx=Number.isFinite(lines.cx)?lines.cx:(e?e.cx:Math.round(w/2));
  const headTop=Number.isFinite(lines.headTop)?lines.headTop:Math.max(0,faceTop-Math.round((faceBot-faceTop)*.55));
  const neckLine=clamp(Math.round(faceBot+(shoulder-faceBot)*0.42), faceBot+2, shoulder-1);
  const shoulderWidth=Math.round(clamp((e?e.rx*2.55:w*.38), w*.22, w*.58));
  const shoulderLeft=clamp(Math.round(cx-shoulderWidth/2),0,w-1);
  const shoulderRight=clamp(Math.round(cx+shoulderWidth/2),0,w-1);
  const torsoCenter={x:Math.round(cx), y:Math.round((shoulder+waist)*.5)};
  lines.faceTop=faceTop; lines.faceBot=faceBot; lines.shoulder=shoulder; lines.waist=waist; lines.cx=cx;
  lines.neck=neckLine; lines.neckLine=neckLine; lines.shoulderLeft=shoulderLeft; lines.shoulderRight=shoulderRight; lines.headTop=headTop; lines.torsoCenter=torsoCenter;
  const changed=before.neckLine!==neckLine||before.neck!==neckLine||before.shoulderLeft!==shoulderLeft||before.shoulderRight!==shoulderRight;
  return {enabled:true,status:'ok',changed,before:{faceTop:before.faceTop,faceBot:before.faceBot,shoulder:before.shoulder,neck:before.neckLine||before.neck,shoulderLeft:before.shoulderLeft,shoulderRight:before.shoulderRight},after:{faceTop,faceBot,neckLine,shoulder,shoulderLeft,shoulderRight,waist,cx,headTop,torsoCenter},manual_adjust:state.lineAdjust||{}};
}
function policyForRegion0910(r,res){
  const label=r.label||'unknown';
  const lowConf=Number(r.confidence??r.conf??0)<58;
  const b=box(r);
  const boundaryWarn=!!(r.boundaryWarning0984 || (r.boundaryStabilize0984&&r.boundaryStabilize0984.needs_review));
  if(SMALL_PARTS.has(label) || r.smallPartCandidate099){
    return {type:'candidate',blocking:false,reason:'small_part_candidate'};
  }
  if(INFO_LABELS.has(label) && !boundaryWarn){
    return {type:'info',blocking:false,reason:'soft_or_detail_label'};
  }
  if(BLOCKING_LABELS.has(label) || boundaryWarn || lowConf){
    return {type:'blocking',blocking:true,reason:boundaryWarn?'boundary_warning':(lowConf?'low_confidence':'blocking_label')};
  }
  // Very large non-soft labels can damage export, so keep them as blocking.
  const ratio=(r.area||0)/Math.max(1,(res.imgData?.width||state.w||1)*(res.imgData?.height||state.h||1));
  if(ratio>.16 && !['hair','cloth','legs','shoes','full_foreground'].includes(label)){
    return {type:'blocking',blocking:true,reason:'large_uncertain_region'};
  }
  return {type:'none',blocking:false,reason:'stable'};
}
function applyReviewPolicy0910(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  let blocking=[],candidate=[],info=[],stable=[];
  for(const r of res.candidates){
    const p=policyForRegion0910(r,res);
    r.reviewType0910=p.type;
    r.reviewReason0910=p.reason;
    r.candidateReview0910=p.type==='candidate';
    r.infoReview0910=p.type==='info';
    r.blockingReview0910=p.type==='blocking';
    if(p.type==='candidate'){
      r.needsReview=false;
      r.qualityBlocking0910=false;
      candidate.push(r);
    }else if(p.type==='info'){
      r.needsReview=false;
      r.qualityBlocking0910=false;
      info.push(r);
    }else if(p.type==='blocking'){
      r.needsReview=true;
      r.qualityBlocking0910=true;
      blocking.push(r);
    }else{
      if(r.needsReview){ r.reviewType0910='blocking'; r.blockingReview0910=true; r.qualityBlocking0910=true; blocking.push(r); }
      else stable.push(r);
    }
  }
  const warnings=[];
  if(blocking.length>0) warnings.push('blocking_review_exists');
  const missingFace=!res.candidates.some(r=>r.label==='face');
  if(missingFace) warnings.push('face_missing');
  const countsByLabel=list=>list.reduce((a,r)=>{a[r.label]=(a[r.label]||0)+1;return a;},{});
  const report={
    enabled:true,status:blocking.length?'needs_blocking_review':'ok',
    total:res.candidates.length,
    blocking_count:blocking.length,
    candidate_count:candidate.length,
    info_count:info.length,
    stable_count:stable.length,
    blocking_by_label:countsByLabel(blocking),
    candidate_by_label:countsByLabel(candidate),
    info_by_label:countsByLabel(info),
    warnings,
    ok:blocking.length===0 && !missingFace
  };
  res.reviewPolicy0910=report;
  res.reviewTargets0910=blocking.concat(candidate).sort((a,b)=>{
    const pa=a.reviewType0910==='blocking'?0:1, pb=b.reviewType0910==='blocking'?0:1;
    return pa-pb || (b.area||0)-(a.area||0);
  });
  return report;
}
const oldDrawLines=(typeof drawLines==='function')?drawLines:null;
if(oldDrawLines){
  drawLines=function(c,img,lines){
    oldDrawLines(c,img,lines);
    if(!c||!lines) return;
    const ctx=c.getContext('2d');
    ctx.save(); ctx.font='12px sans-serif'; ctx.lineWidth=2;
    if(Number.isFinite(lines.neckLine||lines.neck)){
      const y=lines.neckLine||lines.neck; ctx.strokeStyle='#78dcff'; ctx.fillStyle='#78dcff'; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(c.width,y); ctx.stroke(); ctx.fillText('NECK',4,Math.max(12,y-3));
    }
    if(Number.isFinite(lines.shoulderLeft)&&Number.isFinite(lines.shoulderRight)&&Number.isFinite(lines.shoulder)){
      ctx.strokeStyle='#ffd166'; ctx.fillStyle='#ffd166'; ctx.beginPath(); ctx.moveTo(lines.shoulderLeft,lines.shoulder); ctx.lineTo(lines.shoulderRight,lines.shoulder); ctx.stroke();
      ctx.beginPath(); ctx.arc(lines.shoulderLeft,lines.shoulder,4,0,Math.PI*2); ctx.arc(lines.shoulderRight,lines.shoulder,4,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  };
}
const oldDrawCandidates=(typeof drawCandidates==='function')?drawCandidates:null;
if(oldDrawCandidates){
  drawCandidates=function(c,img,cands){
    drawImageData(c,img); const ctx=c.getContext('2d'); ctx.font='12px sans-serif';
    for(const r of cands||[]){
      const col=colorOf(r.label); const type=r.reviewType0910||'';
      ctx.lineWidth=type==='blocking'?3:(type==='candidate'?2:1);
      ctx.strokeStyle=type==='blocking'?'#ff4f68':(type==='candidate'?'#ffcf5a':`rgb(${col[0]},${col[1]},${col[2]})`);
      ctx.fillStyle=ctx.strokeStyle;
      ctx.strokeRect(r.minx,r.miny,r.w,r.h);
      const suffix=type==='blocking'?'!':(type==='candidate'?'?':'');
      ctx.fillText(`${labelName(r.label)}${suffix} ${r.conf}`,r.minx,Math.max(12,r.miny-2));
    }
  };
}
if(typeof drawReview==='function'){
  drawReview=function(c,img,cands,after=true){
    drawImageData(c,img); const ctx=c.getContext('2d'); ctx.font='12px sans-serif'; ctx.lineWidth=3;
    for(const r of cands||[]){
      if(after){
        const t=r.reviewType0910||'';
        if(!r.needsReview && t!=='candidate' && t!=='info' && !['ornament_candidate','eye_candidate','ear_candidate','hand_candidate'].includes(r.label)) continue;
      }else{
        if(r.baseLabel!=='unknown') continue;
      }
      const t=r.reviewType0910||'';
      const col= after ? (t==='blocking'||r.needsReview?'#ff4f68':(t==='candidate'?'#ffcf5a':'#9aa8bd')) : '#9aa8bd';
      ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=(t==='blocking'||r.needsReview)?3:2;
      ctx.strokeRect(r.minx,r.miny,r.w,r.h);
      const mark=t==='blocking'?'要修正':(t==='candidate'?'候補':'参考');
      ctx.fillText(`${r.mid}:${labelName(r.label)} ${mark}`,r.minx,Math.max(12,r.miny-2));
    }
  };
}
if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    if(!state.result) return [];
    const targets=state.result.reviewTargets0910||[];
    const blocking=targets.filter(r=>r.reviewType0910==='blocking'||r.needsReview);
    const candidate=targets.filter(r=>r.reviewType0910==='candidate');
    const priority={face:0,chest_skin:1,boundary_review:2,skin_candidate:3,needs_review:4,unknown:5,eye_candidate:10,ear_candidate:11,hand_candidate:12,ornament_candidate:13};
    const sortFn=(a,b)=>(priority[a.label]??99)-(priority[b.label]??99)||(b.area||0)-(a.area||0);
    return (blocking.length?blocking:candidate).sort(sortFn).slice(0,5);
  };
}
const oldAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0910(){
  if(!oldAnalyze) return;
  await oldAnalyze();
  try{
    ensureLabels0910();
    const res=state.result;
    if(!res) return;
    res.baselineAnchors0910=estimateAnchors0910(res);
    res.reviewPolicy0910=applyReviewPolicy0910(res);
    renderAll();
  }catch(e){ console.warn('v0.9.10 Phase1 failed',e); }
}
window.analyze0910=analyze0910;
try{
  analyze=analyze0910;
  const run=safeQS('run'); if(run) run.onclick=analyze0910;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0910;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{
    const el=safeQS(id); if(el) el.oninput=()=>{
      state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)};
      analyze0910();
    };
  });
}catch(e){}
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_0910;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0910;
    m.phase='Phase1: review_policy_split + baseline_anchors';
    m.baseline_anchors_v0910=state.result?.baselineAnchors0910||{enabled:true,status:'not_run'};
    m.review_policy_v0910=state.result?.reviewPolicy0910||{enabled:true,status:'not_run'};
    m.region=m.region||{};
    const pol=state.result?.reviewPolicy0910;
    if(pol){
      m.region.review_after=pol.blocking_count;
      m.region.candidate_review=pol.candidate_count;
      m.region.info_review=pol.info_count;
    }
    if(m.quality_v096){
      m.quality_v096.version=VERSION_0910;
      if(pol){
        m.quality_v096.review_target_count=pol.blocking_count;
        m.quality_v096.candidate_review_count=pol.candidate_count;
        m.quality_v096.info_review_count=pol.info_count;
        m.quality_v096.ok=!!pol.ok;
        m.quality_v096.warnings=[...(m.quality_v096.warnings||[]).filter(w=>w!=='many_review_targets'),...(pol.warnings||[])];
      }
    }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){
          p.needs_review=!!live.needsReview;
          p.review_type_v0910=live.reviewType0910||'none';
          p.candidate_review_v0910=!!live.candidateReview0910;
          p.info_review_v0910=!!live.infoReview0910;
          p.blocking_review_v0910=!!live.blockingReview0910;
          p.review_reason_v0910=live.reviewReason0910||null;
        }
      }
    }
    return m;
  };
}
if(typeof logResult==='function'){
  const oldLog=logResult;
  logResult=function(){
    oldLog();
    const log=safeQS('log'), b=state.result?.baselineAnchors0910||{}, p=state.result?.reviewPolicy0910||{};
    if(log) log.textContent+=`\n[v0.9.10 Phase1]\nreview: blocking=${p.blocking_count??'-'} candidate=${p.candidate_count??'-'} info=${p.info_count??'-'} status=${p.status||'-'}\nbaseline: neck=${b.after?.neckLine??'-'} shoulderL=${b.after?.shoulderLeft??'-'} shoulderR=${b.after?.shoulderRight??'-'} changed=${b.changed?'Y':'N'}\n`;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.10 Phase1';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.10 Phase1';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.10 Phase1: 要修正レビューと候補確認を分離し、首/左右肩アンカーを追加。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.10 Phase1は確認疲れ対策です。目/耳/手/装飾は候補確認に分離し、quality判定を壊さないようにしました。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_10_phase1.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Review Policy','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.10 Phase1 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_10_phase1.png','image/png'));};
}catch(e){ console.warn('v0.9.10 Phase1 setup failed',e); }
})();
