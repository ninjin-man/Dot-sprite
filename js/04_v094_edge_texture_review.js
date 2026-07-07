// ===== v0.9.4 patch: review cleanup + edge/texture features =====
(function(){
'use strict';
const VERSION_094 = '0.9.4';
const PREPROCESSOR_VERSION_094 = 'v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture';
function safeQS(id){ return typeof qs === 'function' ? qs(id) : document.getElementById(id); }
function n01(v){ return Math.max(0, Math.min(1, v)); }
function personArea(lines){ return (lines&&lines.bbox&&lines.bbox.area) || Math.max(1,(state.w||1)*(state.h||1)); }
function personH(lines){ return (lines&&(lines.H||(lines.bbox&&lines.bbox.h))) || (state.h||1); }
function samplePixels(pixels,maxN){ if(!pixels||!pixels.length)return []; if(pixels.length<=maxN)return pixels; const out=[],step=Math.ceil(pixels.length/maxN); for(let i=0;i<pixels.length;i+=step)out.push(pixels[i]); return out; }
function ensureLabels094(){
  try{
    Object.assign(LABELS,{
      soft_shell:'広域soft', cloth_detail:'衣装細部', hair_detail:'髪細部', face_detail:'顔細部', edge_debug:'エッジ解析'
    });
    Object.assign(COLORS,{
      soft_shell:[105,110,125], cloth_detail:[40,190,120], hair_detail:[205,140,255], face_detail:[255,120,150], edge_debug:[255,255,255]
    });
  }catch(e){}
}
ensureLabels094();

function countTouches(t){ let n=0; if(!t)return 0; ['head','shoulder','torso','waist','ankle','border'].forEach(k=>{if(t[k])n++;}); return n; }
function areaRatio(r,lines){ return (r.area||0)/Math.max(1,personArea(lines)); }
function heightRatio(r,lines){ return (r.h||0)/Math.max(1,personH(lines)); }
function finalAreaRatio(r){ const fa=state.result?.pre?.layers?.finalArea || state.result?.pre?.bbox?.area || personArea(state.result?.lines); return (r.area||0)/Math.max(1,fa); }
function isSoftShell(r,lines){
  const t=r.touches||{}, ar=finalAreaRatio(r), hr=heightRatio(r,lines), tc=countTouches(t);
  return (r.label==='ambiguous_overlap'||r.label==='unknown_soft'||r.previous_label==='hair_soft') && (ar>.26 || hr>.68 || (tc>=5 && ar>.18));
}
function normalizeCandidateLabel094(r,lines){
  if(!r) return r;
  const old=r.label;
  const a=r.analysis093||{};
  if(isSoftShell(r,lines)){
    r.previous_label=r.previous_label||old;
    r.label='soft_shell';
    r.reason=(r.reason||'')+' / v0.9.4 large soft shell isolated';
    r.reject_reason=r.reject_reason||[];
    if(!r.reject_reason.includes('v0.9.4_soft_shell_hidden_from_review')) r.reject_reason.push('v0.9.4_soft_shell_hidden_from_review');
    r.needsReview=false;
    r.conf=r.confidence=r.finalConfidence=40;
    return r;
  }
  // v0.9.3 was too eager to convert small plausible hair_soft regions into ambiguous_overlap.
  if(r.label==='ambiguous_overlap' && r.previous_label==='hair_soft'){
    if((a.hair_soft_score||0)>=75 && (a.hair_soft_score||0) >= (a.sheer_score||0)-4){
      r.label='hair_soft';
      r.reason=(r.reason||'')+' / v0.9.4 restored hair_soft by score';
    }else if((a.sheer_score||0)>=72 && (a.sheer_score||0)>(a.hair_soft_score||0)+8){
      r.label='sheer_soft';
      r.reason=(r.reason||'')+' / v0.9.4 relabel sheer_soft by score';
    }else{
      r.label='unknown_soft';
      r.reason=(r.reason||'')+' / v0.9.4 ambiguous -> unknown_soft';
    }
    try{ r.scores=scoreFor(r.label,r,lines); }catch(e){}
    const conf=(r.scores&&r.scores.confidence)||r.confidence||r.conf||60;
    r.conf=r.confidence=r.finalConfidence=Math.min(conf, r.label==='hair_soft'?78:72);
    r.needsReview=true;
  }
  // Small colored fragments in the torso that are embedded in cloth should be cloth_detail, not generic overlap.
  const z=r.visualZone||r.zone||'', ar=areaRatio(r,lines), t=r.touches||{};
  if((r.label==='ambiguous_overlap'||r.label==='unknown_soft') && ar<.012 && (z==='torso'||z==='face') && (t.torso||t.shoulder)){
    const hue=r.hue||0, sat=r.sat||0, val=r.val||0;
    if((hue>105&&hue<190&&sat>.18&&val>.20) || (val<.38&&sat>.18)){
      r.previous_label=r.previous_label||old;
      r.label='cloth_detail';
      r.reason=(r.reason||'')+' / v0.9.4 small embedded cloth detail';
      try{ r.scores=scoreFor('cloth',r,lines); }catch(e){}
      r.conf=r.confidence=r.finalConfidence=Math.min((r.scores&&r.scores.confidence)||68,72);
      r.needsReview=true;
    }
  }
  return r;
}
function setSmartReviewFlags094(result){
  if(!result||!result.candidates) return;
  const stable=new Set(['face','cloth','leg','shoe','sheer','hair','body_ornament','necklace','shoe_ornament','hair_ornament','cloth_detail']);
  const always=new Set(['unknown','needs_review','unknown_soft','soft_edge','bg_residue','background_residue','ambiguous_overlap','hair_soft','sheer_soft','skin_candidate','face_detail','hair_detail']);
  for(const r of result.candidates){
    normalizeCandidateLabel094(r,result.lines);
    if(r.label==='soft_shell') { r.needsReview=false; continue; }
    const conf=r.finalConfidence??r.confidence??r.conf??0;
    const hasReject=(r.reject_reason||[]).length>0;
    if(always.has(r.label)) r.needsReview=true;
    else if(stable.has(r.label) && conf>=74 && !hasReject) r.needsReview=false;
    else r.needsReview=conf<76 || hasReject;
  }
  result.reviewTargets094=result.candidates.filter(r=>r.needsReview && r.label!=='soft_shell' && r.label!=='bg_residue' && r.label!=='background_residue');
}

// Edge/texture extraction. Lightweight Sobel, no external library.
function buildEdgeMap094(imgData){
  const w=imgData.width,h=imgData.height,d=imgData.data, edge=new Float32Array(w*h), lum=new Float32Array(w*h);
  for(let p=0,i=0;p<w*h;p++,i+=4){ lum[p]=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255; }
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=y*w+x;
    const gx=-lum[p-w-1]-2*lum[p-1]-lum[p+w-1]+lum[p-w+1]+2*lum[p+1]+lum[p+w+1];
    const gy=-lum[p-w-1]-2*lum[p-w]-lum[p-w+1]+lum[p+w-1]+2*lum[p+w]+lum[p+w+1];
    edge[p]=Math.min(1,Math.hypot(gx,gy));
  }
  return {edge,lum,w,h};
}
function edgeTextureForRegion094(r, ctx){
  const pix=samplePixels(r.pixels||[],1400); if(!pix.length||!ctx) return null;
  let sumE=0,strong=0,sumL=0,sumL2=0,n=0;
  for(const p of pix){ const e=ctx.edge[p]||0,l=ctx.lum[p]||0; sumE+=e; if(e>.18)strong++; sumL+=l; sumL2+=l*l; n++; }
  const meanE=sumE/n, density=strong/n, meanL=sumL/n, variance=Math.max(0,sumL2/n-meanL*meanL);
  const ar=areaRatio(r,state.result?.lines), z=r.visualZone||r.zone||'';
  let ornament=0;
  ornament += density>.26?35:(density>.18?24:10);
  ornament += variance>.025?28:(variance>.014?18:5);
  ornament += ar<.012?24:(ar<.035?12:0);
  ornament += (z==='torso'||z==='head'||z==='face'||z==='feet')?10:0;
  if((r.sat||0)>.25) ornament+=10;
  ornament=Math.round(Math.max(0,Math.min(100,ornament)));
  let hairTexture=0;
  hairTexture += density>.16?26:10;
  hairTexture += (r.h/(r.w||1))>1.15?18:0;
  hairTexture += ((r.hue||0)>235 || (r.sat||0)<.25)?18:0;
  hairTexture += (z==='head'||z==='face')?20:0;
  hairTexture=Math.round(Math.max(0,Math.min(100,hairTexture)));
  return {edge_mean:+meanE.toFixed(4), edge_density:+density.toFixed(4), luminance_variance:+variance.toFixed(5), ornament_detail_score:ornament, hair_texture_score:hairTexture};
}
function applyEdgeTexture094(result){
  if(!result||!result.imgData||!result.candidates) return result;
  const ctx=buildEdgeMap094(result.imgData); result.edgeContext094=ctx;
  for(const r of result.candidates){
    const et=edgeTextureForRegion094(r,ctx); r.edgeTexture094=et;
    if(r.features && et){ r.features.edge_mean=et.edge_mean; r.features.edge_density=et.edge_density; r.features.luminance_variance=et.luminance_variance; }
    // Only promote obvious tiny ornate fragments; do not disturb main parts.
    if(et && et.ornament_detail_score>=78 && areaRatio(r,result.lines)<.012 && ['unknown_soft','ambiguous_overlap','cloth_detail','hair_soft','sheer_soft'].includes(r.label)){
      const old=r.label;
      if((r.visualZone||'')==='head') r.label='hair_ornament';
      else if((r.visualZone||'')==='feet') r.label='shoe_ornament';
      else r.label='body_ornament';
      r.previous_label=r.previous_label||old;
      r.reason=(r.reason||'')+' / v0.9.4 edge ornament score='+et.ornament_detail_score;
      try{ r.scores=scoreFor(r.label,r,result.lines); }catch(e){}
      r.conf=r.confidence=r.finalConfidence=Math.min((r.scores&&r.scores.confidence)||72,76);
      r.needsReview=true;
    }
  }
  result.edgeStats094={
    edge_texture:true,
    high_ornament:(result.candidates||[]).filter(r=>(r.edgeTexture094?.ornament_detail_score||0)>=78).length,
    high_hair_texture:(result.candidates||[]).filter(r=>(r.edgeTexture094?.hair_texture_score||0)>=72).length,
    review_targets:(result.reviewTargets094||[]).length
  };
  return result;
}

const prevAnalyze = (typeof analyze === 'function') ? analyze : null;
async function analyze094(){
  if(!prevAnalyze) return;
  await prevAnalyze();
  if(state.result && state.result.candidates){
    setSmartReviewFlags094(state.result);
    applyEdgeTexture094(state.result);
    setSmartReviewFlags094(state.result);
    try{ buildAdjacency(state.result.candidates); }catch(e){}
    try{ renderAll(); }catch(e){}
  }
}
window.analyze094=analyze094;
try{
  document.title='Sprite Studio Region Viewer v0.9.4';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.4';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.4: レビュー対象整理、広域soft隔離、Sobelエッジ/テクスチャ特徴量を追加。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、AIなしで補正しやすい候補Regionを作る。v0.9.4はレビュー整理とエッジ/テクスチャ解析追加版です。';
  analyze=analyze094;
  const run=safeQS('run'); if(run) run.onclick=analyze094;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze094;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze094();};});
}catch(e){}

