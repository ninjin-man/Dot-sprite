// ===== v0.9.2.4 guard patch: safe split + hair_soft guard + soft hold labels =====
(function(){
'use strict';
const VERSION_0924 = '0.9.2.4';
const PREPROCESSOR_VERSION_0924 = 'v0.4-restored-stable+inner-recovery+hair-soft-guard';

function safeQS(id){ return typeof qs === 'function' ? qs(id) : document.getElementById(id); }
function setText(id, text){ const el=safeQS(id); if(el) el.textContent=text; }

// UI version labels
try{
  document.title = 'Sprite Studio Region Viewer v0.9.2.4';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.2.4';
  const sub=document.querySelector('.sub');
  if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.2.4: 分割版。hair_soft巨大化防止、unknown_soft / soft_edge / bg_residue、reject_reason出力を追加。';
  const footer=document.querySelector('.footer');
  if(footer) footer.textContent='MVP目的：完全自動ではなく、AIなしで補正しやすい候補Regionを作る。v0.9.2.4は分割・hair_soft_guard・保留ラベル追加版です。';
}catch(e){}

// Labels/colors for hold states.
try{
  Object.assign(LABELS, {
    unknown_soft:'保留:薄色',
    soft_edge:'外周soft',
    bg_residue:'背景残り',
    ambiguous_overlap:'重なり候補'
  });
  Object.assign(COLORS, {
    unknown_soft:[170,180,205],
    soft_edge:[90,140,255],
    bg_residue:[86,88,100],
    ambiguous_overlap:[255,150,80]
  });
}catch(e){}

function countTrueTouch(t){
  if(!t) return 0;
  let n=0; ['head','shoulder','torso','waist','ankle','border'].forEach(k=>{ if(t[k]) n++; });
  return n;
}
function areaRatioToPerson(r, lines){
  const area = lines && lines.bbox && lines.bbox.area ? lines.bbox.area : (state.w*state.h || 1);
  return (r.area||0) / Math.max(1, area);
}
function hRatioToPerson(r, lines){
  const h = lines && lines.H ? lines.H : ((lines&&lines.bbox&&lines.bbox.h) || state.h || 1);
  return (r.h||0) / Math.max(1, h);
}
function bgLikeScore(r){
  try{
    const bg = state.result && state.result.pre && state.result.pre.bg;
    if(!bg || !r.mean) return 0;
    const d = labDist(rgb2lab(...r.mean), rgb2lab(...bg));
    return 1 - clamp(d/42,0,1);
  }catch(e){return 0;}
}
function shouldBeSheerSoft(r){
  const z=r.visualZone||r.zone||'';
  const touch=r.touches||{};
  const hue=r.hue||0, sat=r.sat||0, val=r.val||0;
  const relX = typeof r.relX === 'number' ? r.relX : 0;
  const paleMint = ((hue>80&&hue<180&&val>.40&&sat<.48)||(sat<.22&&val>.48));
  return paleMint && relX>.12 && (z==='torso'||z==='legs'||touch.shoulder||touch.torso||touch.waist);
}
function applyHairSoftGuardToRegion(r, lines){
  if(!r) return r;
  const oldLabel = r.label;
  const guarded = oldLabel === 'hair_soft';
  const reject=[];
  const ar=areaRatioToPerson(r, lines);
  const hr=hRatioToPerson(r, lines);
  const touch=r.touches||{};
  const z=r.visualZone||r.zone||'';
  const oz=r.originZone||r.origin_zone||'';
  const bgLike=bgLikeScore(r);
  const touchCount=countTrueTouch(touch);

  if(guarded){
    if(touch.ankle) reject.push('hair_soft_forbidden_touch_ankle');
    if(touch.waist && hr>.35) reject.push('hair_soft_forbidden_large_waist_touch');
    if(z==='legs'||z==='feet') reject.push('hair_soft_forbidden_visual_'+z);
    if(hr>.70) reject.push('hair_soft_forbidden_bbox_height_gt_70pct');
    if(ar>.080) reject.push('hair_soft_forbidden_area_ratio_gt_8pct');
    if(oz && !['head','face'].includes(oz) && (z==='torso'||z==='legs'||z==='feet')) reject.push('hair_soft_forbidden_origin_'+oz);
    if(touchCount>=5) reject.push('hair_soft_forbidden_touches_many_zones');
  }

  if(reject.length){
    r.previous_label = oldLabel;
    r.reject_reason = reject;
    if(bgLike>.62 && (touch.border || z==='feet' || z==='legs')){
      r.label='bg_residue';
      r.reason=(r.reason||'')+' / hair_soft_guard -> bg_residue';
    }else if(shouldBeSheerSoft(r)){
      r.label='sheer_soft';
      r.reason=(r.reason||'')+' / hair_soft_guard -> sheer_soft';
    }else if(touchCount>=5 || hr>.70 || ar>.08){
      r.label='unknown_soft';
      r.reason=(r.reason||'')+' / hair_soft_guard -> unknown_soft';
    }else{
      r.label='soft_edge';
      r.reason=(r.reason||'')+' / hair_soft_guard -> soft_edge';
    }
    try{ r.scores = scoreFor(r.label, r, lines); }catch(e){ r.scores = r.scores || {}; }
    const baseConf = r.scores && r.scores.confidence ? r.scores.confidence : Math.min(r.conf||r.confidence||60, 62);
    r.conf = r.confidence = r.finalConfidence = Math.min(baseConf, r.label==='sheer_soft'?74:62);
    r.needsReview = true;
  }
  return r;
}
function applySoftHoldLabels(r, lines){
  if(!r) return r;
  if(r.label==='background_residue') r.label='bg_residue';
  // Avoid pretending all uncertainty is solved. Keep weak soft guesses reviewable.
  if(r.label==='needs_review' || r.label==='unknown'){
    const ar=areaRatioToPerson(r,lines), hr=hRatioToPerson(r,lines), bgLike=bgLikeScore(r), touch=r.touches||{};
    if(bgLike>.66 || touch.border){
      r.previous_label=r.label; r.label='bg_residue'; r.reason=(r.reason||'')+' / hold -> bg_residue';
    }else if((r.meanAlpha||255)<180 || ar>.03 || hr>.25){
      r.previous_label=r.label; r.label='unknown_soft'; r.reason=(r.reason||'')+' / hold -> unknown_soft';
    }
    if(['unknown_soft','bg_residue'].includes(r.label)){
      try{ r.scores=scoreFor(r.label,r,lines); }catch(e){}
      r.conf=r.confidence=r.finalConfidence=Math.min(r.conf||r.confidence||65,64);
      r.needsReview=true;
    }
  }
  return r;
}
function applyGuards(candidates, lines){
  const warnings=[];
  for(const r of (candidates||[])){
    applyHairSoftGuardToRegion(r, lines);
    applySoftHoldLabels(r, lines);
    const ar=areaRatioToPerson(r, lines), hr=hRatioToPerson(r, lines);
    if((r.label||'').includes('hair') && (ar>.08 || hr>.70)){
      warnings.push({id:r.mid||r.id,label:r.label,area_ratio:+ar.toFixed(4),height_ratio:+hr.toFixed(4),bbox:[r.minx,r.miny,r.w,r.h]});
    }
  }
  if(state.result) state.result.hugeLabelWarnings = warnings;
  return candidates;
}

// Patch growSoftLabels so seed grow cannot create an impossible hair_soft.
if(typeof growSoftLabels === 'function'){
  const __growSoftLabels0923 = growSoftLabels;
  growSoftLabels = function(cands, lines){
    const out = __growSoftLabels0923(cands, lines);
    return applyGuards(out, lines);
  };
}

// Patch analyze after legacy flow completes.
const __analyze0923 = (typeof analyze092 === 'function') ? analyze092 : (typeof analyze === 'function' ? analyze : null);
async function analyze0924(){
  if(!__analyze0923) return;
  await __analyze0923();
  if(state.result && state.result.candidates){
    applyGuards(state.result.candidates, state.result.lines);
    try{ buildAdjacency(state.result.candidates); }catch(e){}
    try{ renderAll(); }catch(e){}
  }
}
window.analyze0924 = analyze0924;
try{
  analyze = analyze0924;
  const run=safeQS('run'); if(run) run.onclick=analyze0924;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze0924;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze0924();};});
}catch(e){}

