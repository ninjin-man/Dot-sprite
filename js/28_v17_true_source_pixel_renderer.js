// ===== v1.7 patch: true-source pixel renderer =====
(function(){
'use strict';
const VERSION_V17='1.7-true-source-pixel';
function qs7(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function fit(c,w,h){ c.width=w; c.height=h; }
function sourceCanvas(res){
  const img=res?.pre?.analysis || res?.imgData || state.orig;
  if(!img) throw new Error('source imageData not ready');
  const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d').putImageData(img,0,0); return c;
}
function alphaBBoxFromImageData(img,thr=12){
  const w=img.width,h=img.height,d=img.data; let minx=w,miny=h,maxx=-1,maxy=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){ const a=d[(y*w+x)*4+3]; if(a>thr){ if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; } }
  if(maxx<0) return {minx:0,miny:0,maxx:w-1,maxy:h-1,w,h};
  return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1};
}
function getSourceBBox(res){ return alphaBBoxFromImageData(res?.pre?.analysis || res?.imgData || state.orig, 12); }
function candidateBoxes(res, labels){ return (res?.candidates||[]).filter(r=>labels.includes(r.label)); }
function unionBox(list){ if(!list.length) return null; let minx=1e9,miny=1e9,maxx=-1,maxy=-1; for(const r of list){ const x0=r.minx??0,y0=r.miny??0,x1=r.maxx??(x0+(r.w??0)-1),y1=r.maxy??(y0+(r.h??0)-1); minx=Math.min(minx,x0); miny=Math.min(miny,y0); maxx=Math.max(maxx,x1); maxy=Math.max(maxy,y1); } return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1}; }
function getAnchors(res,bb){
  const faceBox=unionBox(candidateBoxes(res,['face','eyes','ears','neck']));
  const legBox=unionBox(candidateBoxes(res,['left_leg','right_leg','legs','leg','shoe','shoes','left_foot','right_foot']));
  const H=bb.h;
  const headEnd=clamp(faceBox ? Math.round(faceBox.maxy + faceBox.h*.42) : Math.round(bb.miny+H*.33), bb.miny+Math.round(H*.22), bb.miny+Math.round(H*.42));
  const torsoEnd=clamp(legBox ? Math.round(legBox.miny - H*.03) : Math.round(bb.miny+H*.68), headEnd+Math.round(H*.12), bb.miny+Math.round(H*.78));
  return {faceBox,legBox,headEnd,torsoEnd};
}
function drawStrip(dst,src,sx,sy,sw,sh,dx,dy,dw,dh){ if(sw<=0||sh<=0||dw<=0||dh<=0)return; dst.drawImage(src,sx,sy,sw,sh,dx,dy,dw,dh); }
function palette(ctx,w,h,k){
  const d=ctx.getImageData(0,0,w,h).data; const bins=new Map();
  for(let i=0;i<d.length;i+=4){ if(d[i+3]<16)continue; const key=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4); let o=bins.get(key); if(!o)o={n:0,r:0,g:0,b:0}; o.n++; o.r+=d[i]; o.g+=d[i+1]; o.b+=d[i+2]; bins.set(key,o); }
  const arr=[...bins.values()].sort((a,b)=>b.n-a.n).slice(0,k);
  if(!arr.length) return [[0,0,0,0]];
  return arr.map(o=>[Math.round(o.r/o.n),Math.round(o.g/o.n),Math.round(o.b/o.n),255]);
}
function nearest(c,pal){ let best=pal[0],bd=1e18; for(const p of pal){ const dr=c[0]-p[0],dg=c[1]-p[1],db=c[2]-p[2]; const dd=dr*dr+dg*dg+db*db; if(dd<bd){bd=dd;best=p;} } return best; }
function quantize(ctx,w,h,k){ const img=ctx.getImageData(0,0,w,h), d=img.data, pal=palette(ctx,w,h,k); for(let i=0;i<d.length;i+=4){ if(d[i+3]<24){ d[i]=d[i+1]=d[i+2]=d[i+3]=0; continue; } const p=nearest([d[i],d[i+1],d[i+2]],pal); d[i]=p[0]; d[i+1]=p[1]; d[i+2]=p[2]; d[i+3]=255; } ctx.putImageData(img,0,0); return pal; }
function outline(ctx,w,h){ const src=ctx.getImageData(0,0,w,h), out=ctx.getImageData(0,0,w,h), s=src.data,d=out.data; let sr=0,sg=0,sb=0,n=0; for(let i=0;i<s.length;i+=4){ if(s[i+3]>160){sr+=s[i];sg+=s[i+1];sb+=s[i+2];n++;} } const col=n?[Math.max(16,Math.round(sr/n*.32)),Math.max(16,Math.round(sg/n*.32)),Math.max(20,Math.round(sb/n*.38)),210]:[48,40,64,210]; for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){ const idx=(y*w+x)*4; if(s[idx+3])continue; let near=0; for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){ if(!xx&&!yy)continue; if(s[((y+yy)*w+(x+xx))*4+3]>160)near++; } if(near>=2){ d[idx]=col[0]; d[idx+1]=col[1]; d[idx+2]=col[2]; d[idx+3]=col[3]; } } ctx.putImageData(out,0,0); }
function faceDots(ctx){ const d=ctx.getImageData(0,0,32,32); const a=d.data; function set(x,y,c){ const i=(y*32+x)*4; a[i]=c[0]; a[i+1]=c[1]; a[i+2]=c[2]; a[i+3]=255; } set(14,9,[250,250,250]); set(19,9,[250,250,250]); set(13,12,[230,145,165]); set(19,12,[230,145,165]); ctx.putImageData(d,0,0); }
function renderFaithful(res){
  const src=sourceCanvas(res), bb=getSourceBBox(res); const out=document.createElement('canvas'); fit(out,32,32); const ctx=out.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.imageSmoothingEnabled=true;
  const targetH=30, scale=targetH/Math.max(1,bb.h), dw=Math.max(1,Math.round(bb.w*scale)), dx=Math.round((32-dw)/2), dy=1;
  ctx.drawImage(src,bb.minx,bb.miny,bb.w,bb.h,dx,dy,dw,targetH);
  const k=clamp(parseInt(qs7('k')?.value||'8',10)+2,5,14); const pal=quantize(ctx,32,32,k); outline(ctx,32,32); return {canvas:out,bbox:bb,mode:'faithful',paletteSize:pal.length,scale,offset:{x:dx,y:dy}};
}
function renderChibi(res){
  const src=sourceCanvas(res), bb=getSourceBBox(res), an=getAnchors(res,bb); const hi=document.createElement('canvas'); fit(hi,96,96); const hctx=hi.getContext('2d'); hctx.clearRect(0,0,96,96); hctx.imageSmoothingEnabled=true;
  const topH=Math.max(8,an.headEnd-bb.miny+1), midH=Math.max(8,an.torsoEnd-an.headEnd), botH=Math.max(8,bb.maxy-an.torsoEnd+1);
  drawStrip(hctx,src,bb.minx,bb.miny,bb.w,topH,14,1,68,36);
  drawStrip(hctx,src,bb.minx,an.headEnd,bb.w,midH,18,33,60,30);
  drawStrip(hctx,src,bb.minx,an.torsoEnd,bb.w,botH,24,60,48,31);
  const out=document.createElement('canvas'); fit(out,32,32); const ctx=out.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.imageSmoothingEnabled=true; ctx.drawImage(hi,0,0,32,32);
  const k=clamp(parseInt(qs7('k')?.value||'8',10)+2,5,14); const pal=quantize(ctx,32,32,k); outline(ctx,32,32); faceDots(ctx); return {canvas:out,bbox:bb,mode:'chibi',anchors:an,paletteSize:pal.length};
}
function currentMode(){ return qs7('pixelMode')?.value || 'faithful'; }
function renderTrueSource(res){ const mode=currentMode(); return mode==='source_chibi'?renderChibi(res):renderFaithful(res); }
function applyResult(res, pack){ const id=pack.canvas.getContext('2d').getImageData(0,0,32,32); res.sprite32V17={imageData:id,status:'ok',renderer:'true_source_pixel_v1_7',mode:pack.mode,bbox:pack.bbox,anchors:pack.anchors||null,paletteSize:pack.paletteSize,scale:pack.scale||null,offset:pack.offset||null,note:'uses state.result.pre.analysis transparent ImageData, not display checker canvas'}; res.sprite32V16=res.sprite32V17; res.sprite32V15=res.sprite32V17; res.sprite32V14=res.sprite32V17; res.sprite32V13=res.sprite32V17; res.sprite32V12=res.sprite32V17; res.sprite32V11=res.sprite32V17; res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.imageData=id; res.sprite32V10.status='ok-true-source-v1.7'; return id; }
function canvasV17(){ const pack=renderTrueSource(state.result); applyResult(state.result,pack); return pack.canvas; }
function saveLink(dataUrl,name,label){ try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){} const log=qs7('pixelLog')||qs7('log'); if(log){ let box=document.getElementById('saveLinksV17'); if(!box){ box=document.createElement('div'); box.id='saveLinksV17'; box.style.marginTop='10px'; log.parentNode.appendChild(box); } const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff'; box.prepend(a); } }
function saveSprite32V17(){ if(!state.result){alert('先に解析してください。');return;} const c=canvasV17(); saveLink(c.toDataURL('image/png'),`sprite_front_32_v1_7_${currentMode()}.png`,`画像を開く/保存 sprite_front_32_v1_7_${currentMode()}.png`); }
function projectV17(){ const res=state.result; if(!res)return {version:VERSION_V17,status:'no_result'}; if(!res.sprite32V17){ const p=renderTrueSource(res); applyResult(res,p); } return {version:VERSION_V17,type:'game_sprite_32_true_source',output:{sprite:`sprite_front_32_v1_7_${res.sprite32V17.mode}.png`,size:{w:32,h:32}},renderer:'true_source_pixel_v1_7',mode:res.sprite32V17.mode,bbox:res.sprite32V17.bbox,anchors:res.sprite32V17.anchors,paletteSize:res.sprite32V17.paletteSize,goal:'preserve source image data by using transparent pre.analysis ImageData directly'}; }
function saveProjectV17(){ if(!state.result){alert('先に解析してください。');return;} saveLink('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(projectV17(),null,2)),`sprite_pixel_project_v1_7_${currentMode()}.json`,`JSONを開く/保存 sprite_pixel_project_v1_7_${currentMode()}.json`); }
function drawV17(){
  if(!state.result)return; const pack=renderTrueSource(state.result); const id=applyResult(state.result,pack); const c32=qs7('cSprite32'), prev=qs7('cSpritePreview'), st=qs7('spriteStatus'), log=qs7('pixelLog');
  if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); }
  if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ctx.beginPath();ctx.moveTo(i*10,0);ctx.lineTo(i*10,320);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*10);ctx.lineTo(320,i*10);ctx.stroke();} const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); }
  if(st) st.textContent=`v1.7 true source ${pack.mode}`;
  if(log){ log.textContent=`Sprite v1.7\nstatus=ok\nrenderer=true_source_pixel_v1_7\nmode=${pack.mode}\n\n元画像利用:\n- source = state.result.pre.analysis 透明ImageData\n- display canvasではなく内部の透過前景を使用\n- bbox = ${pack.bbox.w}x${pack.bbox.h}\n- paletteSize = ${pack.paletteSize}\n\nモード:\n- faithful = 元画像の全体形状を忠実に32x32へ縮小\n- source_chibi = 元画像を頭/胴/脚ストリップでちび化\n\n保存: 32x32 PNG保存 / ドット絵JSON保存`; }
}
function addModeUi(){ const bar=document.querySelector('.bar'); if(!bar || qs7('pixelMode')) return; const sel=document.createElement('select'); sel.id='pixelMode'; sel.innerHTML='<option value="faithful">ドット化:元画像忠実</option><option value="source_chibi">ドット化:元画像ちび化</option>'; sel.onchange=()=>{ if(state.result) drawV17(); }; const run=qs7('run'); if(run) bar.insertBefore(sel,run); else bar.appendChild(sel); }
function installV17(){ addModeUi(); const b1=qs7('saveSprite32'); if(b1)b1.onclick=saveSprite32V17; const b2=qs7('savePixelProject'); if(b2)b2.onclick=saveProjectV17; const oldAnalyze=(typeof analyze==='function')?analyze:null; async function analyzeV17(){ if(oldAnalyze)await oldAnalyze(); try{ if(state.result)drawV17(); }catch(e){console.warn('v1.7 draw failed',e);} } analyze=analyzeV17; window.analyzeV17=analyzeV17; window.renderTrueSourceV17=renderTrueSource; const run=qs7('run'); if(run)run.onclick=analyzeV17; ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=qs7(id); if(el)el.oninput=()=>{state.lineAdjust={face:+(qs7('adjFace')?.value||0),shoulder:+(qs7('adjShoulder')?.value||0),waist:+(qs7('adjWaist')?.value||0),crotch:+(qs7('adjCrotch')?.value||0),ankle:+(qs7('adjAnkle')?.value||0)}; analyzeV17();};}); document.title='Sprite Studio Pixel Pipeline v1.7'; const h1=document.querySelector('h1'); if(h1)h1.textContent='Sprite Studio Pixel Pipeline v1.7'; const sub=document.querySelector('.sub'); if(sub)sub.textContent='AIなし / Canvas + localStorageのみ。v1.7: true-source。内部の透明前景ImageDataを直接32x32化します。'; const footer=document.querySelector('.footer'); if(footer)footer.textContent='v1.7は true-source pixel renderer です。表示用チェッカーではなく、pre.analysis の透明な元画像データを直接使います。'; }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV17); else installV17();
if(typeof metadata092==='function'){ const oldMeta=metadata092; metadata092=function(){ const m=oldMeta(); m.version=VERSION_V17; m.pixel_sprite_v17={status:state.result?.sprite32V17?.status||'not_run',renderer:'true_source_pixel_v1_7',mode:state.result?.sprite32V17?.mode||null,bbox:state.result?.sprite32V17?.bbox||null}; return m; }; }
})();
