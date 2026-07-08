// ===== v0.9.14 Phase5 patch: pixel-art simplification plan =====
(function(){
'use strict';
const VERSION_0914='0.9.14-phase5';
const PREPROCESSOR_VERSION_0914='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+zoom-preview+memory-v2+review-reduction+face-body-split+generic-face-chest-guard+boundary-stabilize+small-parts-baseline+phase1-review-policy-baseline+phase2-confirm-small-parts+phase3-structure-graph+phase4-hair-cloth-semantics+phase5-pixel-simplification';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function box(r){ return {x:r.minx??r.bbox?.[0]??r.x??0,y:r.miny??r.bbox?.[1]??r.y??0,w:r.w??r.bbox?.[2]??0,h:r.h??r.bbox?.[3]??0,maxx:r.maxx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)-1),maxy:r.maxy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)-1),cx:r.cx??((r.minx??r.x??0)+(r.w??r.bbox?.[2]??0)/2),cy:r.cy??((r.miny??r.y??0)+(r.h??r.bbox?.[3]??0)/2)}; }
function area(r){ return r.area || Math.max(1,(r.w||0)*(r.h||0)); }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function ensureLabels0914(){
  try{
    Object.assign(LABELS,{
      pixel_keep:'32px維持', pixel_merge:'32px統合', pixel_hint:'32px補助', pixel_omit:'32px省略候補',
      silhouette_main:'主シルエット', palette_key:'代表色'
    });
    Object.assign(COLORS,{
      pixel_keep:[80,220,140], pixel_merge:[255,196,80], pixel_hint:[88,166,255], pixel_omit:[130,140,160],
      silhouette_main:[90,235,180], palette_key:[255,220,90]
    });
  }catch(e){}
}
ensureLabels0914();
function avgColor(r){
  const m=r.mean||[160,160,160];
  return [Math.round(m[0]||0),Math.round(m[1]||0),Math.round(m[2]||0)];
}
function hex(c){ return '#'+c.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join(''); }
function anchors0914(res){
  const g=res.structureGraph0912?.anchors||res.semanticDecompose0913?.anchors||{};
  const lines=res.lines||{};
  const img=res.imgData||{width:state.w||1,height:state.h||1};
  const bbox=lines.bbox||res.pre?.bbox||g.bbox||{minx:0,miny:0,maxx:img.width-1,maxy:img.height-1,w:img.width,h:img.height,area:img.width*img.height};
  const cx=Number.isFinite(g.cx)?g.cx:(Number.isFinite(lines.cx)?lines.cx:Math.round((bbox.minx+bbox.maxx)/2));
  const faceTop=Number.isFinite(g.faceTop)?g.faceTop:(Number.isFinite(lines.faceTop)?lines.faceTop:Math.round(img.height*.09));
  const faceBot=Number.isFinite(g.faceBot)?g.faceBot:(Number.isFinite(lines.faceBot)?lines.faceBot:Math.round(img.height*.26));
  const shoulder=Number.isFinite(g.shoulder)?g.shoulder:(Number.isFinite(lines.shoulder)?lines.shoulder:Math.round(img.height*.34));
  const waist=Number.isFinite(g.waist)?g.waist:(Number.isFinite(lines.waist)?lines.waist:Math.round(img.height*.56));
  const crotch=Number.isFinite(g.crotch)?g.crotch:(Number.isFinite(lines.crotch)?lines.crotch:Math.round(img.height*.68));
  const ankle=Number.isFinite(g.ankle)?g.ankle:(Number.isFinite(lines.ankle)?lines.ankle:Math.round(img.height*.86));
  return {img,bbox,cx,faceTop,faceBot,shoulder,waist,crotch,ankle,scaleX:32/Math.max(1,bbox.w||img.width),scaleY:32/Math.max(1,bbox.h||img.height)};
}
function pxSize(r,a){
  const b=box(r);
  return {w:b.w*a.scaleX,h:b.h*a.scaleY,area:area(r)*a.scaleX*a.scaleY};
}
const KEEP = new Set([
  'face','front_hair','side_hair_left','side_hair_right','back_hair',
  'upper_cloth','lower_cloth','collar','sleeve_left','sleeve_right',
  'left_leg','right_leg','left_foot','right_foot','hands','eyes'
]);
const MERGE = new Set([
  'hair_highlight','hair_shadow','hair_accessory','cloth_highlight','cloth_shadow','cloth_ornament',
  'belt','neck','chest_skin','body_ornament','necklace','transparent_cloth',
  'ears','shoe_ornament','torso_core','pelvis','hair','cloth','legs','shoes'
]);
const OMIT = new Set([
  'background_residue','bg_residue','soft_shell','unknown_soft','soft_edge','detail_candidate'
]);
function targetBucket0914(label){
  if(['front_hair','side_hair_left','side_hair_right','back_hair','hair_highlight','hair_shadow','hair_accessory','hair','hair_soft','hair_tip','hair_ornament'].includes(label)) return 'hair';
  if(['face','eyes','ears','neck','chest_skin'].includes(label)) return 'face_body';
  if(['upper_cloth','lower_cloth','collar','sleeve_left','sleeve_right','belt','cloth_highlight','cloth_shadow','cloth_ornament','transparent_cloth','body_ornament','necklace','torso_core','pelvis','cloth','sheer','sheer_soft','cloth_detail'].includes(label)) return 'cloth';
  if(['hands','left_leg','right_leg','left_foot','right_foot','legs','shoes','shoe_ornament'].includes(label)) return 'limbs';
  if(['shadow'].includes(label)) return 'shadow';
  return 'misc';
}
function simplifyDecision0914(r,a){
  const lbl=r.label||'unknown';
  const ps=pxSize(r,a);
  const conf=Number(r.finalConfidence??r.confidence??r.conf??0);
  let action='merge', reason='default merge small source';
  let priority=50;
  if(KEEP.has(lbl)){
    action='keep'; reason='core readable 32px part'; priority=86;
  }else if(MERGE.has(lbl)){
    action='merge'; reason='detail or support part should merge into parent'; priority=58;
  }else if(OMIT.has(lbl)){
    action='omit'; reason='debug/background/soft residue'; priority=10;
  }else if(['unknown','needs_review','skin_candidate','boundary_review'].includes(lbl)){
    action='hint'; reason='uncertain source kept as edit hint only'; priority=35;
  }
  if(ps.area<0.62 && !['eyes','belt','hair_accessory','cloth_ornament'].includes(lbl)){
    action='omit'; reason='too small at 32px';
    priority=Math.min(priority,18);
  }else if(ps.area<1.25 && action==='keep'){
    action='hint'; reason='core label but too tiny at 32px';
    priority=44;
  }
  if(conf<52 && action==='keep'){
    action='hint'; reason='low confidence core label';
    priority=42;
  }
  if(r.reviewType0910==='blocking' || r.needsReview){
    action='hint'; reason='needs review before pixel export';
    priority=Math.min(priority,38);
  }
  // Preserve the face/hair/cloth silhouette even if split regions are small.
  if(['face','front_hair','upper_cloth','lower_cloth'].includes(lbl) && ps.area>=0.5 && conf>=50){
    action='keep'; reason='must remain readable in 32px';
    priority=90;
  }
  return {action,reason,priority,px:ps,bucket:targetBucket0914(lbl)};
}
function parentFor0914(r,decision){
  const lbl=r.label||'unknown', bucket=decision.bucket;
  if(decision.action==='keep') return lbl;
  if(bucket==='hair') return ['hair_highlight','hair_shadow','hair_accessory','hair_ornament','hair_soft','hair_tip','hair'].includes(lbl) ? 'hair_silhouette' : 'hair_silhouette';
  if(bucket==='face_body') return lbl==='eyes'?'face_eye_pixels':'face_body_silhouette';
  if(bucket==='cloth') return ['belt','cloth_ornament','body_ornament','necklace'].includes(lbl)?'cloth_detail_pixels':'cloth_silhouette';
  if(bucket==='limbs') return ['shoe_ornament','shoes'].includes(lbl)?'foot_pixels':'limb_silhouette';
  if(bucket==='shadow') return 'ground_shadow';
  return 'misc_hint';
}
function palettePlan0914(parts){
  const groups={};
  for(const p of parts){
    if(p.action==='omit') continue;
    const key=p.parent;
    groups[key]=groups[key]||[];
    groups[key].push(p);
  }
  const out=[];
  for(const [key,list] of Object.entries(groups)){
    let total=0, rgb=[0,0,0];
    for(const p of list){
      const w=Math.max(1,p.source_area||1);
      total+=w; rgb[0]+=p.color_rgb[0]*w; rgb[1]+=p.color_rgb[1]*w; rgb[2]+=p.color_rgb[2]*w;
    }
    rgb=rgb.map(x=>Math.round(x/Math.max(1,total)));
    const detail=list.filter(p=>p.action==='merge'||p.action==='hint').length;
    out.push({target:key,color_rgb:rgb,color_hex:hex(rgb),source_count:list.length,detail_count:detail,importance:Math.round(list.reduce((a,p)=>a+p.priority,0)/Math.max(1,list.length))});
  }
  out.sort((a,b)=>b.importance-a.importance||b.source_count-a.source_count);
  return out.slice(0,12);
}
function silhouettePlan0914(parts){
  const keep=parts.filter(p=>p.action==='keep').sort((a,b)=>b.priority-a.priority);
  const merge=parts.filter(p=>p.action==='merge').sort((a,b)=>b.priority-a.priority);
  const hint=parts.filter(p=>p.action==='hint').sort((a,b)=>b.priority-a.priority);
  const omit=parts.filter(p=>p.action==='omit').sort((a,b)=>b.source_area-a.source_area);
  const required=['front_hair','face','upper_cloth'];
  const missing=required.filter(x=>!keep.some(p=>p.label===x));
  return {
    keep_count:keep.length, merge_count:merge.length, hint_count:hint.length, omit_count:omit.length,
    required_missing:missing,
    keep_labels:keep.map(p=>p.label),
    merge_targets:[...new Set(merge.map(p=>p.parent))],
    hint_labels:hint.slice(0,16).map(p=>p.label),
    omit_labels:omit.slice(0,16).map(p=>p.label)
  };
}
function pixelSimplify0914(res){
  if(!res||!res.candidates) return {enabled:true,status:'no_candidates'};
  ensureLabels0914();
  const a=anchors0914(res);
  const parts=[];
  for(const r of res.candidates||[]){
    const d=simplifyDecision0914(r,a);
    const parent=parentFor0914(r,d);
    r.pixelAction0914=d.action;
    r.pixelReason0914=d.reason;
    r.pixelPriority0914=d.priority;
    r.pixelBucket0914=d.bucket;
    r.pixelParent0914=parent;
    r.pixelSize0914=d.px;
    if(d.action==='omit'){
      r.pixelVisualLabel0914='pixel_omit';
    }else if(d.action==='keep'){
      r.pixelVisualLabel0914='pixel_keep';
    }else if(d.action==='merge'){
      r.pixelVisualLabel0914='pixel_merge';
    }else{
      r.pixelVisualLabel0914='pixel_hint';
    }
    parts.push({
      id:r.mid||r.id||null,
      label:r.label||'unknown',
      label_ja:labelName(r.label||'unknown'),
      action:d.action,
      reason:d.reason,
      priority:d.priority,
      bucket:d.bucket,
      parent,
      px_w:+d.px.w.toFixed(2),
      px_h:+d.px.h.toFixed(2),
      px_area:+d.px.area.toFixed(2),
      source_area:area(r),
      bbox:box(r),
      color_rgb:avgColor(r),
      color_hex:hex(avgColor(r)),
      confidence:Number(r.finalConfidence??r.confidence??r.conf??0),
      review_type:r.reviewType0910||'none'
    });
  }
  const silhouette=silhouettePlan0914(parts);
  const palette=palettePlan0914(parts);
  const report={
    enabled:true,status:silhouette.required_missing.length?'needs_core_check':'ok',version:VERSION_0914,
    target_size:{w:32,h:32},
    source_bbox:a.bbox,
    scale:{x:+a.scaleX.toFixed(4),y:+a.scaleY.toFixed(4)},
    silhouette,
    palette,
    parts:parts.sort((a,b)=>b.priority-a.priority||b.px_area-a.px_area),
    warnings:[...(silhouette.required_missing.length?['required_pixel_parts_missing:'+silhouette.required_missing.join(',')]:[])]
  };
  res.pixelSimplify0914=report;
  return report;
}
function drawPixelPlan0914(c,img,cands){
  if(typeof drawImageData==='function') drawImageData(c,img);
  const ctx=c.getContext('2d');
  ctx.save();
  ctx.lineWidth=2;
  ctx.font='10px sans-serif';
  for(const r of cands||[]){
    const action=r.pixelAction0914||'hint';
    let col='#58dc8c';
    if(action==='merge') col='#ffc450';
    else if(action==='hint') col='#58a6ff';
    else if(action==='omit') col='#8a92a0';
    ctx.strokeStyle=col; ctx.fillStyle=col;
    if(action==='omit') ctx.setLineDash([3,3]); else ctx.setLineDash([]);
    ctx.strokeRect(r.minx,r.miny,r.w,r.h);
    ctx.fillText(`${action}:${r.label}`,r.minx,Math.max(12,r.miny-2));
  }
  ctx.restore();
}
const oldAnalyze=(typeof analyze==='function')?analyze:null;
async function analyze0914(){
  if(!oldAnalyze) return;
  await oldAnalyze();
  try{
    const res=state.result;
    if(!res) return;
    pixelSimplify0914(res);
    if(!state.selectedPart || state.selectedPart==='soft_shell') state.selectedPart='full_foreground';
    renderAll();
  }catch(e){ console.warn('v0.9.14 Phase5 failed',e); }
}
window.analyze0914=analyze0914;
try{
  analyze=analyze0914;
  const run=safeQS('run'); if(run) run.onclick=analyze0914;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0914;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{
    const el=safeQS(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(safeQS('adjFace')?.value||0),shoulder:+(safeQS('adjShoulder')?.value||0),waist:+(safeQS('adjWaist')?.value||0),crotch:+(safeQS('adjCrotch')?.value||0),ankle:+(safeQS('adjAnkle')?.value||0)}; analyze0914(); };
  });
}catch(e){}
if(typeof drawCandidates==='function'){
  const oldDrawCandidates=drawCandidates;
  drawCandidates=function(c,img,cands){
    if(state.result?.pixelSimplify0914) drawPixelPlan0914(c,img,cands);
    else oldDrawCandidates(c,img,cands);
  };
}
if(typeof metadata092==='function'){
  const oldMeta=metadata092;
  metadata092=function(){
    const m=oldMeta();
    m.version=VERSION_0914;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_0914;
    m.phase='Phase5: pixel_art_simplification_plan';
    m.pixel_simplify_v0914=state.result?.pixelSimplify0914||{enabled:true,status:'not_run'};
    if(m.quality_v096){
      m.quality_v096.version=VERSION_0914;
      const px=state.result?.pixelSimplify0914;
      if(px){
        m.quality_v096.pixel_status=px.status;
        m.quality_v096.pixel_keep_count=px.silhouette?.keep_count||0;
        m.quality_v096.pixel_merge_count=px.silhouette?.merge_count||0;
        m.quality_v096.pixel_hint_count=px.silhouette?.hint_count||0;
        m.quality_v096.pixel_omit_count=px.silhouette?.omit_count||0;
        m.quality_v096.pixel_warnings=px.warnings||[];
      }
    }
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){
          p.pixel_action_v0914=live.pixelAction0914||null;
          p.pixel_reason_v0914=live.pixelReason0914||null;
          p.pixel_priority_v0914=live.pixelPriority0914??null;
          p.pixel_bucket_v0914=live.pixelBucket0914||null;
          p.pixel_parent_v0914=live.pixelParent0914||null;
          p.pixel_size_v0914=live.pixelSize0914||null;
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
    const log=safeQS('log'), px=state.result?.pixelSimplify0914||{};
    if(log){
      const sil=px.silhouette||{};
      const pal=Array.isArray(px.palette)?px.palette.slice(0,8).map(p=>`${p.target}:${p.color_hex}`).join(' / '):'-';
      log.textContent+=`\n[v0.9.14 Phase5]\nstatus=${px.status||'-'} keep=${sil.keep_count??'-'} merge=${sil.merge_count??'-'} hint=${sil.hint_count??'-'} omit=${sil.omit_count??'-'} missing=${(sil.required_missing||[]).join(',')||'-'}\npalette: ${pal}\n`;
    }
  };
}
try{
  document.title='Sprite Studio Region Viewer v0.9.14 Phase5';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.14 Phase5';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.14 Phase5: 32x32ドット絵化に向けて、残す/統合/補助/省略を自動整理します。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v0.9.14 Phase5はドット絵化前提の簡略化レイヤーです。細かい解析結果を32x32で読める形へ整理します。';
  const json=safeQS('json'); if(json) json.onclick=()=>{ if(!state.result) return; downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_14_phase5.json','application/json'); };
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{ let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean); let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines + Structure','Color Cluster','Region Before','Region After','Pixel Plan keep/merge/hint/omit','Unknown Before','Review Policy','Part']; let W=960,H=1850,c=document.createElement('canvas'); c.width=W;c.height=H; let ctx=c.getContext('2d'); ctx.fillStyle='#0f1520'; ctx.fillRect(0,0,W,H); ctx.fillStyle='#e8eef8'; ctx.font='26px sans-serif'; ctx.fillText('Sprite Studio Region Viewer v0.9.14 Phase5 Summary',20,36); let cellW=290,cellH=320; for(let i=0;i<cards.length;i++){ let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35); ctx.fillStyle='#202a3a'; ctx.fillRect(x,y,cellW,32); ctx.fillStyle='#e8eef8'; ctx.font='16px sans-serif'; ctx.fillText(titles[i],x+8,y+22); ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width)); } c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_14_phase5.png','image/png')); };
}catch(e){ console.warn('v0.9.14 Phase5 setup failed',e); }
})();
