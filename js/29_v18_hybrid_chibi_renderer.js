// ===== v1.8 patch: hybrid true-source chibi renderer =====
(function(){
'use strict';
const VERSION_V18='1.8-hybrid-true-source-chibi';
function qs8(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function fit(c,w,h){ c.width=w; c.height=h; }
function sourceImageData(res){ return res?.pre?.analysis || res?.imgData || state.orig; }
function sourceCanvas(res){ const img=sourceImageData(res); if(!img) throw new Error('source imageData not ready'); const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d').putImageData(img,0,0); return c; }
function alphaBBoxFromImageData(img,thr=12){ const w=img.width,h=img.height,d=img.data; let minx=w,miny=h,maxx=-1,maxy=-1; for(let y=0;y<h;y++)for(let x=0;x<w;x++){ const a=d[(y*w+x)*4+3]; if(a>thr){ if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; } } if(maxx<0) return {minx:0,miny:0,maxx:w-1,maxy:h-1,w,h}; return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1}; }
function candidateBoxes(res, labels){ return (res?.candidates||[]).filter(r=>labels.includes(r.label)); }
function unionBox(list){ if(!list.length) return null; let minx=1e9,miny=1e9,maxx=-1,maxy=-1; for(const r of list){ const x0=r.minx??0,y0=r.miny??0,x1=r.maxx??(x0+(r.w??0)-1),y1=r.maxy??(y0+(r.h??0)-1); minx=Math.min(minx,x0); miny=Math.min(miny,y0); maxx=Math.max(maxx,x1); maxy=Math.max(maxy,y1); } return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1}; }
function expandBox(b, imgW, imgH, rx, ry){ if(!b) return null; const padX=Math.round(b.w*rx), padY=Math.round(b.h*ry); const minx=clamp(b.minx-padX,0,imgW-1), miny=clamp(b.miny-padY,0,imgH-1), maxx=clamp(b.maxx+padX,0,imgW-1), maxy=clamp(b.maxy+padY,0,imgH-1); return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1}; }
function detectAnchors(res, bb){
  const img=sourceImageData(res), w=img.width, h=img.height;
  const faceCore=unionBox(candidateBoxes(res,['face','eyes','ears','neck']));
  const hairCore=unionBox(candidateBoxes(res,['hair','front_hair','side_hair_left','side_hair_right','back_hair','hair_soft','hair_tip']));
  const armCore=unionBox(candidateBoxes(res,['left_arm','right_arm','hands','hand_candidate','sleeve_left','sleeve_right','transparent_cloth','sheer']));
  const legCore=unionBox(candidateBoxes(res,['left_leg','right_leg','legs','leg','shoe','shoes','left_foot','right_foot']));
  const faceBox=expandBox(faceCore||{minx:bb.minx+bb.w*0.28,miny:bb.miny+bb.h*0.07,maxx:bb.minx+bb.w*0.72,maxy:bb.miny+bb.h*0.34,w:bb.w*0.44,h:bb.h*0.27}, w, h, 0.18, 0.18);
  const hairBox=expandBox(hairCore||{minx:bb.minx+bb.w*0.08,miny:bb.miny,maxx:bb.maxx-bb.w*0.08,maxy:bb.miny+bb.h*0.48,w:bb.w*0.84,h:bb.h*0.48}, w, h, 0.08, 0.04);
  const bodyTop = clamp(faceBox.maxy - Math.round(bb.h*0.02), bb.miny, bb.maxy);
  const torsoEnd = legCore ? clamp(legCore.miny - Math.round(bb.h*0.02), bodyTop+10, bb.miny+Math.round(bb.h*0.76)) : bb.miny+Math.round(bb.h*0.68);
  const bodyBox = {minx:bb.minx, miny:bodyTop, maxx:bb.maxx, maxy:torsoEnd, w:bb.w, h:torsoEnd-bodyTop+1};
  const legBox = {minx:bb.minx, miny:torsoEnd, maxx:bb.maxx, maxy:bb.maxy, w:bb.w, h:bb.maxy-torsoEnd+1};
  const shoulderWidth = armCore ? clamp(armCore.w / Math.max(1,bb.w), 0.35, 0.95) : 0.62;
  const hairVolume = hairCore ? clamp(hairCore.w / Math.max(1,bb.w), 0.28, 0.92) : 0.55;
  return {faceBox,hairBox,bodyBox,legBox,shoulderWidth,hairVolume};
}
function drawCrop(dst, src, box, dx, dy, dw, dh){ if(!box || dw<=0 || dh<=0) return; dst.drawImage(src, box.minx, box.miny, box.w, box.h, dx, dy, dw, dh); }
function clearRectAlpha(ctx,x,y,w,h){ ctx.clearRect(x,y,w,h); }
function palette(ctx,w,h,k){ const d=ctx.getImageData(0,0,w,h).data; const bins=new Map(); for(let i=0;i<d.length;i+=4){ if(d[i+3]<16)continue; const key=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4); let o=bins.get(key); if(!o)o={n:0,r:0,g:0,b:0}; o.n++; o.r+=d[i]; o.g+=d[i+1]; o.b+=d[i+2]; bins.set(key,o);} const arr=[...bins.values()].sort((a,b)=>b.n-a.n).slice(0,k); if(!arr.length) return [[0,0,0,0]]; return arr.map(o=>[Math.round(o.r/o.n),Math.round(o.g/o.n),Math.round(o.b/o.n),255]); }
function nearest(c,pal){ let best=pal[0],bd=1e18; for(const p of pal){ const dr=c[0]-p[0],dg=c[1]-p[1],db=c[2]-p[2]; const dd=dr*dr+dg*dg+db*db; if(dd<bd){bd=dd;best=p;} } return best; }
function quantize(ctx,w,h,k){ const img=ctx.getImageData(0,0,w,h), d=img.data, pal=palette(ctx,w,h,k); for(let i=0;i<d.length;i+=4){ if(d[i+3]<24){ d[i]=d[i+1]=d[i+2]=d[i+3]=0; continue; } const p=nearest([d[i],d[i+1],d[i+2]],pal); d[i]=p[0]; d[i+1]=p[1]; d[i+2]=p[2]; d[i+3]=255; } ctx.putImageData(img,0,0); return pal; }
function outline(ctx,w,h){ const src=ctx.getImageData(0,0,w,h), out=ctx.getImageData(0,0,w,h), s=src.data,d=out.data; let sr=0,sg=0,sb=0,n=0; for(let i=0;i<s.length;i+=4){ if(s[i+3]>160){sr+=s[i];sg+=s[i+1];sb+=s[i+2];n++;} } const col=n?[Math.max(16,Math.round(sr/n*.28)),Math.max(16,Math.round(sg/n*.28)),Math.max(20,Math.round(sb/n*.34)),210]:[48,40,64,210]; for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){ const idx=(y*w+x)*4; if(s[idx+3])continue; let near=0; for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){ if(!xx&&!yy)continue; if(s[((y+yy)*w+(x+xx))*4+3]>160)near++; } if(near>=2){ d[idx]=col[0]; d[idx+1]=col[1]; d[idx+2]=col[2]; d[idx+3]=col[3]; } } ctx.putImageData(out,0,0); }
function faceDetailFromSource(ctx, faceSample){
  // faceSample is 12x12 canvas sampled from source face crop. We binarize darkest pixels for eyes/lines then overlay softly.
  if(!faceSample) return;
  const sctx=faceSample.getContext('2d'); const sd=sctx.getImageData(0,0,faceSample.width,faceSample.height); const d=sd.data;
  let sum=0,c=0; for(let i=0;i<d.length;i+=4){ if(d[i+3]<16) continue; const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; sum+=lum; c++; }
  const avg=c?sum/c:140, thr=avg*0.72;
  const eyes=[];
  for(let y=0;y<faceSample.height;y++)for(let x=0;x<faceSample.width;x++){ const i=(y*faceSample.width+x)*4; if(d[i+3]<40) continue; const lum=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; if(lum<thr) eyes.push([x,y]); }
  const left=eyes.filter(p=>p[0] < faceSample.width/2), right=eyes.filter(p=>p[0] >= faceSample.width/2);
  function centroid(arr, fx, fy){ if(!arr.length) return [fx,fy]; let sx=0,sy=0; for(const p of arr){sx+=p[0]; sy+=p[1];} return [sx/arr.length, sy/arr.length]; }
  const lc=centroid(left,4,5), rc=centroid(right,8,5);
  const img=ctx.getImageData(0,0,32,32), a=img.data;
  function set(x,y,c){ const i=(y*32+x)*4; a[i]=c[0]; a[i+1]=c[1]; a[i+2]=c[2]; a[i+3]=255; }
  const lx=clamp(Math.round(13 + (lc[0]-3.5)*0.28),12,15), ly=clamp(Math.round(9 + (lc[1]-5)*0.16),8,11);
  const rx=clamp(Math.round(18 + (rc[0]-8.5)*0.28),17,20), ry=clamp(Math.round(9 + (rc[1]-5)*0.16),8,11);
  set(lx,ly,[248,248,250]); set(rx,ry,[248,248,250]);
  set(lx,ly+1,[88,78,98]); set(rx,ry+1,[88,78,98]);
  set(13,12,[230,145,165]); set(19,12,[230,145,165]);
  set(16,12,[198,118,136]);
  ctx.putImageData(img,0,0);
}
function makeFaceSample(src, faceBox){ if(!faceBox) return null; const c=document.createElement('canvas'); fit(c,12,12); const cx=c.getContext('2d'); cx.clearRect(0,0,12,12); cx.imageSmoothingEnabled=true; cx.drawImage(src, faceBox.minx, faceBox.miny, faceBox.w, faceBox.h, 0,0,12,12); return c; }
function renderHybrid(res){
  const src=sourceCanvas(res); const bb=alphaBBoxFromImageData(sourceImageData(res),12); const an=detectAnchors(res,bb);
  const hi=document.createElement('canvas'); fit(hi,128,128); const h=hi.getContext('2d'); h.clearRect(0,0,128,128); h.imageSmoothingEnabled=true;
  // 1) hair / head mass from source
  const hairW = Math.round(68 + an.hairVolume*18); const hairX = Math.round((128-hairW)/2); drawCrop(h, src, an.hairBox, hairX, 0, hairW, 50);
  // 2) torso from source, compressed a bit for chibi proportions
  const bodyW = Math.round(46 + an.shoulderWidth*24); const bodyX = Math.round((128-bodyW)/2); drawCrop(h, src, an.bodyBox, bodyX, 40, bodyW, 38);
  // 3) legs from source, narrower
  drawCrop(h, src, an.legBox, 44, 77, 40, 45);
  // 4) overlay enlarged face crop to preserve readability and source likeness
  clearRectAlpha(h, 36, 10, 56, 34);
  drawCrop(h, src, an.faceBox, 39, 10, 50, 32);
  // 5) Optional side hair overlay to preserve long-hair silhouette around face
  const leftHair = {minx:an.hairBox.minx, miny:an.hairBox.miny, maxx:Math.round((an.hairBox.minx+an.hairBox.maxx)/2), maxy:an.hairBox.maxy}; leftHair.w=leftHair.maxx-leftHair.minx+1; leftHair.h=leftHair.maxy-leftHair.miny+1;
  const rightHair = {minx:leftHair.maxx, miny:an.hairBox.miny, maxx:an.hairBox.maxx, maxy:an.hairBox.maxy}; rightHair.w=rightHair.maxx-rightHair.minx+1; rightHair.h=rightHair.maxy-rightHair.miny+1;
  drawCrop(h, src, leftHair, 14, 18, 24, 66); drawCrop(h, src, rightHair, 90, 18, 24, 66);
  // downscale to 32
  const out=document.createElement('canvas'); fit(out,32,32); const ctx=out.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.imageSmoothingEnabled=true; ctx.drawImage(hi,0,0,32,32);
  const k=clamp(parseInt(qs8('k')?.value||'8',10)+2,5,14); const pal=quantize(ctx,32,32,k); outline(ctx,32,32); faceDetailFromSource(ctx, makeFaceSample(src, an.faceBox));
  return {canvas:out,bbox:bb,anchors:an,mode:'hybrid_chibi',paletteSize:pal.length};
}
function renderFaithful(res){ const src=sourceCanvas(res), bb=alphaBBoxFromImageData(sourceImageData(res),12); const out=document.createElement('canvas'); fit(out,32,32); const ctx=out.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.imageSmoothingEnabled=true; const targetH=30, scale=targetH/Math.max(1,bb.h), dw=Math.max(1,Math.round(bb.w*scale)), dx=Math.round((32-dw)/2), dy=1; ctx.drawImage(src,bb.minx,bb.miny,bb.w,bb.h,dx,dy,dw,targetH); const k=clamp(parseInt(qs8('k')?.value||'8',10)+2,5,14); const pal=quantize(ctx,32,32,k); outline(ctx,32,32); return {canvas:out,bbox:bb,mode:'faithful',paletteSize:pal.length,scale,offset:{x:dx,y:dy}}; }
function renderTrueSource(res){ const mode=(qs8('pixelMode')?.value || 'hybrid_chibi'); return mode==='faithful' ? renderFaithful(res) : renderHybrid(res); }
function applyResult(res, pack){ const id=pack.canvas.getContext('2d').getImageData(0,0,32,32); res.sprite32V18={imageData:id,status:'ok',renderer:'hybrid_true_source_chibi_v1_8',mode:pack.mode,bbox:pack.bbox,anchors:pack.anchors||null,paletteSize:pack.paletteSize,scale:pack.scale||null,offset:pack.offset||null,note:'hybrid mode keeps true source pixels but enlarges face and applies chibi proportions'}; res.sprite32V17=res.sprite32V18; res.sprite32V16=res.sprite32V18; res.sprite32V15=res.sprite32V18; res.sprite32V14=res.sprite32V18; res.sprite32V13=res.sprite32V18; res.sprite32V12=res.sprite32V18; res.sprite32V11=res.sprite32V18; res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.imageData=id; res.sprite32V10.status='ok-hybrid-source-v1.8'; return id; }
function canvasV18(){ const pack=renderTrueSource(state.result); applyResult(state.result,pack); return pack.canvas; }
function saveLink(dataUrl,name,label){ try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){} const log=qs8('pixelLog')||qs8('log'); if(log){ let box=document.getElementById('saveLinksV18'); if(!box){ box=document.createElement('div'); box.id='saveLinksV18'; box.style.marginTop='10px'; log.parentNode.appendChild(box); } const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff'; box.prepend(a); } }
function saveSprite32V18(){ if(!state.result){alert('先に解析してください。');return;} const c=canvasV18(); saveLink(c.toDataURL('image/png'),`sprite_front_32_v1_8_${qs8('pixelMode')?.value||'hybrid_chibi'}.png`,`画像を開く/保存 sprite_front_32_v1_8_${qs8('pixelMode')?.value||'hybrid_chibi'}.png`); }
function projectV18(){ const res=state.result; if(!res)return {version:VERSION_V18,status:'no_result'}; if(!res.sprite32V18){ const p=renderTrueSource(res); applyResult(res,p); } return {version:VERSION_V18,type:'game_sprite_32_hybrid_true_source',output:{sprite:`sprite_front_32_v1_8_${res.sprite32V18.mode}.png`,size:{w:32,h:32}},renderer:'hybrid_true_source_chibi_v1_8',mode:res.sprite32V18.mode,bbox:res.sprite32V18.bbox,anchors:res.sprite32V18.anchors,paletteSize:res.sprite32V18.paletteSize,goal:'preserve true source while restoring cute deformation and visible face'}; }
function saveProjectV18(){ if(!state.result){alert('先に解析してください。');return;} saveLink('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(projectV18(),null,2)),`sprite_pixel_project_v1_8_${qs8('pixelMode')?.value||'hybrid_chibi'}.json`,`JSONを開く/保存 sprite_pixel_project_v1_8_${qs8('pixelMode')?.value||'hybrid_chibi'}.json`); }
function drawV18(){ if(!state.result)return; const pack=renderTrueSource(state.result); const id=applyResult(state.result,pack); const c32=qs8('cSprite32'), prev=qs8('cSpritePreview'), st=qs8('spriteStatus'), log=qs8('pixelLog'); if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); } if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ ctx.beginPath(); ctx.moveTo(i*10,0); ctx.lineTo(i*10,320); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*10); ctx.lineTo(320,i*10); ctx.stroke(); } const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); } if(st) st.textContent=`v1.8 ${pack.mode}`; if(log){ log.textContent=`Sprite v1.8\nstatus=ok\nrenderer=hybrid_true_source_chibi_v1_8\nmode=${pack.mode}\n\n元画像利用:\n- source = state.result.pre.analysis 透明ImageData\n- 髪/胴/脚は元画像クロップを使用\n- 顔は元画像のfaceBoxを拡大再配置\n- 長髪は左右サイド髪クロップも再配置\n- bbox = ${pack.bbox.w}x${pack.bbox.h}\n- paletteSize = ${pack.paletteSize}\n\n狙い:\n- faithfulより可愛い頭身\n- source_chibiより顔が読める\n- 元画像の服・髪の個性を残す`; } }
function addModeUi(){ const bar=document.querySelector('.bar'); if(!bar) return; let sel=qs8('pixelMode'); if(!sel){ sel=document.createElement('select'); sel.id='pixelMode'; const run=qs8('run'); if(run) bar.insertBefore(sel,run); else bar.appendChild(sel); } sel.innerHTML='<option value="hybrid_chibi">ドット化:元画像ハイブリッドちび</option><option value="faithful">ドット化:元画像忠実</option>'; sel.value='hybrid_chibi'; sel.onchange=()=>{ if(state.result) drawV18(); }; }
function installV18(){ addModeUi(); const b1=qs8('saveSprite32'); if(b1) b1.onclick=saveSprite32V18; const b2=qs8('savePixelProject'); if(b2) b2.onclick=saveProjectV18; const oldAnalyze=(typeof analyze==='function') ? analyze : null; async function analyzeV18(){ if(oldAnalyze) await oldAnalyze(); try{ if(state.result) drawV18(); }catch(e){ console.warn('v1.8 draw failed',e); } } analyze=analyzeV18; window.analyzeV18=analyzeV18; window.renderTrueSourceV18=renderTrueSource; const run=qs8('run'); if(run) run.onclick=analyzeV18; ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=qs8(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(qs8('adjFace')?.value||0),shoulder:+(qs8('adjShoulder')?.value||0),waist:+(qs8('adjWaist')?.value||0),crotch:+(qs8('adjCrotch')?.value||0),ankle:+(qs8('adjAnkle')?.value||0)}; analyzeV18(); }; }); document.title='Sprite Studio Pixel Pipeline v1.8'; const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Pixel Pipeline v1.8'; const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v1.8: hybrid true-source chibi。元画像を使いながら顔を拡大して可愛さを戻します。'; const footer=document.querySelector('.footer'); if(footer) footer.textContent='v1.8は hybrid true-source chibi renderer です。true-sourceを維持しつつ、顔の可読性とゲーム用デフォルメを戻します。'; }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installV18); else installV18();
if(typeof metadata092==='function'){ const oldMeta=metadata092; metadata092=function(){ const m=oldMeta(); m.version=VERSION_V18; m.pixel_sprite_v18={status:state.result?.sprite32V18?.status||'not_run',renderer:'hybrid_true_source_chibi_v1_8',mode:state.result?.sprite32V18?.mode||null,bbox:state.result?.sprite32V18?.bbox||null}; return m; }; }
})();