// Patch metadata and export names.
if(typeof metadata092 === 'function'){
  const __metadata0923 = metadata092;
  metadata092 = function(){
    const m = __metadata0923();
    m.version = VERSION_0924;
    m.preprocessor = m.preprocessor || {};
    m.preprocessor.version = PREPROCESSOR_VERSION_0924;
    m.guard = {
      hair_soft_guard:true,
      unknown_soft:true,
      soft_edge:true,
      bg_residue:true,
      huge_label_warning: state.result?.hugeLabelWarnings || []
    };
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live = (state.result?.candidates||[]).find(r => (r.mid||r.id) === p.id);
        if(live){
          p.label = live.label;
          p.label_ja = LABELS[live.label] || live.label;
          p.previous_label = live.previous_label || null;
          p.reject_reason = live.reject_reason || [];
          p.reason = live.reason || p.reason;
          p.needs_review = !!live.needsReview;
          p.confidence = live.confidence || live.conf || p.confidence;
          p.final_confidence = live.finalConfidence ?? p.final_confidence;
        }
      }
    }
    return m;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_2_4.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.2.4 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_2_4.png','image/png'));};
}catch(e){}

// Add log suffix.
if(typeof logResult === 'function'){
  const __logResult0923 = logResult;
  logResult = function(){
    __logResult0923();
    if(!state.result) return;
    const warn = state.result.hugeLabelWarnings || [];
    const extra = `\n[v0.9.2.4 guard]\nhair_soft_guard=ON / unknown_soft=ON / bg_residue=ON / warnings=${warn.length}\n` + (warn.length ? warn.map(w=>`- M${w.id} ${w.label} area=${w.area_ratio} h=${w.height_ratio}`).join('\n')+'\n' : '');
    const log=safeQS('log'); if(log) log.textContent += extra;
  };
}

})();