// Patch review queue: do not ask user to correct global soft shell/background residue.
if(typeof makeReviewQueue === 'function'){
  const prevQueue=makeReviewQueue;
  makeReviewQueue=function(){
    if(state.result) setSmartReviewFlags094(state.result);
    const q=(state.result?.candidates||[]).filter(r=>r.needsReview && !['soft_shell','bg_residue','background_residue'].includes(r.label));
    const pr=(x)=>{ const order=['face','eyes','hair','hair_soft','sheer','sheer_soft','hands','ears','body_ornament','cloth_detail','unknown_soft','ambiguous_overlap']; const i=order.indexOf(x.label); return i<0?99:i; };
    return q.sort((a,b)=>pr(a)-pr(b)||b.area-a.area).slice(0,8);
  };
}

// Patch drawing: hide global soft shell from noisy candidate/review overlays, but keep it in metadata/log.
if(typeof drawCandidates === 'function'){
  const prevDrawCandidates=drawCandidates;
  drawCandidates=function(c,img,cands){ prevDrawCandidates(c,img,(cands||[]).filter(r=>r.label!=='soft_shell')); };
}
if(typeof drawReview === 'function'){
  const prevDrawReview=drawReview;
  drawReview=function(c,img,cands,after=true){ prevDrawReview(c,img,(cands||[]).filter(r=>!['soft_shell','bg_residue','background_residue'].includes(r.label)),after); };
}

