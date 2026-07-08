// ===== v0.9.13 Phase4 patch: semantic hair / cloth decomposition =====
(function(){
'use strict';
const VERSION_0913='0.9.13-phase4';
const PREPROCESSOR_VERSION_0913='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline+phase1-review-policy-baseline+phase2-confirm-small-parts+phase3-structure-graph+phase4-hair-cloth-semantics';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function box(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0,maxx:r.maxx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)-1),maxy:r.maxy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)-1),cx:r.cx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)/2),cy:r.cy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)/2)}; }
function area(r){ return r.area || Math.max(1,(r.w||0)*(r.h||0)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function ensureLabels0913(){
  try{
    Object.assign(LABELS,{
      front_hair:'前髪', side_hair_left:'左横髪', side_hair_right:'右横髪', back_hair:'後ろ髪',
      hair_highlight:'髪ハイライト', hair_shadow:'髪影', hair_accessory:'髪飾り',
      collar:'襟', sleeve_left:'左袖', sleeve_right:'右袖', upper_cloth:'上衣',
      lower_cloth:'腰布/下衣', belt:'ベルト', cloth_shadow:'服影', cloth_highlight:'服ハイライト',
      cloth_ornament:'服装飾', transparent_cloth:'透け布'
    });
    Object.assign(COLORS,{
      front_hair:[122,76,255], side_hair_left:[150,92,255], side_hair_right:[130,74,235], back_hair:[86,56,180],
      hair_highlight:[202,186,255], hair_shadow:[64,42,128], hair_accessory:[255,214,80],
      collar:[98,220,255], sleeve_left:[255,162,94], sleeve_right:[255,132,76], upper_cloth:[72,219,152],
      lower_cloth:[67,176,255], belt:[220,158,70], cloth_shadow:[78,88,120], cloth_highlight:[184,235,255],
      cloth_ornament:[255,220,70], transparent_cloth:[145,205,255]
    });
  }catch(e){}
}
ensureLabels0913();
function addReason(r,msg){ r.reason=(r.reason||'')+' / '+msg; }
function isHairLabel(lbl){ return ['hair','hair_soft','hair_tip','hair_shadow','hair_highlight','front_hair','side_hair_left','side_hair_right','back_hair','hair_accessory','hair_ornament'].includes(lbl); }
function isClothLabel(lbl){ return ['cloth','sheer','sheer_soft','cloth_detail','torso_core','body_ornament','necklace','upper_cloth','lower_cloth','collar','sleeve_left','sleeve_right','belt','cloth_shadow','cloth_highlight','cloth_ornament','transparent_cloth'].includes(lbl); }
function anchors0913(res){
  const g=res.structureGraph0912?.anchors||{};
  const lines=res.lines||{};
  const img=res.imgData||{width:state.w||1,height:state.h||1};
  const bbox=lines.bbox||res.pre?.bbox||g.bbox||{minx:0,miny:0,maxx:img.width-1,maxy:img.height-1,w:img.width,h:img.height,area:img.width*img.height};
  const cx=Number.isFinite(g.cx)?g.cx:(Number.isFinite(lines.cx)?lines.cx:Math.round((bbox.minx+bbox.maxx)/2));
  const faceTop=Number.isFinite(g.faceTop)?g.faceTop:(Number.isFinite(lines.faceTop)?lines.faceTop:Math.round(img.height*.09));
  const faceBot=Number.isFinite(g.faceBot)?g.faceBot:(Number.isFinite(lines.faceBot)?lines.faceBot:Math.round(img.height*.26));
  const neckLine=Number.isFinite(g.neckLine)?g.neckLine:(Number.isFinite(lines.neckLine)?lines.neckLine:Math.round(img.height*.29));
  const shoulder=Number.isFinite(g.shoulder)?g.shoulder:(Number.isFinite(lines.shoulder)?lines.shoulder:Math.round(img.height*.34));
  const waist=Number.isFinite(g.waist)?g.waist:(Number.isFinite(lines.waist)?lines.waist:Math.round(img.height*.56));
  const crotch=Number.isFinite(g.crotch)?g.crotch:(Number.isFinite(lines.crotch)?lines.crotch:Math.round(img.height*.68));
  const ankle=Number.isFinite(g.ankle)?g.ankle:(Number.isFinite(lines.ankle)?lines.ankle:Math.round(img.height*.86));
  const shoulderLeft=Number.isFinite(g.shoulderLeft)?g.shoulderLeft:(Number.isFinite(lines.shoulderLeft)?lines.shoulderLeft:Math.round(cx-bbox.w*.18));
  const shoulderRight=Number.isFinite(g.shoulderRight)?g.shoulderRight:(Number.isFinite(lines.shoulderRight)?lines.shoulderRight:Math.round(cx+bbox.w*.18));
  const torsoHalf=Number.isFinite(g.torsoHalf)?g.torsoHalf:Math.max(6,Math.round((shoulderRight-shoulderLeft)*.58));
  return {img,bbox,cx,faceTop,faceBot,neckLine,shoulder,waist,crotch,ankle,shoulderLeft,shoulderRight,torsoHalf};
}
function promote(r,newLabel,score,msg){
  if(r.label===newLabel) return;
  r.phase4Source0913=r.phase4Source0913||r.label;
  r.label=newLabel;
  r.phase4Promoted0913=true;
  r.phase4Semantic0913=newLabel;
  r.conf=Math.max(r.conf||0,score);
  r.confidence=Math.max(r.confidence||0,score);
  r.finalConfidence=Math.max(r.finalConfidence||0,score);
  r.needsReview=false;
  r.reviewType0910='none';
  r.candidateReview0910=false;
  r.infoReview0910=false;
  r.blockingReview0910=false;
  r.qualityBlocking0910=false;
  addReason(r,'v0.9.13 '+msg);
}
function hairSemantic0913(res,a){
  const report={front:0,side_left:0,side_right:0,back:0,highlight:0,shadow:0,accessory:0};
  const faceW=Math.max(8,a.torsoHalf*1.05);
  for(const r of (res.candidates||[])){
    const lbl=r.label||'unknown';
    if(lbl==='hair_ornament'){ promote(r,'hair_accessory',68,'hair ornament semantic'); report.accessory++; continue; }
    if(lbl==='hair_tip'){ 
      const b=box(r), side=b.cx<a.cx?'left':'right';
      if(b.cy<=a.faceBot+Math.max(8,(a.shoulder-a.faceBot)*.55) && Math.abs(b.cx-a.cx)>faceW*.35){ promote(r,side==='left'?'side_hair_left':'side_hair_right',64,'hair tip side semantic'); side==='left'?report.side_left++:report.side_right++; }
      else { promote(r,'front_hair',64,'hair tip front semantic'); report.front++; }
      continue;
    }
    if(!isHairLabel(lbl)) continue;
    const b=box(r);
    const side=b.cx<a.cx?'left':'right';
    const central=Math.abs(b.cx-a.cx)<=faceW;
    const aboveShoulder=b.cy<=a.shoulder+Math.max(4,a.img.height*.03);
    const coversFace=b.cy>=a.faceTop-4 && b.cy<=a.faceBot+Math.max(4,(a.faceBot-a.faceTop)*.4);
    const largeBehind=(b.y<=a.faceTop+2 && b.maxy>=a.shoulder-2 && area(r)>Math.max(90,a.bbox.area*.025));
    const light=(r.val||0)>.68 && (r.sat||0)<.55;
    const dark=(r.val||0)<.32 && area(r)<Math.max(550,a.bbox.area*.06);
    if((lbl==='ornament_candidate'||lbl==='body_ornament') && aboveShoulder && area(r)<Math.max(260,a.bbox.area*.02)){ promote(r,'hair_accessory',66,'small detail on hair/head'); report.accessory++; continue; }
    if(light && area(r)<Math.max(360,a.bbox.area*.035) && aboveShoulder){ promote(r,'hair_highlight',62,'light small hair region'); report.highlight++; continue; }
    if(dark && aboveShoulder){ promote(r,'hair_shadow',62,'dark compact hair region'); report.shadow++; continue; }
    if(central && coversFace){ promote(r,'front_hair',68,'central hair over face'); report.front++; continue; }
    if(!central && aboveShoulder){ promote(r,side==='left'?'side_hair_left':'side_hair_right',66,'side hair beside face'); side==='left'?report.side_left++:report.side_right++; continue; }
    if(largeBehind || b.cy<a.shoulder+Math.max(4,a.img.height*.04)){ promote(r,'back_hair',63,'large upper hair mass behind head'); report.back++; continue; }
  }
  return report;
}
function clothSemantic0913(res,a){
  const report={collar:0,sleeve_left:0,sleeve_right:0,upper:0,lower:0,belt:0,shadow:0,highlight:0,ornament:0,transparent:0};
  for(const r of (res.candidates||[])){
    const lbl=r.label||'unknown';
    const b=box(r), side=b.cx<a.cx?'left':'right';
    const central=Math.abs(b.cx-a.cx)<=a.torsoHalf+2;
    const torsoY=b.cy>=a.shoulder-4 && b.cy<=a.waist+4;
    const hipY=b.cy>a.waist-4 && b.cy<=a.crotch+8;
    const armSide=(b.cy>=a.shoulder-4 && b.cy<=a.crotch+6 && !central);
    const nearNeck=b.cy>=a.faceBot-6 && b.cy<=a.shoulder+Math.max(8,a.img.height*.045) && Math.abs(b.cx-a.cx)<=a.torsoHalf*.95;
    const thinBand=b.h<=Math.max(5,a.img.height*.035) && b.w>=Math.max(8,a.torsoHalf*.7);
    const light=(r.val||0)>.72 && area(r)<Math.max(620,a.bbox.area*.045);
    const dark=(r.val||0)<.34 && area(r)<Math.max(900,a.bbox.area*.065);
    if(lbl==='body_ornament' || lbl==='necklace' || lbl==='ornament_candidate'){
      if(nearNeck && lbl==='necklace'){ promote(r,'collar',66,'neckline/collar region'); report.collar++; continue; }
      if(torsoY || hipY){ promote(r,'cloth_ornament',66,'ornament on cloth body'); report.ornament++; continue; }
    }
    if(!isClothLabel(lbl)) continue;
    if(nearNeck && ['cloth','cloth_detail','torso_core','necklace','body_ornament'].includes(lbl)){ promote(r,'collar',66,'near neck cloth shape'); report.collar++; continue; }
    if(armSide && ['cloth','sheer','sheer_soft','cloth_detail','transparent_cloth'].includes(lbl)){ promote(r,side==='left'?'sleeve_left':'sleeve_right',65,'side cloth between shoulder and waist/crotch'); side==='left'?report.sleeve_left++:report.sleeve_right++; continue; }
    if(thinBand && Math.abs(b.cy-a.waist)<=Math.max(8,a.img.height*.045)){ promote(r,'belt',64,'thin waist band'); report.belt++; continue; }
    if(light && torsoY && ['cloth_detail','torso_core','cloth','upper_cloth'].includes(lbl)){ promote(r,'cloth_highlight',61,'light compact cloth region'); report.highlight++; continue; }
    if(dark && (torsoY||hipY) && ['cloth_detail','torso_core','cloth','upper_cloth','lower_cloth'].includes(lbl)){ promote(r,'cloth_shadow',61,'dark compact cloth region'); report.shadow++; continue; }
    if((lbl==='sheer'||lbl==='sheer_soft') && (torsoY||armSide||hipY)){ promote(r,'transparent_cloth',62,'sheer/soft cloth semantic'); report.transparent++; continue; }
    if(central && torsoY && ['cloth','torso_core','cloth_detail'].includes(lbl)){ promote(r,'upper_cloth',66,'central upper torso cloth'); report.upper++; continue; }
    if(hipY && ['cloth','torso_core','cloth_detail','sheer','sheer_soft'].includes(lbl)){ promote(r,'lower_cloth',64,'waist/crotch lower cloth'); report.lower++; continue; }
  }
  return report;
}
function reapplyReviewPolicy0913(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  const small=new Set(['eye_candidate','ear_candidate','hand_candidate','ornament_candidate']);
  const info=new Set(['soft_shell','unknown_soft','soft_edge','bg_residue','background_residue','detail_candidate']);
  const stable=new Set(['face','eyes','ears','hands','neck','pelvis','left_leg','right_leg','left_foot','right_foot',
    'front_hair','side_hair_left','side_hair_right','back_hair','hair_highlight','hair_shadow','hair_accessory',
    'collar','sleeve_left','sleeve_right','upper_cloth','lower_cloth','belt','cloth_shadow','cloth_highlight','cloth_ornament','transparent_cloth',
    'body_ornament','hair_ornament','shoe_ornament','necklace','torso_core','hair','cloth','shoes','legs']);
  let blocking=[],candidate=[],infoList=[],stableList=[];
  for(const r of res.candidates){
    const lbl=r.label||'unknown';
    if(r.phase4Promoted0913 || r.phase2Confirmed0911 || r.structurePromoted0912 || stable.has(lbl)){
      r.needsReview=false; r.reviewType0910='none'; r.candidateReview0910=false; r.infoReview0910=false; r.blockingReview0910=false; r.qualityBlocking0910=false; stableList.push(r); continue;
    }
    if(small.has(lbl) || r.smallPartCandidate099){ r.needsReview=false; r.reviewType0910='candidate'; r.candidateReview0910=true; r.blockingReview0910=false; r.qualityBlocking0910=false; candidate.push(r); continue; }
    if(info.has(lbl)){ r.needsReview=false; r.reviewType0910='info'; r.infoReview0910=true; r.blockingReview0910=false; r.qualityBlocking0910=false; infoList.push(r); continue; }
    const low=Number(r.confidence??r.conf??0)<58;
    const warn=!!(r.boundaryWarning0984 || (r.boundaryStabilize0984&&r.boundaryStabilize0984.needs_review));
    if(['needs_review','unknown','boundary_review','skin_candidate','ambiguous_overlap'].includes(lbl)||low||warn){ r.needsReview=true; r.reviewType0910='blocking'; r.blockingReview0910=true; r.qualityBlocking0910=true; blocking.push(r); }
    else stableList.push(r);
  }
  function counts(list){ return list.reduce((a,r)=>{a[r.label]=(a[r.label]||0)+1;return a;},{}); }
  const warnings=[];
  if(!res.candidates.some(r=>r.label==='face')) warnings.push('face_missing');
  if(!res.candidates.some(r=>['upper_cloth','torso_core','cloth','collar'].includes(r.label))) warnings.push('upper_cloth_missing');
  const report={enabled:true,status:blocking.length?'needs_blocking_review':'ok',total:res.candidates.length,blocking_count:blocking.length,candidate_count:candidate.length,info_count:infoList.length,stable_count:stableList.length,blocking_by_label:counts(blocking),candidate_by_label:counts(candidate),info_by_label:counts(infoList),warnings,ok:blocking.length===0&&warnings.indexOf('face_missing')<0,phase4_reapplied:true};
  res.reviewPolicy0910=report; res.reviewPolicy0911=report; res.reviewPolicy0912=report; res.reviewPolicy0913=report;
  res.reviewTargets0910=blocking.concat(candidate).sort((a,b)=>{const pa=a.reviewType0910==='blocking'?0:1,pb=b.reviewType0910==='blocking'?0:1;return pa-pb||(b.area||0)-(a.area||0);});
  return report;
}
function semanticDecompose0913(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  ensureLabels0913();
  const a=anchors0913(res);
  const before=(res.candidates||[]).reduce((acc,r)=>{acc[r.label]=(acc[r.label]||0)+1;return acc;},{});
  const hair=hairSemantic0913(res,a);
  const cloth=clothSemantic0913(res,a);
  const after=(res.candidates||[]).reduce((acc,r)=>{acc[r.label]=(acc[r.label]||0)+1;return acc;},{});
  const promoted=res.candidates.filter(r=>r.phase4Promoted0913).length;
  const report={enabled:true,status:'ok',version:VERSION_0913,anchors:a,before,after,promoted_total:promoted,hair,cloth};
  res.semanticDecompose0913=report;
  reapplyReviewPolicy0913(res);
  return report;
}
const oldAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0913(){
  if(!oldAnalyze) return;
  await oldAnalyze();
  try{
    const res=state.result;
    if(!res) return;
    semanticDecompose0913(res);
    if(!state.selectedPart || state.selectedPart==='soft_shell') state.selectedPart='full_foreground';
    renderAll();
  }catch(e){ console.warn('v0.9.13 Phase4 failed',e); }
}
window.analyze0913=analyze0913;
try{
  analyze=analyze0913;
  const run=safeQS('run'); if(run) run.onclick=analyze0913;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0913;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{
    const el=safeQS(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)}; analyze0913(); };
  });
}catch(e){}
if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    if(!state.result) return [];
    const targets=state.result.reviewTargets0910||[];
    const blocking=targets.filter(r=>r.reviewType0910==='blocking'||r.needsReview);
    const candidate=targets.filter(r=>r.reviewType0910==='candidate'&&!r.phase2Confirmed0911&&!r.structurePromoted0912&&!r.phase4Promoted0913);
    const priority={face:0,upper_cloth:1,collar:2,front_hair:3,chest_skin:4,neck:5,boundary_review:6,skin_candidate:7,needs_review:8,unknown:9,eye_candidate:10,ear_candidate:11,hand_candidate:12,ornament_candidate:13};
    const sortFn=(a,b)=>(priority[a.label]??99)-(priority[b.label]??99)||(b.area||0)-(a.area||0);
    return (blocking.length?blocking:candidate).sort(sortFn).slice(0,5);
  };
}
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_0913;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0913;
    m.phase='Phase4: hair_cloth_semantic_decomposition';
    m.semantic_decompose_v0913=state.result?.semanticDecompose0913||{enabled:true,status:'not_run'};
    m.review_policy_v0913=state.result?.reviewPolicy0913||state.result?.reviewPolicy0912||state.result?.reviewPolicy0911||state.result?.reviewPolicy0910||{enabled:true,status:'not_run'};
    m.region=m.region||{};
    const pol=state.result?.reviewPolicy0913||state.result?.reviewPolicy0912||state.result?.reviewPolicy0911||state.result?.reviewPolicy0910;
    if(pol){ m.region.review_after=pol.blocking_count; m.region.candidate_review=pol.candidate_count; m.region.info_review=pol.info_count; }
    if(m.quality_v096){
      m.quality_v096.version=VERSION_0913;
      if(pol){ m.quality_v096.review_target_count=pol.blocking_count; m.quality_v096.candidate_review_count=pol.candidate_count; m.quality_v096.info_review_count=pol.info_count; m.quality_v096.ok=!!pol.ok; m.quality_v096.warnings=[...(pol.warnings||[])]; }
      m.quality_v096.semantic_promoted_total=state.result?.semanticDecompose0913?.promoted_total||0;
    }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){
          p.label=live.label; p.label_ja=labelName(live.label); p.confidence=live.confidence||live.conf||p.confidence;
          p.phase4_semantic_v0913=live.phase4Semantic0913||null;
          p.phase4_promoted_v0913=!!live.phase4Promoted0913;
          p.phase4_source_v0913=live.phase4Source0913||null;
          p.structure_role_v0912=live.structureRole0912||null;
          p.structure_zone_v0912=live.structureZone0912||null;
          p.review_type_v0910=live.reviewType0910||'none';
          p.needs_review=!!live.needsReview;
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
    const log=safeQS('log'), s=state.result?.semanticDecompose0913||{}, p=state.result?.reviewPolicy0913||state.result?.reviewPolicy0912||state.result?.reviewPolicy0911||state.result?.reviewPolicy0910||{};
    if(log){
      const h=s.hair||{}, c=s.cloth||{};
      log.textContent+=`\n[v0.9.13 Phase4]\npromoted=${s.promoted_total??'-'} hair(front=${h.front||0}, sideL=${h.side_left||0}, sideR=${h.side_right||0}, back=${h.back||0}, hi=${h.highlight||0}, sh=${h.shadow||0}, acc=${h.accessory||0})\ncloth(collar=${c.collar||0}, sleeveL=${c.sleeve_left||0}, sleeveR=${c.sleeve_right||0}, upper=${c.upper||0}, lower=${c.lower||0}, belt=${c.belt||0}, ornament=${c.ornament||0}, transparent=${c.transparent||0})\nreview: blocking=${p.blocking_count??'-'} candidate=${p.candidate_count??'-'} info=${p.info_count??'-'} status=${p.status||'-'}\n`;
    }
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.13 Phase4';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.13 Phase4';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.13 Phase4: 髪/服を前髪・横髪・襟・袖・上衣・下衣などの意味ラベルへ分解します。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.13 Phase4は意味分解レイヤーです。髪と服を大分類のままにせず、32x32化で残すべきシルエット単位へ整理します。';
  const json=safeQS('json'); if(json) json.onclick=()=>{ if(!state.result) return; downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_13_phase4.json','application/json'); };
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{ let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean); let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines + Structure','Color Cluster','Region Before','Region After','Candidates / Semantics','Unknown Before','Review Policy','Part']; let W=960,H=1850,c=document.createElement('canvas'); c.width=W;c.height=H; let ctx=c.getContext('2d'); ctx.fillStyle='#0f1520'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#e8eef8'; ctx.font='26px sans-serif'; ctx.fillText('Sprite Studio Region Viewer v0.9.13 Phase4 Summary',20,36); let cellW=290,cellH=320; for(let i=0;i<cards.length;i++){ let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35); ctx.fillStyle='#202a3a'; ctx.fillRect(x,y,cellW,32); ctx.fillStyle='#e8eef8'; ctx.font='16px sans-serif'; ctx.fillText(titles[i],x+8,y+22); ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width)); } c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_13_phase4.png','image/png')); };
}catch(e){ console.warn('v0.9.13 Phase4 setup failed',e); }
})();
