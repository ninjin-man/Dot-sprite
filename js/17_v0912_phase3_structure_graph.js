// ===== v0.9.12 Phase3 patch: structure graph + anatomy roles =====
(function(){
'use strict';
const VERSION_0912='0.9.12-phase3';
const PREPROCESSOR_VERSION_0912='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline+phase1-review-policy-baseline+phase2-confirm-small-parts+phase3-structure-graph';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function box(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0,maxx:r.maxx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)-1),maxy:r.maxy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)-1),cx:r.cx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)/2),cy:r.cy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)/2)}; }
function area(r){ return r.area || Math.max(1,(r.w||0)*(r.h||0)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function ensureLabels0912(){
  try{
    Object.assign(LABELS,{
      neck:'首', torso_core:'胴体コア', pelvis:'骨盤/腰',
      left_arm:'左腕推定', right_arm:'右腕推定', left_leg:'左脚', right_leg:'右脚',
      left_foot:'左足元', right_foot:'右足元', structure_info:'構造情報'
    });
    Object.assign(COLORS,{
      neck:[120,220,255], torso_core:[72,219,152], pelvis:[64,170,255],
      left_arm:[255,175,85], right_arm:[255,146,75], left_leg:[140,120,255], right_leg:[118,96,245],
      left_foot:[245,210,85], right_foot:[235,196,65], structure_info:[140,160,190]
    });
  }catch(e){}
}
ensureLabels0912();
function addReason(r,msg){ r.reason=(r.reason||'')+' / '+msg; }
function intersectsExpanded(a,b,gap=5){ return !(a.maxx+gap<b.x||b.maxx+gap<a.x||a.maxy+gap<b.y||b.maxy+gap<a.y); }
function isCentralX(x,cx,halfWidth,extra=0){ return Math.abs(x-cx)<=halfWidth+extra; }
function computeAnchors0912(res){
  const lines=res.lines||{};
  const img=res.imgData||{width:state.w||1,height:state.h||1};
  const bbox=lines.bbox||res.pre?.bbox||{minx:0,miny:0,maxx:img.width-1,maxy:img.height-1,w:img.width,h:img.height,area:img.width*img.height};
  const cx=Number.isFinite(lines.cx)?lines.cx:Math.round((bbox.minx+bbox.maxx)/2);
  const faceTop=Number.isFinite(lines.faceTop)?lines.faceTop:(Number.isFinite(lines.head)?lines.head:Math.round(img.height*0.08));
  const faceBot=Number.isFinite(lines.faceBot)?lines.faceBot:(Number.isFinite(lines.face)?lines.face:Math.round(img.height*0.25));
  const shoulder=Number.isFinite(lines.shoulder)?lines.shoulder:Math.round(img.height*0.34);
  const neckLine=Number.isFinite(lines.neckLine)?lines.neckLine:(Number.isFinite(lines.neck)?lines.neck:Math.round(faceBot+(shoulder-faceBot)*0.42));
  const waist=Number.isFinite(lines.waist)?lines.waist:Math.round(img.height*0.56);
  const crotch=Number.isFinite(lines.crotch)?lines.crotch:Math.round(img.height*0.68);
  const ankle=Number.isFinite(lines.ankle)?lines.ankle:Math.round(img.height*0.86);
  const feet=(Number.isFinite(lines.feet)?lines.feet:Math.min(img.height-1,Math.round(ankle+(img.height-ankle)*0.5)));
  const shoulderLeft=Number.isFinite(lines.shoulderLeft)?lines.shoulderLeft:Math.max(0,Math.round(cx-bbox.w*0.18));
  const shoulderRight=Number.isFinite(lines.shoulderRight)?lines.shoulderRight:Math.min(img.width-1,Math.round(cx+bbox.w*0.18));
  const torsoHalf=Math.max(6,Math.round((shoulderRight-shoulderLeft)*0.58));
  const hipY=Math.round((waist+crotch)*0.5);
  const handLeft=(res.candidates||[]).filter(r=>r.label==='hands' && ((r.phase2Side0911||'')==='left')).sort((a,b)=>area(b)-area(a))[0]||null;
  const handRight=(res.candidates||[]).filter(r=>r.label==='hands' && ((r.phase2Side0911||'')==='right')).sort((a,b)=>area(b)-area(a))[0]||null;
  const leftHandPt=handLeft?{x:Math.round(box(handLeft).cx),y:Math.round(box(handLeft).cy)}:{x:Math.max(0,shoulderLeft-Math.round(bbox.w*0.08)),y:Math.round((shoulder+waist)*0.6)};
  const rightHandPt=handRight?{x:Math.round(box(handRight).cx),y:Math.round(box(handRight).cy)}:{x:Math.min(img.width-1,shoulderRight+Math.round(bbox.w*0.08)),y:Math.round((shoulder+waist)*0.6)};
  return {bbox,cx,faceTop,faceBot,neckLine,shoulder,waist,hipY,crotch,ankle,feet,shoulderLeft,shoulderRight,torsoHalf,leftShoulder:{x:shoulderLeft,y:shoulder},rightShoulder:{x:shoulderRight,y:shoulder},torsoCenter:{x:cx,y:Math.round((shoulder+waist)*0.5)},pelvisCenter:{x:cx,y:hipY},leftHand:leftHandPt,rightHand:rightHandPt};
}
function roleFromLabelAndZone(r,zone,side){
  const lbl=r.label||'unknown';
  if(['hair','hair_soft','hair_tip','hair_ornament'].includes(lbl)) return 'head';
  if(['face','eyes','ears'].includes(lbl)) return lbl;
  if(lbl==='neck') return 'neck';
  if(['necklace'].includes(lbl)) return 'neck';
  if(['cloth','chest_skin','torso_core','body_ornament'].includes(lbl)) return zone.startsWith('torso')||zone==='hip'?'torso':'torso';
  if(lbl==='hands') return side==='left'?'left_hand':'right_hand';
  if(['shoes','shoe_ornament','left_foot','right_foot'].includes(lbl)) return side==='left'?'left_foot':'right_foot';
  if(['left_leg','right_leg'].includes(lbl)) return lbl;
  if(['legs','leg'].includes(lbl)) return side==='left'?'left_leg':'right_leg';
  if(zone==='neck') return 'neck';
  if(zone==='left_arm') return 'left_arm';
  if(zone==='right_arm') return 'right_arm';
  if(zone==='left_leg') return 'left_leg';
  if(zone==='right_leg') return 'right_leg';
  if(zone==='left_foot') return 'left_foot';
  if(zone==='right_foot') return 'right_foot';
  if(zone==='torso_upper' || zone==='torso_lower' || zone==='hip') return 'torso';
  return 'unknown';
}
function zoneFor0912(r,a){
  const b=box(r), side=b.cx<a.cx?'left':'right', torsoHalf=a.torsoHalf;
  let zone='unknown';
  if(b.cy<a.faceTop) zone='head';
  else if(b.cy<=a.faceBot) zone='face';
  else if(b.cy<=a.shoulder+2){
    zone=isCentralX(b.cx,a.cx,Math.max(5,torsoHalf*0.34),2)?'neck':(side==='left'?'left_head_side':'right_head_side');
  }else if(b.cy<=a.waist){
    zone=isCentralX(b.cx,a.cx,torsoHalf,2)?'torso_upper':(side==='left'?'left_arm':'right_arm');
  }else if(b.cy<=a.crotch){
    if(isCentralX(b.cx,a.cx,torsoHalf*.9,2)) zone='hip';
    else zone=(side==='left'?'left_arm':'right_arm');
  }else if(b.cy<=a.ankle){
    zone=(side==='left'?'left_leg':'right_leg');
  }else zone=(side==='left'?'left_foot':'right_foot');
  return {zone,side};
}
function promoteNeck0912(res,a){
  let promoted=[];
  for(const r of (res.candidates||[])){
    if(['face','eyes','ears','hair','hands','shoes','legs','left_leg','right_leg','left_foot','right_foot','torso_core','pelvis','neck'].includes(r.label)) continue;
    const b=box(r);
    const nearY=b.cy>=a.faceBot-3 && b.cy<=a.shoulder+6;
    const nearX=isCentralX(b.cx,a.cx,Math.max(5,a.torsoHalf*0.32),2);
    const compact=area(r)<=Math.max(220,Math.round(a.bbox.area*0.055));
    const maybeSkin=['skin_candidate','chest_skin','unknown','cloth_detail','sheer_soft','background_residue'].includes(r.label) || ((r.sat||0)<0.52 && (r.val||0)>0.24);
    if(nearY && nearX && compact && maybeSkin){
      r.structurePromoted0912=true;
      r.structureSource0912=r.label;
      r.label='neck';
      r.conf=Math.max(r.conf||0,64);
      r.confidence=Math.max(r.confidence||0,64);
      r.finalConfidence=Math.max(r.finalConfidence||0,64);
      r.needsReview=false;
      r.reviewType0910='none';
      r.candidateReview0910=false;
      r.blockingReview0910=false;
      r.qualityBlocking0910=false;
      addReason(r,'v0.9.12 neck by center neck-band anatomy');
      promoted.push(r);
    }
  }
  return promoted;
}
function annotateRoles0912(res,a){
  const roleCount={};
  for(const r of (res.candidates||[])){
    const z=zoneFor0912(r,a);
    r.structureZone0912=z.zone;
    r.structureSide0912=(r.phase2Side0911||z.side||null);
    r.structureRole0912=roleFromLabelAndZone(r,z.zone,r.structureSide0912);
    roleCount[r.structureRole0912]=(roleCount[r.structureRole0912]||0)+1;
  }
  return roleCount;
}
function buildNodes0912(res,a){
  const nodeNames=['head','face','eyes','ears','neck','torso','pelvis','left_arm','right_arm','left_hand','right_hand','left_leg','right_leg','left_foot','right_foot'];
  const nodes={};
  nodeNames.forEach(n=>nodes[n]={name:n,label_ja:labelName(n),parts:[],count:0,bbox:null});
  for(const r of (res.candidates||[])){
    let role=r.structureRole0912||'unknown';
    if(role==='unknown') continue;
    if(role==='head' && r.label==='face') role='face';
    if(role==='head' && r.label==='hair') role='head';
    if(role==='hands') role=(r.structureSide0912||'left')==='left'?'left_hand':'right_hand';
    if(!nodes[role]) continue;
    nodes[role].parts.push(r);
  }
  for(const n of Object.values(nodes)){
    n.count=n.parts.length;
    if(!n.parts.length) continue;
    let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
    for(const r of n.parts){ const b=box(r); minx=Math.min(minx,b.x); miny=Math.min(miny,b.y); maxx=Math.max(maxx,b.maxx); maxy=Math.max(maxy,b.maxy); }
    n.bbox={minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1,cx:Math.round((minx+maxx)/2),cy:Math.round((miny+maxy)/2)};
  }
  if(!nodes.torso.count){
    nodes.torso.anchorOnly=true;
    nodes.torso.bbox={minx:a.shoulderLeft,miny:a.shoulder,maxx:a.shoulderRight,maxy:a.crotch,w:a.shoulderRight-a.shoulderLeft+1,h:a.crotch-a.shoulder+1,cx:a.cx,cy:Math.round((a.shoulder+a.crotch)/2)};
  }
  if(!nodes.pelvis.count){
    nodes.pelvis.anchorOnly=true;
    nodes.pelvis.bbox={minx:a.cx-a.torsoHalf,miny:a.waist,maxx:a.cx+a.torsoHalf,maxy:a.crotch,w:a.torsoHalf*2+1,h:a.crotch-a.waist+1,cx:a.cx,cy:a.hipY};
  }
  return nodes;
}
function edgeScore0912(nodes,from,to){
  const A=nodes[from], B=nodes[to];
  if(!A||!B||!A.bbox||!B.bbox) return {score:0,status:'missing'};
  const a=A.bbox,b=B.bbox;
  const dx=Math.abs((a.cx||0)-(b.cx||0));
  const dy=Math.abs((a.cy||0)-(b.cy||0));
  const scale=Math.max(12,Math.max(a.h||0,b.h||0));
  let score=85;
  score-=clamp(Math.round(dx/Math.max(1,scale)*18),0,40);
  score-=clamp(Math.round(dy/Math.max(1,scale*2)*10),0,22);
  if(A.anchorOnly||B.anchorOnly) score-=6;
  if(A.count===0||B.count===0) score-=16;
  return {score:clamp(score,0,96),status:score>=60?'ok':(score>=42?'weak':'missing')};
}
function buildEdges0912(nodes){
  const pairs=[['head','neck'],['face','neck'],['eyes','face'],['ears','face'],['neck','torso'],['torso','pelvis'],['torso','left_arm'],['torso','right_arm'],['left_arm','left_hand'],['right_arm','right_hand'],['pelvis','left_leg'],['pelvis','right_leg'],['left_leg','left_foot'],['right_leg','right_foot']];
  return pairs.map(([from,to])=>({from,to,...edgeScore0912(nodes,from,to)}));
}
function refineArmsAndLegs0912(res,a,nodes){
  const torsoBox=nodes.torso?.bbox||{minx:a.shoulderLeft,maxx:a.shoulderRight,miny:a.shoulder,maxy:a.crotch};
  let promoted={left_arm:0,right_arm:0,left_leg:0,right_leg:0,left_foot:0,right_foot:0,torso_core:0,pelvis:0};
  for(const r of (res.candidates||[])){
    const b=box(r), role=r.structureRole0912, side=r.structureSide0912||'left';
    if(r.label==='cloth' || r.label==='chest_skin' || r.label==='body_ornament' || r.label==='necklace'){
      if(intersectsExpanded(b,torsoBox,3) && b.cy>=a.shoulder-4 && b.cy<=a.crotch+6){
        if(r.label!=='torso_core' && area(r)>=Math.max(40,Math.round(a.bbox.area*0.01))){
          r.structurePromoted0912=true; r.structureSource0912=r.label; r.label='torso_core'; r.conf=Math.max(r.conf||0,60); r.confidence=Math.max(r.confidence||0,60); r.finalConfidence=Math.max(r.finalConfidence||0,60); addReason(r,'v0.9.12 torso_core by central anatomy band'); promoted.torso_core++; }
      }
    }
    if(role==='torso' && b.cy>=a.waist-2 && b.cy<=a.crotch+6 && Math.abs(b.cx-a.cx)<=a.torsoHalf+3){
      r.structureRole0912='pelvis'; if(r.label==='torso_core' || r.label==='cloth'){ promoted.pelvis++; }
    }
    if(['unknown','skin_candidate','sheer','sheer_soft','cloth_detail'].includes(r.label) && b.cy>=a.shoulder-2 && b.cy<=a.crotch+6 && !intersectsExpanded(b,torsoBox,2)){
      if(side==='left' && b.cx<a.cx-a.torsoHalf*0.25){ r.structureRole0912='left_arm'; promoted.left_arm++; }
      if(side==='right' && b.cx>a.cx+a.torsoHalf*0.25){ r.structureRole0912='right_arm'; promoted.right_arm++; }
    }
    if((r.label==='legs' || r.label==='leg' || role==='left_leg' || role==='right_leg') && b.cy>=a.crotch-2){
      r.structureRole0912=side==='left'?'left_leg':'right_leg'; promoted[r.structureRole0912]++;
      if(r.label==='legs' || r.label==='leg'){
        r.label=side==='left'?'left_leg':'right_leg';
        r.conf=Math.max(r.conf||0,62); r.confidence=Math.max(r.confidence||0,62); r.finalConfidence=Math.max(r.finalConfidence||0,62);
        addReason(r,'v0.9.12 sided leg by pelvis/ankle anatomy');
      }
    }
    if((r.label==='shoes' || r.label==='shoe_ornament') && b.cy>=a.ankle-2){
      r.structureRole0912=side==='left'?'left_foot':'right_foot'; promoted[r.structureRole0912]++;
      if(r.label==='shoes'){
        r.label=side==='left'?'left_foot':'right_foot';
        r.conf=Math.max(r.conf||0,64); r.confidence=Math.max(r.confidence||0,64); r.finalConfidence=Math.max(r.finalConfidence||0,64);
        addReason(r,'v0.9.12 sided foot by ankle/side anatomy');
      }
    }
  }
  return promoted;
}
function reapplyReviewPolicy0912(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  const small=new Set(['eye_candidate','ear_candidate','hand_candidate','ornament_candidate']);
  const info=new Set(['soft_shell','hair_soft','sheer_soft','unknown_soft','soft_edge','bg_residue','background_residue','cloth_detail','ornament_detail','hair_tip','face_detail','detail_candidate']);
  const stable=new Set(['face','hair','eyes','ears','hands','body_ornament','hair_ornament','shoe_ornament','necklace','neck','torso_core','pelvis','left_leg','right_leg','left_foot','right_foot']);
  let blocking=[],candidate=[],infoList=[],stableList=[];
  for(const r of res.candidates){
    const lbl=r.label||'unknown';
    if(r.phase2Confirmed0911 || r.structurePromoted0912 || stable.has(lbl)){
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
  if(!res.candidates.some(r=>['torso_core','cloth','chest_skin','body_ornament'].includes(r.label))) warnings.push('torso_missing');
  const report={enabled:true,status:blocking.length?'needs_blocking_review':'ok',total:res.candidates.length,blocking_count:blocking.length,candidate_count:candidate.length,info_count:infoList.length,stable_count:stableList.length,blocking_by_label:counts(blocking),candidate_by_label:counts(candidate),info_by_label:counts(infoList),warnings,ok:blocking.length===0&&warnings.indexOf('face_missing')<0,phase3_reapplied:true};
  res.reviewPolicy0910=report; res.reviewPolicy0911=report; res.reviewPolicy0912=report;
  res.reviewTargets0910=blocking.concat(candidate).sort((a,b)=>{const pa=a.reviewType0910==='blocking'?0:1,pb=b.reviewType0910==='blocking'?0:1;return pa-pb||(b.area||0)-(a.area||0);});
  return report;
}
function buildStructureGraph0912(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  ensureLabels0912();
  const anchors=computeAnchors0912(res);
  const neckPromoted=promoteNeck0912(res,anchors);
  const roleCountBefore=annotateRoles0912(res,anchors);
  const nodesPre=buildNodes0912(res,anchors);
  const refined=refineArmsAndLegs0912(res,anchors,nodesPre);
  const roleCountAfter=annotateRoles0912(res,anchors);
  const nodes=buildNodes0912(res,anchors);
  const edges=buildEdges0912(nodes);
  const nodeSummary={};
  for(const [k,v] of Object.entries(nodes)) nodeSummary[k]={count:v.count,anchorOnly:!!v.anchorOnly,bbox:v.bbox||null};
  const report={enabled:true,status:'ok',version:VERSION_0912,anchors,neck_promoted:neckPromoted.length,role_count_before:roleCountBefore,role_count_after:roleCountAfter,refined,edges,nodes:nodeSummary,edge_ok:edges.filter(e=>e.status==='ok').length,edge_weak:edges.filter(e=>e.status==='weak').length,edge_missing:edges.filter(e=>e.status==='missing').length};
  res.structureGraph0912=report;
  res.structureNodes0912=nodes;
  reapplyReviewPolicy0912(res);
  return report;
}
function drawStructureOverlay0912(baseDraw,img,lines){
  if(typeof baseDraw==='function') baseDraw(img.canvas||img, img.image||img, lines);
}
const oldAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0912(){
  if(!oldAnalyze) return;
  await oldAnalyze();
  try{
    const res=state.result;
    if(!res) return;
    buildStructureGraph0912(res);
    if(!state.selectedPart || state.selectedPart==='soft_shell') state.selectedPart='full_foreground';
    renderAll();
  }catch(e){ console.warn('v0.9.12 Phase3 failed',e); }
}
window.analyze0912=analyze0912;
try{
  analyze=analyze0912;
  const run=safeQS('run'); if(run) run.onclick=analyze0912;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0912;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{
    const el=safeQS(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)}; analyze0912(); };
  });
}catch(e){}
if(typeof drawLines==='function'){
  const oldDrawLines=drawLines;
  drawLines=function(c,img,lines){
    oldDrawLines(c,img,lines);
    const g=state.result?.structureGraph0912; if(!g||!g.anchors) return;
    const a=g.anchors, ctx=c.getContext('2d');
    ctx.save();
    ctx.font='11px sans-serif';
    ctx.lineWidth=2;
    ctx.strokeStyle='#6fd3ff'; ctx.fillStyle='#6fd3ff';
    ctx.beginPath(); ctx.moveTo(0,a.neckLine); ctx.lineTo(c.width,a.neckLine); ctx.stroke(); ctx.fillText('NECK',4,Math.max(10,a.neckLine-3));
    ctx.strokeStyle='#ffd166'; ctx.fillStyle='#ffd166';
    ctx.beginPath(); ctx.moveTo(a.shoulderLeft,0); ctx.lineTo(a.shoulderLeft,c.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.shoulderRight,0); ctx.lineTo(a.shoulderRight,c.height); ctx.stroke();
    ctx.fillText('S-L',Math.max(2,a.shoulderLeft+2),12); ctx.fillText('S-R',Math.max(2,a.shoulderRight+2),24);
    ctx.strokeStyle='rgba(255,175,85,.95)';
    ctx.beginPath(); ctx.moveTo(a.leftShoulder.x,a.leftShoulder.y); ctx.lineTo(a.leftHand.x,a.leftHand.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.rightShoulder.x,a.rightShoulder.y); ctx.lineTo(a.rightHand.x,a.rightHand.y); ctx.stroke();
    ctx.fillStyle='rgba(255,175,85,.95)'; ctx.fillText('ARM-L',Math.max(2,a.leftHand.x-40),Math.max(12,a.leftHand.y-4)); ctx.fillText('ARM-R',Math.max(2,a.rightHand.x-40),Math.max(12,a.rightHand.y-4));
    ctx.strokeStyle='rgba(118,96,245,.95)';
    ctx.beginPath(); ctx.moveTo(a.cx,a.hipY); ctx.lineTo(a.cx-a.torsoHalf,a.ankle); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.cx,a.hipY); ctx.lineTo(a.cx+a.torsoHalf,a.ankle); ctx.stroke();
    ctx.fillStyle='rgba(118,96,245,.95)'; ctx.fillText('LEG-L',Math.max(2,a.cx-a.torsoHalf-30),Math.max(12,a.ankle-4)); ctx.fillText('LEG-R',Math.max(2,a.cx+a.torsoHalf-8),Math.max(12,a.ankle-4));
    ctx.restore();
  };
}
if(typeof makeReviewQueue==='function'){
  makeReviewQueue=function(){
    if(!state.result) return [];
    const targets=state.result.reviewTargets0910||[];
    const blocking=targets.filter(r=>r.reviewType0910==='blocking'||r.needsReview);
    const candidate=targets.filter(r=>r.reviewType0910==='candidate'&&!r.phase2Confirmed0911&&!r.structurePromoted0912);
    const priority={face:0,torso_core:1,chest_skin:2,neck:3,boundary_review:4,skin_candidate:5,needs_review:6,unknown:7,eye_candidate:10,ear_candidate:11,hand_candidate:12,ornament_candidate:13};
    const sortFn=(a,b)=>(priority[a.label]??99)-(priority[b.label]??99)||(b.area||0)-(a.area||0);
    return (blocking.length?blocking:candidate).sort(sortFn).slice(0,5);
  };
}
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_0912;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0912;
    m.phase='Phase3: anatomy_structure_graph';
    m.structure_graph_v0912=state.result?.structureGraph0912||{enabled:true,status:'not_run'};
    m.review_policy_v0912=state.result?.reviewPolicy0912||state.result?.reviewPolicy0911||state.result?.reviewPolicy0910||{enabled:true,status:'not_run'};
    m.region=m.region||{};
    const pol=state.result?.reviewPolicy0912||state.result?.reviewPolicy0911||state.result?.reviewPolicy0910;
    if(pol){ m.region.review_after=pol.blocking_count; m.region.candidate_review=pol.candidate_count; m.region.info_review=pol.info_count; }
    if(m.quality_v096){
      m.quality_v096.version=VERSION_0912;
      if(pol){ m.quality_v096.review_target_count=pol.blocking_count; m.quality_v096.candidate_review_count=pol.candidate_count; m.quality_v096.info_review_count=pol.info_count; m.quality_v096.ok=!!pol.ok; m.quality_v096.warnings=[...(pol.warnings||[])]; }
      m.quality_v096.structure_edge_ok=state.result?.structureGraph0912?.edge_ok||0;
      m.quality_v096.structure_edge_weak=state.result?.structureGraph0912?.edge_weak||0;
      m.quality_v096.structure_edge_missing=state.result?.structureGraph0912?.edge_missing||0;
    }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){
          p.label=live.label; p.label_ja=labelName(live.label); p.confidence=live.confidence||live.conf||p.confidence;
          p.structure_zone_v0912=live.structureZone0912||null;
          p.structure_side_v0912=live.structureSide0912||null;
          p.structure_role_v0912=live.structureRole0912||null;
          p.structure_promoted_v0912=!!live.structurePromoted0912;
          p.structure_source_v0912=live.structureSource0912||null;
          p.phase2_confirmed_v0911=!!live.phase2Confirmed0911;
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
    const log=safeQS('log'), g=state.result?.structureGraph0912||{}, p=state.result?.reviewPolicy0912||state.result?.reviewPolicy0911||state.result?.reviewPolicy0910||{};
    if(log){
      const nodeTxt=g.nodes?Object.entries(g.nodes).filter(([,v])=>(v.count||0)>0 || v.anchorOnly).map(([k,v])=>`${k}:${v.count}${v.anchorOnly?'*':''}`).join(' / '):'-';
      const edgeTxt=Array.isArray(g.edges)?g.edges.filter(e=>e.status!=='missing').map(e=>`${e.from}->${e.to}(${e.score})`).slice(0,10).join(', '):'-';
      log.textContent+=`\n[v0.9.12 Phase3]\nneck_promoted=${g.neck_promoted??'-'} edge_ok=${g.edge_ok??'-'} weak=${g.edge_weak??'-'} missing=${g.edge_missing??'-'}\nreview: blocking=${p.blocking_count??'-'} candidate=${p.candidate_count??'-'} info=${p.info_count??'-'} status=${p.status||'-'}\nnodes: ${nodeTxt}\nedges: ${edgeTxt}\n`;
    }
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.12 Phase3';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.12 Phase3';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.12 Phase3: 首・胴・腕・脚の構造グラフを追加し、左右/接続関係で役割を整理します。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.12 Phase3は人体構造レイヤーです。首・胴・腕・脚・足元のアンカーを作り、候補部位を構造役割へ整理します。';
  const json=safeQS('json'); if(json) json.onclick=()=>{ if(!state.result) return; downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_12_phase3.json','application/json'); };
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{ let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean); let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines + Structure','Color Cluster','Region Before','Region After','Candidates / Structure','Unknown Before','Review Policy','Part']; let W=960,H=1850,c=document.createElement('canvas'); c.width=W;c.height=H; let ctx=c.getContext('2d'); ctx.fillStyle='#0f1520'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#e8eef8'; ctx.font='26px sans-serif'; ctx.fillText('Sprite Studio Region Viewer v0.9.12 Phase3 Summary',20,36); let cellW=290,cellH=320; for(let i=0;i<cards.length;i++){ let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35); ctx.fillStyle='#202a3a'; ctx.fillRect(x,y,cellW,32); ctx.fillStyle='#e8eef8'; ctx.font='16px sans-serif'; ctx.fillText(titles[i],x+8,y+22); ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width)); } c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_12_phase3.png','image/png')); };
}catch(e){ console.warn('v0.9.12 Phase3 setup failed',e); }
})();