// Metadata patch.
if(typeof metadata092 === 'function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_094;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_094;
    m.review_v094={
      smart_review:true,
      soft_shell_hidden_from_review:true,
      review_target_count:state.result?.reviewTargets094?.length||0,
      review_labels:(state.result?.reviewTargets094||[]).map(r=>({id:r.mid||r.id,label:r.label,confidence:r.confidence||r.conf||0}))
    };
    m.analysis_v094={
      edge_texture:true,
      sobel_edge:true,
      luminance_variance:true,
      stats:state.result?.edgeStats094||null
    };
    // Count uncertainty honestly.
    m.region=m.region||{};
    const hold=new Set(['unknown','needs_review','unknown_soft','soft_edge','ambiguous_overlap','hair_soft','sheer_soft']);
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
        p.analysis_v094=live.edgeTexture094||null;
        if(p.features && live.edgeTexture094){
          p.features.edge_mean=live.edgeTexture094.edge_mean;
          p.features.edge_density=live.edgeTexture094.edge_density;
          p.features.luminance_variance=live.edgeTexture094.luminance_variance;
        }
      }
    }
    return m;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_4.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.4 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_4.png','image/png'));};
}catch(e){}

if(typeof logResult === 'function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log||!state.result)return;
    const rs=state.result.reviewTargets094||[], es=state.result.edgeStats094||{};
    const top=(state.result.candidates||[]).filter(r=>r.label!=='soft_shell').slice(0,18).map(r=>`M${r.mid} ${LABELS[r.label]||r.label} review=${r.needsReview?'Y':'N'} edge=${r.edgeTexture094?.edge_density??'-'} var=${r.edgeTexture094?.luminance_variance??'-'} orn=${r.edgeTexture094?.ornament_detail_score??'-'}`).join('\n');
    log.textContent += `\n[v0.9.4 review/edge]\nsmart_review=ON / review_targets=${rs.length} / soft_shell=${(state.result.candidates||[]).filter(r=>r.label==='soft_shell').length} / high_ornament=${es.high_ornament||0}\n${top}\n`;
  };
}
})();
