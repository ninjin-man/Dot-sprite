// ===== v0.9.11 Phase2 patch: confirm small-part candidates =====
(function(){
'use strict';
const VERSION_0911='0.9.11-phase2';
const PREPROCESSOR_VERSION_0911='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline+phase1-review-policy-baseline+phase2-confirm-small-parts';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function box(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0,maxx:r.maxx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)-1),maxy:r.maxy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)-1),cx:r.cx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)/2),cy:r.cy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)/2)}; }
function area(r){ return r.area || Math.max(1,(r.w||0)*(r.h||0)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function ensureLabels0911(){
  try{
    Object.assign(LABELS,{ confirmed_eye:'確定目', confirmed_ear:'確定耳', confirmed_hand:'確定手', confirmed_ornament:'確定装飾', rejected_small_part:'未採用候補' });
    Object.assign(COLORS,{ confirmed_eye:[60,190,255], confirmed_ear:[255,150,120], confirmed_hand:[255,185,145], confirmed_ornament:[255,220,70], rejected_small_part:[120,130,150] });
    // Existing stable labels are used as the final export labels. The confirmed_* labels remain as metadata states.
  }catch(e){}
}
ensureLabels0911();
function sideOf(r,cx){ const b=box(r); return b.cx<cx?'left':'right'; }
function aspectScore(r,min,max){ const b=box(r), a=b.w/Math.max(1,b.h); if(a>=min&&a<=max) return 1; return Math.max(0,1-Math.min(Math.abs(a-min),Math.abs(a-max))/(max-min+0.01)); }
function compactScore(r,maxArea){ return clamp(1-area(r)/Math.max(1,maxArea),0,1); }
function overlap1D(a0,a1,b0,b1){ return Math.max(0,Math.min(a1,b1)-Math.max(a0,b0)); }
function nearestBySide(list,cx,limit=1){
  const left=list.filter(r=>box(r).cx<cx).sort((a,b)=>Math.abs(box(a).cx-cx)-Math.abs(box(b).cx-cx)).slice(0,limit);
  const right=list.filter(r=>box(r).cx>=cx).sort((a,b)=>Math.abs(box(a).cx-cx)-Math.abs(box(b).cx-cx)).slice(0,limit);
  return left.concat(right);
}
function markConfirmed(r,kind,label,score,reason,side){
  r.phase2Kind0911=kind;
  r.phase2Confirmed0911=true;
  r.phase2Score0911=Math.round(score);
  r.phase2Side0911=side||null;
  r.phase2Reason0911=reason;
  r.baseCandidateLabel0911=r.baseCandidateLabel0911||r.label;
  r.label=label;
  r.conf=Math.max(r.conf||0,Math.round(score));
  r.confidence=Math.max(r.confidence||0,Math.round(score));
  r.finalConfidence=Math.max(r.finalConfidence||0,Math.round(score));
  r.needsReview=false;
  r.reviewType0910='none';
  r.candidateReview0910=false;
  r.infoReview0910=false;
  r.blockingReview0910=false;
  r.qualityBlocking0910=false;
  r.reason=(r.reason||'')+' / v0.9.11 confirmed '+kind+': '+reason;
}
function markRejected(r,kind,score,reason){
  r.phase2Kind0911=kind;
  r.phase2Confirmed0911=false;
  r.phase2Score0911=Math.round(score);
  r.phase2RejectReason0911=reason;
  r.needsReview=false;
  r.reviewType0910='candidate';
  r.candidateReview0910=true;
  r.qualityBlocking0910=false;
}
function confirmEyes0911(res){
  const cands=(res.candidates||[]).filter(r=>r.label==='eye_candidate' || r.baseCandidateLabel0911==='eye_candidate');
  const lines=res.lines||{}, e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse||null;
  const cx=lines.cx || e?.cx || (res.imgData?.width||state.w||1)/2;
  const faceTop=lines.faceTop ?? (e?e.cy-e.ry:0), faceBot=lines.faceBot ?? (e?e.cy+e.ry:(res.imgData?.height||state.h||1)*.3);
  const upperBot=faceTop+(faceBot-faceTop)*0.72;
  const scored=[];
  for(const r of cands){
    const b=box(r);
    let s=0;
    s += (b.cy>=faceTop && b.cy<=upperBot) ? 34 : -18;
    s += (Math.abs(b.cx-cx)>Math.max(2,(e?.rx||res.imgData?.width*.08)*.18)) ? 15 : 0;
    s += aspectScore(r,.65,4.8)*16;
    s += compactScore(r,60)*12;
    s += (area(r)>=3 && area(r)<=48) ? 14 : -8;
    s += (b.w<=16 && b.h<=12) ? 9 : -5;
    scored.push({r,score:clamp(s,0,98),side:sideOf(r,cx)});
  }
  // Prefer a left/right pair with similar vertical position and size.
  let bestPair=null, bestPairScore=-1;
  for(const L of scored.filter(x=>x.side==='left')) for(const R of scored.filter(x=>x.side==='right')){
    const lb=box(L.r), rb=box(R.r);
    const symmetry=1-clamp(Math.abs((cx-lb.cx)-(rb.cx-cx))/Math.max(1,(rb.cx-lb.cx)),0,1);
    const ysim=1-clamp(Math.abs(lb.cy-rb.cy)/Math.max(1,faceBot-faceTop),0,1);
    const asim=1-clamp(Math.abs(area(L.r)-area(R.r))/Math.max(area(L.r),area(R.r),1),0,1);
    const pairScore=(L.score+R.score)/2 + symmetry*18 + ysim*12 + asim*8;
    if(pairScore>bestPairScore){ bestPairScore=pairScore; bestPair=[L,R]; }
  }
  let accepted=[];
  if(bestPair && bestPairScore>=68){ accepted=bestPair; }
  else accepted=scored.filter(x=>x.score>=70).sort((a,b)=>b.score-a.score).slice(0,2);
  const acceptedSet=new Set(accepted.map(x=>x.r));
  accepted.forEach(x=>markConfirmed(x.r,'eye','eyes',Math.max(70,x.score),'compact dark pair/upper-face geometry',x.side));
  scored.filter(x=>!acceptedSet.has(x.r)).forEach(x=>markRejected(x.r,'eye',x.score,'eye geometry below threshold'));
  return {checked:cands.length,confirmed:accepted.length,pair_score:bestPairScore<0?null:Math.round(bestPairScore)};
}
function confirmEars0911(res){
  const cands=(res.candidates||[]).filter(r=>r.label==='ear_candidate' || r.baseCandidateLabel0911==='ear_candidate');
  const lines=res.lines||{}, e=res.faceEllipse0952||res.faceEllipse0951||res.faceEllipse095||res.faceEllipse||null;
  const cx=lines.cx || e?.cx || (res.imgData?.width||state.w||1)/2;
  const faceTop=lines.faceTop ?? (e?e.cy-e.ry:0), faceBot=lines.faceBot ?? (e?e.cy+e.ry:(res.imgData?.height||state.h||1)*.3);
  const shoulder=lines.shoulder ?? (res.imgData?.height||state.h||1)*.34;
  const scored=[];
  for(const r of cands){
    const b=box(r), xdist=Math.abs(b.cx-cx), minSide=e?e.rx*.45:(res.imgData?.width||state.w||1)*.055;
    const yOverlap=overlap1D(b.y,b.maxy,faceTop,Math.min(shoulder,faceBot+Math.max(4,(faceBot-faceTop)*.35)));
    let s=0;
    s += xdist>minSide ? 24 : -20;
    s += yOverlap>0 ? 22 : -14;
    s += b.cy<shoulder ? 16 : -20;
    s += aspectScore(r,.35,1.7)*14;
    s += (area(r)>=8 && area(r)<=600) ? 12 : -10;
    s += (r.sat||0)<.75 ? 5 : 0;
    scored.push({r,score:clamp(s,0,96),side:sideOf(r,cx)});
  }
  const accepted=nearestBySide(scored.filter(x=>x.score>=58).map(x=>x.r),cx,1).map(r=>scored.find(x=>x.r===r));
  const acceptedSet=new Set(accepted.map(x=>x.r));
  accepted.forEach(x=>markConfirmed(x.r,'ear','ears',Math.max(62,x.score),'skin side blob near face/above shoulder',x.side));
  scored.filter(x=>!acceptedSet.has(x.r)).forEach(x=>markRejected(x.r,'ear',x.score,'ear geometry below threshold'));
  return {checked:cands.length,confirmed:accepted.length};
}
function confirmHands0911(res){
  const cands=(res.candidates||[]).filter(r=>r.label==='hand_candidate' || r.baseCandidateLabel0911==='hand_candidate');
  const lines=res.lines||{};
  const w=res.imgData?.width||state.w||1,h=res.imgData?.height||state.h||1;
  const cx=lines.cx||w/2, shoulder=lines.shoulder||h*.30, waist=lines.waist||h*.55, crotch=lines.crotch||h*.67;
  const scored=[];
  for(const r of cands){
    const b=box(r), sideDist=Math.abs(b.cx-cx);
    let s=0;
    s += (b.cy>=shoulder-4 && b.cy<=crotch+8) ? 26 : -18;
    s += sideDist>w*.13 ? 20 : -18;
    s += b.cy<=waist+Math.max(16,h*.08) ? 12 : -6;
    s += aspectScore(r,.35,2.8)*12;
    s += (area(r)>=12 && area(r)<=900) ? 14 : -8;
    s += (b.w<=w*.30 && b.h<=h*.28) ? 8 : -8;
    const adj=(r.adjacentParts||[]).join(',');
    if(/cloth|sheer|arms_skin|chest_skin/.test(adj)) s+=8;
    scored.push({r,score:clamp(s,0,96),side:sideOf(r,cx)});
  }
  const accepted=nearestBySide(scored.filter(x=>x.score>=62).map(x=>x.r),cx,1).map(r=>scored.find(x=>x.r===r));
  const acceptedSet=new Set(accepted.map(x=>x.r));
  accepted.forEach(x=>markConfirmed(x.r,'hand','hands',Math.max(66,x.score),'skin side blob below shoulder/outside torso',x.side));
  scored.filter(x=>!acceptedSet.has(x.r)).forEach(x=>markRejected(x.r,'hand',x.score,'hand geometry below threshold'));
  return {checked:cands.length,confirmed:accepted.length};
}
function confirmOrnaments0911(res){
  const cands=(res.candidates||[]).filter(r=>r.label==='ornament_candidate' || r.baseCandidateLabel0911==='ornament_candidate');
  const lines=res.lines||{};
  const w=res.imgData?.width||state.w||1,h=res.imgData?.height||state.h||1;
  const cx=lines.cx||w/2, faceBot=lines.faceBot||h*.24, shoulder=lines.shoulder||h*.32, waist=lines.waist||h*.56, crotch=lines.crotch||h*.66;
  const scored=[];
  for(const r of cands){
    const b=box(r), rel=Math.abs(b.cx-cx)/w;
    let s=0;
    s += (b.cy>=faceBot-12 && b.cy<=crotch+4) ? 24 : -12;
    s += rel<.28 ? 18 : 6;
    s += (area(r)>=4 && area(r)<=700) ? 14 : -8;
    s += ((r.sat||0)>.14 || (r.edgeTexture094?.ornament_detail_score||0)>=65) ? 14 : 0;
    s += compactScore(r,760)*10;
    s += (b.cy>=shoulder && b.cy<=waist) ? 10 : 0;
    let label='body_ornament', kind='body';
    if(b.cy<faceBot+8){ label='necklace'; kind='necklace'; }
    else if((r.visualZone||'')==='head'){ label='hair_ornament'; kind='hair'; }
    else if((r.visualZone||'')==='feet'){ label='shoe_ornament'; kind='shoe'; }
    scored.push({r,score:clamp(s,0,96),label,kind});
  }
  const accepted=scored.filter(x=>x.score>=60).sort((a,b)=>b.score-a.score).slice(0,6);
  const acceptedSet=new Set(accepted.map(x=>x.r));
  accepted.forEach(x=>markConfirmed(x.r,'ornament',x.label,Math.max(64,x.score),'gold/detail compact region '+x.kind,null));
  scored.filter(x=>!acceptedSet.has(x.r)).forEach(x=>markRejected(x.r,'ornament',x.score,'ornament geometry/detail below threshold'));
  return {checked:cands.length,confirmed:accepted.length};
}
function reapplyReviewPolicy0911(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  const small=new Set(['eye_candidate','ear_candidate','hand_candidate','ornament_candidate']);
  const info=new Set(['soft_shell','hair_soft','sheer_soft','unknown_soft','soft_edge','bg_residue','background_residue','cloth_detail','ornament_detail','hair_tip','face_detail','detail_candidate']);
  const confirmed=new Set(['eyes','ears','hands','body_ornament','hair_ornament','shoe_ornament','necklace']);
  let blocking=[],candidate=[],infoList=[],stable=[];
  for(const r of res.candidates){
    const lbl=r.label||'unknown';
    if(r.phase2Confirmed0911 || confirmed.has(lbl)){
      r.needsReview=false; r.reviewType0910='none'; r.candidateReview0910=false; r.infoReview0910=false; r.blockingReview0910=false; r.qualityBlocking0910=false; stable.push(r); continue;
    }
    if(small.has(lbl) || r.smallPartCandidate099){
      r.needsReview=false; r.reviewType0910='candidate'; r.candidateReview0910=true; r.infoReview0910=false; r.blockingReview0910=false; r.qualityBlocking0910=false; candidate.push(r); continue;
    }
    if(info.has(lbl)){
      r.needsReview=false; r.reviewType0910='info'; r.candidateReview0910=false; r.infoReview0910=true; r.blockingReview0910=false; r.qualityBlocking0910=false; infoList.push(r); continue;
    }
    const low=Number(r.confidence??r.conf??0)<58;
    const warn=!!(r.boundaryWarning0984 || (r.boundaryStabilize0984&&r.boundaryStabilize0984.needs_review));
    if(['needs_review','unknown','boundary_review','skin_candidate','ambiguous_overlap'].includes(lbl)||low||warn){
      r.needsReview=true; r.reviewType0910='blocking'; r.blockingReview0910=true; r.qualityBlocking0910=true; blocking.push(r);
    }else stable.push(r);
  }
  function counts(list){ return list.reduce((a,r)=>{a[r.label]=(a[r.label]||0)+1;return a;},{}); }
  const missingFace=!res.candidates.some(r=>r.label==='face');
  const report={enabled:true,status:blocking.length?'needs_blocking_review':'ok',total:res.candidates.length,blocking_count:blocking.length,candidate_count:candidate.length,info_count:infoList.length,stable_count:stable.length,blocking_by_label:counts(blocking),candidate_by_label:counts(candidate),info_by_label:counts(infoList),warnings:[...(blocking.length?['blocking_review_exists']:[]),...(missingFace?['face_missing']:[])],ok:blocking.length===0&&!missingFace,phase2_reapplied:true};
  res.reviewPolicy0910=report;
  res.reviewPolicy0911=report;
  res.reviewTargets0910=blocking.concat(candidate).sort((a,b)=>{const pa=a.reviewType0910==='blocking'?0:1,pb=b.reviewType0910==='blocking'?0:1;return pa-pb||(b.area||0)-(a.area||0);});
  return report;
}
function confirmSmallParts0911(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  ensureLabels0911();
  const before=(res.candidates||[]).reduce((a,r)=>{a[r.label]=(a[r.label]||0)+1;return a;},{});
  const eye=confirmEyes0911(res);
  const ear=confirmEars0911(res);
  const hand=confirmHands0911(res);
  const ornament=confirmOrnaments0911(res);
  const after=(res.candidates||[]).reduce((a,r)=>{a[r.label]=(a[r.label]||0)+1;return a;},{});
  const confirmed=res.candidates.filter(r=>r.phase2Confirmed0911).length;
  const remainingCandidates=res.candidates.filter(r=>['eye_candidate','ear_candidate','hand_candidate','ornament_candidate'].includes(r.label)).length;
  const report={enabled:true,status:'ok',version:VERSION_0911,before,after,confirmed_total:confirmed,remaining_candidate_total:remainingCandidates,eye,ear,hand,ornament};
  res.smallPartConfirm0911=report;
  reapplyReviewPolicy0911(res);
  return report;
}
const oldAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0911(){
  if(!oldAnalyze) return;
  await oldAnalyze();
  try{
    const res=state.result;
    if(!res) return;
    confirmSmallParts0911(res);
    if(!state.selectedPart || state.selectedPart==='soft_shell') state.selectedPart='full_foreground';
    renderAll();
  }catch(e){ console.warn('v0.9.11 Phase2 failed',e); }
}
window.analyze0911=analyze0911;
try{
  analyze=analyze0911;
  const run=safeQS('run'); if(run) run.onclick=analyze0911;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0911;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{
    const el=safeQS(id); if(el) el.oninput=()=>{
      state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)};
      analyze0911();
    };
  });
}catch(e){}
if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    if(!state.result) return [];
    const targets=state.result.reviewTargets0910||[];
    const blocking=targets.filter(r=>r.reviewType0910==='blocking'||r.needsReview);
    const candidate=targets.filter(r=>r.reviewType0910==='candidate'&&!r.phase2Confirmed0911);
    const priority={face:0,chest_skin:1,boundary_review:2,skin_candidate:3,needs_review:4,unknown:5,eye_candidate:10,ear_candidate:11,hand_candidate:12,ornament_candidate:13};
    const sortFn=(a,b)=>(priority[a.label]??99)-(priority[b.label]??99)||(b.area||0)-(a.area||0);
    return (blocking.length?blocking:candidate).sort(sortFn).slice(0,5);
  };
}
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_0911;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0911;
    m.phase='Phase2: candidate_to_confirmed_small_parts';
    m.small_part_confirm_v0911=state.result?.smallPartConfirm0911||{enabled:true,status:'not_run'};
    m.review_policy_v0911=state.result?.reviewPolicy0911||state.result?.reviewPolicy0910||{enabled:true,status:'not_run'};
    m.region=m.region||{};
    const pol=state.result?.reviewPolicy0911||state.result?.reviewPolicy0910;
    if(pol){ m.region.review_after=pol.blocking_count; m.region.candidate_review=pol.candidate_count; m.region.info_review=pol.info_count; }
    if(m.quality_v096){
      m.quality_v096.version=VERSION_0911;
      if(pol){ m.quality_v096.review_target_count=pol.blocking_count; m.quality_v096.candidate_review_count=pol.candidate_count; m.quality_v096.info_review_count=pol.info_count; m.quality_v096.ok=!!pol.ok; m.quality_v096.warnings=[...(pol.warnings||[])]; }
      m.quality_v096.confirmed_small_parts=state.result?.smallPartConfirm0911?.confirmed_total||0;
    }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){
          p.label=live.label; p.label_ja=labelName(live.label); p.confidence=live.confidence||live.conf||p.confidence;
          p.phase2_confirmed_v0911=!!live.phase2Confirmed0911;
          p.phase2_kind_v0911=live.phase2Kind0911||null;
          p.phase2_score_v0911=live.phase2Score0911??null;
          p.phase2_side_v0911=live.phase2Side0911||null;
          p.base_candidate_label_v0911=live.baseCandidateLabel0911||null;
          p.needs_review=!!live.needsReview;
          p.review_type_v0910=live.reviewType0910||'none';
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
    const log=safeQS('log'), s=state.result?.smallPartConfirm0911||{}, p=state.result?.reviewPolicy0911||state.result?.reviewPolicy0910||{};
    if(log) log.textContent+=`\n[v0.9.11 Phase2]\nconfirmed=${s.confirmed_total??'-'} remaining_candidate=${s.remaining_candidate_total??'-'} eye=${s.eye?.confirmed??0}/${s.eye?.checked??0} ear=${s.ear?.confirmed??0}/${s.ear?.checked??0} hand=${s.hand?.confirmed??0}/${s.hand?.checked??0} ornament=${s.ornament?.confirmed??0}/${s.ornament?.checked??0}\nreview: blocking=${p.blocking_count??'-'} candidate=${p.candidate_count??'-'} info=${p.info_count??'-'} status=${p.status||'-'}\n`;
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.11 Phase2';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.11 Phase2';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.11 Phase2: 目/耳/手/装飾候補を、人体位置・左右性・形状スコアで確定ラベルへ昇格。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.11 Phase2は候補確定レイヤーです。条件を満たした小パーツだけ eyes / ears / hands / ornament 系ラベルに昇格し、残りは候補確認に残します。';
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_11_phase2.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates / Confirmed','Unknown Before','Review Policy','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.11 Phase2 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_11_phase2.png','image/png'));};
}catch(e){ console.warn('v0.9.11 Phase2 setup failed',e); }
})();
