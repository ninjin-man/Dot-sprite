/* Sprite Studio Pixel Pipeline v1.14
 * Source-Guided Pixel Renderer
 * 目的:
 * - テンプレ素体へ置き換えず、入力画像そのものを材料に128x128ゲーム用ドット絵を再構成する
 * - 特定画像依存の色/部位名ルールは禁止
 * - 背景除去 → Source128 → Pixel128 → Pixel64 → Pixel32 の順で処理する
 *
 * 汎用10ルール実装:
 * 1. 外周接続背景だけを削除する
 * 2. 主シルエットbboxを固定倍率で中央配置する
 * 3. 上部重要領域の小特徴を潰さず可読性を上げる
 * 4. 細長い外周連続領域を太い流れとして統合する
 * 5. 小さな識別突起をノイズ扱いせず保持する
 * 6. 大面積の主素材領域を単純な色面として残す
 * 7. 高コントラスト細部を点・短線の装飾記号へ圧縮する
 * 8. 外側に広がる副シルエット領域を薄色でも保持する
 * 9. 下半身・足先・持ち物先端などポーズ端点を保持する
 * 10. 透明境界と重要内部境界にドット用輪郭を追加する
 */
(function(){
  'use strict';

  const VERSION = 'v1.14 sourceGuided';
  const $ = (id) => document.getElementById(id);

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function rgb(c){ return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }
  function rgba(c,a){ return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
  function mix(a,b,t){ return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)]; }
  function dark(c,t){ return mix(c,[0,0,0],t); }
  function light(c,t){ return mix(c,[255,255,255],t); }
  function distRGB(a,b){ const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2]; return Math.sqrt(dr*dr + dg*dg + db*db); }
  function luminance(r,g,b){ return 0.299*r + 0.587*g + 0.114*b; }
  function satOf(r,g,b){ return Math.max(r,g,b)-Math.min(r,g,b); }
  function sign(v){ return v<0?-1:v>0?1:0; }

  function setStatus(text){ const el=$('spriteStatus'); if(el) el.textContent=text; }
  function setLabel(id,text){ const el=$(id); if(el) el.textContent=text; }
  function getRangeValue(id){ const el=$(id); return el ? Number(el.value||0) : 0; }

  function logPixel(lines){
    const el=$('pixelLog');
    if(!el) return;
    el.textContent = lines.join('\n');
  }

  function clearCanvas(canvas,w,h){
    if(!canvas) return null;
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,w,h);
    return ctx;
  }

  function makeCanvas(w,h){
    const c=document.createElement('canvas');
    c.width=w; c.height=h;
    return c;
  }

  function loadImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=()=>{ URL.revokeObjectURL(url); resolve(img); };
      img.onerror=(e)=>{ URL.revokeObjectURL(url); reject(e); };
      img.src=url;
    });
  }

  function canvasFromImage(img){
    const c=makeCanvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const ctx=c.getContext('2d', { willReadFrequently:true });
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(img,0,0,c.width,c.height);
    return { canvas:c, ctx, w:c.width, h:c.height };
  }

  function median(values){
    if(!values.length) return 0;
    const arr=values.slice().sort((a,b)=>a-b);
    return arr[(arr.length/2)|0];
  }

  function sampleBackgroundModel(ctx,w,h){
    const data=ctx.getImageData(0,0,w,h).data;
    const rs=[],gs=[],bs=[], ls=[];
    const step=Math.max(1, Math.floor(Math.min(w,h)/90));
    function add(x,y){
      const i=(y*w+x)*4;
      if(data[i+3] < 12) return;
      rs.push(data[i]); gs.push(data[i+1]); bs.push(data[i+2]); ls.push(luminance(data[i],data[i+1],data[i+2]));
    }
    for(let x=0;x<w;x+=step){ add(x,0); add(x,h-1); }
    for(let y=0;y<h;y+=step){ add(0,y); add(w-1,y); }
    const bg=[median(rs), median(gs), median(bs)];
    let sumD=0, sumSat=0;
    for(let i=0;i<rs.length;i++){
      sumD += distRGB([rs[i],gs[i],bs[i]], bg);
      sumSat += satOf(rs[i],gs[i],bs[i]);
    }
    const noise = rs.length ? sumD/rs.length : 0;
    const sat = rs.length ? sumSat/rs.length : 0;
    const lum = ls.length ? median(ls) : 255;
    return { color:bg, noise, sat, lum };
  }

  function floodBackground(ctx,w,h,bg){
    const img=ctx.getImageData(0,0,w,h);
    const d=img.data;
    const bgMask=new Uint8Array(w*h);
    const qx=new Int32Array(w*h);
    const qy=new Int32Array(w*h);
    let qh=0, qt=0;
    const baseTh = clamp(24 + bg.noise*1.6 + Math.max(0,bg.sat-12)*0.2, 20, 58);
    const softTh = baseTh*1.18;
    function passable(x,y){
      const idx=(y*w+x)*4;
      const a=d[idx+3];
      if(a < 10) return true;
      const r=d[idx], g=d[idx+1], b=d[idx+2];
      const dist=distRGB([r,g,b], bg.color);
      const sat=satOf(r,g,b);
      const lum=luminance(r,g,b);
      if(dist <= baseTh) return true;
      if(dist <= softTh && sat < 22 && Math.abs(lum - bg.lum) < 22) return true;
      return false;
    }
    function push(x,y){
      const i=y*w+x;
      if(bgMask[i]) return;
      if(!passable(x,y)) return;
      bgMask[i]=1;
      qx[qt]=x; qy[qt]=y; qt++;
    }
    for(let x=0;x<w;x++){ push(x,0); push(x,h-1); }
    for(let y=0;y<h;y++){ push(0,y); push(w-1,y); }
    while(qh<qt){
      const x=qx[qh], y=qy[qh]; qh++;
      if(x>0) push(x-1,y);
      if(x<w-1) push(x+1,y);
      if(y>0) push(x,y-1);
      if(y<h-1) push(x,y+1);
    }
    return bgMask;
  }

  function dilate(mask,w,h,iter){
    let cur=mask;
    for(let n=0;n<iter;n++){
      const out=new Uint8Array(cur);
      for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
          const i=y*w+x;
          if(cur[i]) continue;
          let cnt=0;
          for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) if(cur[(y+yy)*w+(x+xx)]) cnt++;
          if(cnt>=3) out[i]=1;
        }
      }
      cur=out;
    }
    return cur;
  }

  function erode(mask,w,h,iter){
    let cur=mask;
    for(let n=0;n<iter;n++){
      const out=new Uint8Array(cur);
      for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
          const i=y*w+x;
          if(!cur[i]) continue;
          let cnt=0;
          for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) if(cur[(y+yy)*w+(x+xx)]) cnt++;
          if(cnt<=4) out[i]=0;
        }
      }
      cur=out;
    }
    return cur;
  }

  function closeMask(mask,w,h){
    return erode(dilate(mask,w,h,1),w,h,1);
  }

  function invertMask(mask){
    const out=new Uint8Array(mask.length);
    for(let i=0;i<mask.length;i++) out[i]=mask[i]?0:1;
    return out;
  }

  function connectedComponents(mask,w,h){
    const labels=new Int32Array(w*h);
    const comps=[];
    let label=0;
    const qx=new Int32Array(w*h);
    const qy=new Int32Array(w*h);
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const start=y*w+x;
        if(!mask[start] || labels[start]) continue;
        label++;
        let qh=0, qt=0;
        qx[qt]=x; qy[qt]=y; qt++;
        labels[start]=label;
        let minX=x,maxX=x,minY=y,maxY=y,area=0,sumX=0,sumY=0;
        while(qh<qt){
          const cx=qx[qh], cy=qy[qh]; qh++;
          const idx=cy*w+cx;
          area++; sumX += cx; sumY += cy;
          if(cx<minX) minX=cx; if(cx>maxX) maxX=cx; if(cy<minY) minY=cy; if(cy>maxY) maxY=cy;
          for(let dy=-1;dy<=1;dy++){
            for(let dx=-1;dx<=1;dx++){
              if(dx===0 && dy===0) continue;
              const nx=cx+dx, ny=cy+dy;
              if(nx<0||ny<0||nx>=w||ny>=h) continue;
              const ni=ny*w+nx;
              if(!mask[ni] || labels[ni]) continue;
              labels[ni]=label;
              qx[qt]=nx; qy[qt]=ny; qt++;
            }
          }
        }
        comps.push({ id:label, area, minX, minY, maxX, maxY, w:maxX-minX+1, h:maxY-minY+1, cx:sumX/area, cy:sumY/area });
      }
    }
    return { labels, comps };
  }

  function makeForegroundMask(bgMask,w,h){
    const fg=invertMask(bgMask);
    const { labels, comps } = connectedComponents(fg,w,h);
    if(!comps.length) return fg;
    comps.sort((a,b)=>b.area-a.area);
    const main=comps[0];
    const keep=new Uint8Array(w*h);
    const maxArea=main.area;
    for(const c of comps){
      const near = !(c.maxX < main.minX-12 || c.minX > main.maxX+12 || c.maxY < main.minY-12 || c.minY > main.maxY+12);
      const enough = c.area >= Math.max(16, maxArea*0.015);
      const central = c.cx > w*0.15 && c.cx < w*0.85 && c.cy > h*0.05 && c.cy < h*0.97;
      if(c.id===main.id || enough || (near && central)){
        for(let i=0;i<labels.length;i++) if(labels[i]===c.id) keep[i]=1;
      }
    }
    return closeMask(keep,w,h);
  }

  function getBBox(mask,w,h){
    let minX=w, minY=h, maxX=-1, maxY=-1, count=0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        if(!mask[y*w+x]) continue;
        if(x<minX) minX=x; if(x>maxX) maxX=x; if(y<minY) minY=y; if(y>maxY) maxY=y;
        count++;
      }
    }
    if(count===0) return {x:0,y:0,w, h, count:0};
    return { x:minX, y:minY, w:maxX-minX+1, h:maxY-minY+1, count };
  }

  function applyBBoxAdjustments(bbox,h){
    const face = getRangeValue('adjFace');
    const shoulder = getRangeValue('adjShoulder');
    const waist = getRangeValue('adjWaist');
    const crotch = getRangeValue('adjCrotch');
    const ankle = getRangeValue('adjAnkle');
    const topBias = Math.round((face + shoulder*0.5) * 0.15);
    const bottomBias = Math.round((waist + crotch + ankle) * 0.08);
    const y = clamp(bbox.y + topBias, 0, h-1);
    const bottom = clamp(bbox.y + bbox.h - 1 + bottomBias, y, h-1);
    return { x:bbox.x, y, w:bbox.w, h:bottom-y+1, count:bbox.count };
  }

  function drawOriginalPreview(src){
    const c=$('cOriginal'); if(!c) return;
    const maxSide=360;
    const scale=Math.min(maxSide/src.w, maxSide/src.h, 1);
    c.width=Math.max(1,Math.round(src.w*scale));
    c.height=Math.max(1,Math.round(src.h*scale));
    const ctx=c.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.drawImage(src.canvas,0,0,c.width,c.height);
    const pill=$('size'); if(pill) pill.textContent=`${src.w}x${src.h}`;
  }

  function drawCutoutPreview(src,mask,bbox){
    const c=$('cCutout'); if(!c) return;
    const maxSide=360;
    const scale=Math.min(maxSide/src.w, maxSide/src.h, 1);
    c.width=Math.max(1,Math.round(src.w*scale));
    c.height=Math.max(1,Math.round(src.h*scale));
    const ctx=c.getContext('2d');
    const cell=8;
    for(let y=0;y<c.height;y+=cell){
      for(let x=0;x<c.width;x+=cell){
        ctx.fillStyle=((x/cell + y/cell)&1) ? '#1e293b' : '#0f172a';
        ctx.fillRect(x,y,cell,cell);
      }
    }
    const cut=makeCanvas(src.w, src.h);
    const cutCtx=cut.getContext('2d');
    const img=src.ctx.getImageData(0,0,src.w,src.h);
    for(let i=0;i<mask.length;i++) if(!mask[i]) img.data[i*4+3]=0;
    cutCtx.putImageData(img,0,0);
    ctx.drawImage(cut,0,0,c.width,c.height);
    ctx.strokeStyle='#22c55e'; ctx.lineWidth=1.5;
    ctx.strokeRect(bbox.x*scale, bbox.y*scale, bbox.w*scale, bbox.h*scale);
  }

  function drawGuides(src,bbox){
    const c=$('cLines'); if(!c) return;
    const maxSide=360;
    const scale=Math.min(maxSide/src.w, maxSide/src.h, 1);
    c.width=Math.max(1,Math.round(src.w*scale));
    c.height=Math.max(1,Math.round(src.h*scale));
    const ctx=c.getContext('2d');
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(src.canvas,0,0,c.width,c.height);
    const x=bbox.x*scale, y=bbox.y*scale, w=bbox.w*scale, h=bbox.h*scale;
    ctx.strokeStyle='#22c55e'; ctx.lineWidth=2; ctx.strokeRect(x,y,w,h);
    const lines=[
      ['head',0.14 + getRangeValue('adjFace')*0.0018,'#f472b6'],
      ['shoulder',0.28 + getRangeValue('adjShoulder')*0.0018,'#60a5fa'],
      ['waist',0.54 + getRangeValue('adjWaist')*0.0015,'#facc15'],
      ['crotch',0.66 + getRangeValue('adjCrotch')*0.0015,'#fb923c'],
      ['ankle',0.92 + getRangeValue('adjAnkle')*0.0015,'#a78bfa']
    ];
    ctx.font='12px sans-serif'; ctx.textBaseline='bottom';
    for(const [name,t,color] of lines){
      const yy = y + h*clamp(t,0.02,0.98);
      ctx.strokeStyle=color; ctx.fillStyle=color;
      ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x+w,yy); ctx.stroke();
      ctx.fillText(name, x+4, yy-2);
    }
  }

  function buildCutoutCanvas(src,mask){
    const c=makeCanvas(src.w, src.h);
    const ctx=c.getContext('2d', { willReadFrequently:true });
    const img=src.ctx.getImageData(0,0,src.w,src.h);
    for(let i=0;i<mask.length;i++){
      if(!mask[i]) img.data[i*4+3]=0;
    }
    ctx.putImageData(img,0,0);
    return c;
  }

  function buildSource128(src,mask,bbox){
    const out=makeCanvas(128,128);
    const ctx=out.getContext('2d', { willReadFrequently:true });
    ctx.imageSmoothingEnabled=true;
    const fitW=118, fitH=118;
    const scale=Math.min(fitW/bbox.w, fitH/bbox.h);
    const dw=Math.max(1, Math.round(bbox.w*scale));
    const dh=Math.max(1, Math.round(bbox.h*scale));
    const dx=Math.round((128-dw)/2);
    const dy=Math.round((128-dh)/2);
    const cut=buildCutoutCanvas(src,mask);
    ctx.clearRect(0,0,128,128);
    ctx.drawImage(cut, bbox.x,bbox.y,bbox.w,bbox.h, dx,dy,dw,dh);
    return out;
  }

  function getAlphaMaskFromCanvas(canvas){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const w=canvas.width, h=canvas.height;
    const data=ctx.getImageData(0,0,w,h).data;
    const mask=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) mask[i]=data[i*4+3] > 10 ? 1 : 0;
    return { mask, data, w, h, ctx };
  }

  function buildImportanceMapFromSource(canvas){
    const { mask, data, w, h } = getAlphaMaskFromCanvas(canvas);
    const bbox = getBBox(mask,w,h);
    const map=new Float32Array(w*h);
    const core=erode(mask,w,h,1);
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        if(!mask[i]) continue;
        const p=i*4;
        const r=data[p], g=data[p+1], b=data[p+2];
        const lum=luminance(r,g,b);
        let neighborLum=0, n=0, alphaN=0;
        for(let yy=-1;yy<=1;yy++){
          for(let xx=-1;xx<=1;xx++){
            if(!xx && !yy) continue;
            const ni=(y+yy)*w+(x+xx);
            if(mask[ni]){
              const np=ni*4;
              neighborLum += luminance(data[np],data[np+1],data[np+2]);
              alphaN++;
            }
            n++;
          }
        }
        neighborLum = alphaN ? neighborLum/alphaN : lum;
        const contrast=Math.abs(lum-neighborLum);
        let score=0;
        const nx=(x-bbox.x)/Math.max(1,bbox.w-1);
        const ny=(y-bbox.y)/Math.max(1,bbox.h-1);
        const boundary = !core[i];
        if(boundary) score += 3.0;
        if(alphaN < 7) score += 1.8;
        if(ny < 0.38) score += 1.7; // 上部重要領域
        if(ny > 0.72) score += 1.4; // 足先/端点
        if(nx < 0.14 || nx > 0.86) score += 1.2; // 左右端の識別突起
        if(contrast > 18) score += 1.6;
        if(contrast > 36) score += 1.1;
        if(boundary && contrast > 20) score += 0.8;
        if(satOf(r,g,b) > 34) score += 0.5;
        map[i]=score;
      }
    }
    return { map, bbox, mask, data, w, h, core };
  }

  function sampleWeightedPixels(data,mask,importance,w,h,maxSamples){
    const samples=[];
    const step = Math.max(1, Math.floor(Math.sqrt((w*h)/Math.max(400, maxSamples*2))));
    for(let y=0;y<h;y+=step){
      for(let x=0;x<w;x+=step){
        const i=y*w+x;
        if(!mask[i]) continue;
        const p=i*4;
        const color=[data[p],data[p+1],data[p+2]];
        const weight = clamp(Math.round((importance[i] || 0)*0.8)+1, 1, 4);
        for(let k=0;k<weight;k++) samples.push(color);
      }
    }
    if(samples.length <= maxSamples) return samples;
    const out=[];
    const stride=samples.length/maxSamples;
    for(let i=0;i<maxSamples;i++) out.push(samples[Math.floor(i*stride)]);
    return out;
  }

  function kmeansPalette(samples,k){
    if(!samples.length) return [[0,0,0]];
    k=Math.min(k, samples.length);
    const centers=[];
    const used=new Set();
    for(let i=0;i<k;i++){
      let idx=Math.floor((i/(k||1))*samples.length);
      while(used.has(idx) && idx<samples.length-1) idx++;
      used.add(idx);
      centers.push(samples[idx].slice());
    }
    for(let iter=0;iter<8;iter++){
      const sums=Array.from({length:k},()=>[0,0,0,0]);
      for(const s of samples){
        let best=0, bestD=1e9;
        for(let i=0;i<k;i++){
          const d=distRGB(s, centers[i]);
          if(d<bestD){ bestD=d; best=i; }
        }
        sums[best][0]+=s[0]; sums[best][1]+=s[1]; sums[best][2]+=s[2]; sums[best][3]++;
      }
      for(let i=0;i<k;i++){
        if(sums[i][3]){
          centers[i]=[sums[i][0]/sums[i][3], sums[i][1]/sums[i][3], sums[i][2]/sums[i][3]];
        }
      }
    }
    centers.sort((a,b)=>luminance(a[0],a[1],a[2]) - luminance(b[0],b[1],b[2]));
    return centers;
  }

  function nearestColorIndex(color,palette){
    let best=0, bestD=1e9;
    for(let i=0;i<palette.length;i++){
      const d=distRGB(color,palette[i]);
      if(d<bestD){ bestD=d; best=i; }
    }
    return best;
  }

  function createQuantizedBase(sourceInfo,k){
    const { data, mask, map, w, h } = sourceInfo;
    const samples=sampleWeightedPixels(data,mask,map,w,h,1200);
    const palette=kmeansPalette(samples,k);
    const idxMap=new Int16Array(w*h);
    const out=makeCanvas(w,h);
    const ctx=out.getContext('2d', { willReadFrequently:true });
    const img=ctx.createImageData(w,h);
    for(let i=0;i<w*h;i++){
      if(!mask[i]){ img.data[i*4+3]=0; idxMap[i]=-1; continue; }
      const p=i*4;
      const srcColor=[data[p],data[p+1],data[p+2]];
      const idx=nearestColorIndex(srcColor,palette);
      idxMap[i]=idx;
      const c=palette[idx];
      img.data[p]=c[0]|0; img.data[p+1]=c[1]|0; img.data[p+2]=c[2]|0; img.data[p+3]=255;
    }
    ctx.putImageData(img,0,0);
    return { canvas:out, ctx, data:img.data, palette, idxMap };
  }

  function detectAccentMask(sourceInfo){
    const { data, mask, bbox, w, h } = sourceInfo;
    const accent=new Uint8Array(w*h);
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        if(!mask[i]) continue;
        const p=i*4;
        const r=data[p], g=data[p+1], b=data[p+2];
        const lum=luminance(r,g,b);
        let mean=0, n=0, alphaN=0;
        for(let yy=-1;yy<=1;yy++){
          for(let xx=-1;xx<=1;xx++){
            if(!xx && !yy) continue;
            const ni=(y+yy)*w+(x+xx);
            if(mask[ni]){
              const np=ni*4;
              mean += luminance(data[np],data[np+1],data[np+2]);
              alphaN++;
            }
            n++;
          }
        }
        if(alphaN < 4) continue;
        mean /= alphaN;
        const contrast=Math.abs(lum-mean);
        const nx=(x-bbox.x)/Math.max(1,bbox.w-1);
        const ny=(y-bbox.y)/Math.max(1,bbox.h-1);
        if(contrast > 26 && satOf(r,g,b) > 18){
          // 大面積塗りつぶしを避けるため間引き。
          if(((x+y)&1)===0 || ny < 0.42 || nx < 0.16 || nx > 0.84) accent[i]=1;
        }
      }
    }
    return accent;
  }

  function boundaryBand(mask,core,w,h){
    const out=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) if(mask[i] && !core[i]) out[i]=1;
    return out;
  }

  function detectFlowMask(sourceInfo){
    const { mask, core, bbox, w, h } = sourceInfo;
    const band=boundaryBand(mask,core,w,h);
    const { labels, comps }=connectedComponents(band,w,h);
    const flow=new Uint8Array(w*h);
    for(const c of comps){
      const ratio=Math.max(c.w,c.h)/Math.max(1,Math.min(c.w,c.h));
      const touchesOuter = c.minX<=bbox.x+2 || c.maxX>=bbox.x+bbox.w-3 || c.minY<=bbox.y+2 || c.maxY>=bbox.y+bbox.h-3;
      const sideZone = c.cx < bbox.x+bbox.w*0.25 || c.cx > bbox.x+bbox.w*0.75;
      if(c.area >= 10 && c.area <= bbox.count*0.22 && ratio >= 1.8 && (touchesOuter || sideZone)){
        for(let i=0;i<labels.length;i++) if(labels[i]===c.id) flow[i]=1;
      }
    }
    return flow;
  }

  function detectProtrusionMask(sourceInfo){
    const { mask, bbox, w, h } = sourceInfo;
    const opened=erode(dilate(mask,w,h,1),w,h,1);
    const protrusion=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) if(mask[i] && !opened[i]) protrusion[i]=1;
    const { labels, comps }=connectedComponents(protrusion,w,h);
    const keep=new Uint8Array(w*h);
    for(const c of comps){
      const nx=(c.cx-bbox.x)/Math.max(1,bbox.w-1);
      const ny=(c.cy-bbox.y)/Math.max(1,bbox.h-1);
      const topOrEdge = ny < 0.46 || nx < 0.18 || nx > 0.82 || ny > 0.78;
      if(c.area >= 2 && c.area <= 52 && topOrEdge){
        for(let i=0;i<labels.length;i++) if(labels[i]===c.id) keep[i]=1;
      }
    }
    return keep;
  }

  function dominantDark(palette){
    if(!palette.length) return [12,16,24];
    return dark(palette[0], 0.28);
  }

  function compressAccentStrokes(canvas, accentMask, sourceInfo){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const data=img.data;
    const src=sourceInfo.data;
    const w=canvas.width, h=canvas.height;
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        if(!accentMask[i] || !sourceInfo.mask[i]) continue;
        const runH = (accentMask[i-1]?1:0) + (accentMask[i+1]?1:0);
        const runV = (accentMask[i-w]?1:0) + (accentMask[i+w]?1:0);
        if(runH+runV===0) continue;
        // 長すぎる線をそのまま残さず、間引いて点・短線化する。
        if(((x+y)&1)===1 && (runH>=1 || runV>=1)) continue;
        const p=i*4;
        data[p]=src[p]; data[p+1]=src[p+1]; data[p+2]=src[p+2]; data[p+3]=255;
      }
    }
    ctx.putImageData(img,0,0);
  }

  function thickenMaskIntoCanvas(canvas, regionMask, sourceInfo, strength){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const data=img.data;
    const src=sourceInfo.data;
    const w=canvas.width, h=canvas.height;
    const dil=dilate(regionMask,w,h,1);
    for(let i=0;i<w*h;i++){
      if(!dil[i] || !sourceInfo.mask[i]) continue;
      const p=i*4;
      if(regionMask[i]){
        data[p]=src[p]; data[p+1]=src[p+1]; data[p+2]=src[p+2]; data[p+3]=255;
      }else if(strength>0){
        data[p]=lerp(data[p], src[p], strength)|0;
        data[p+1]=lerp(data[p+1], src[p+1], strength)|0;
        data[p+2]=lerp(data[p+2], src[p+2], strength)|0;
        data[p+3]=255;
      }
    }
    ctx.putImageData(img,0,0);
  }

  function reinforceHeadDetails(canvas, sourceInfo){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const data=img.data;
    const src=sourceInfo.data;
    const { mask, bbox, w, h } = sourceInfo;
    for(let y=bbox.y; y<Math.min(h, bbox.y + Math.floor(bbox.h*0.38)); y++){
      for(let x=bbox.x; x<bbox.x+bbox.w; x++){
        const i=y*w+x;
        if(!mask[i]) continue;
        const p=i*4;
        const lum=luminance(src[p],src[p+1],src[p+2]);
        let mean=0, n=0;
        for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++){
          const nx=x+xx, ny=y+yy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue;
          const ni=ny*w+nx;
          if(!mask[ni]) continue;
          const np=ni*4;
          mean += luminance(src[np],src[np+1],src[np+2]);
          n++;
        }
        mean = n ? mean/n : lum;
        if(Math.abs(lum-mean) > 18){
          data[p]=lerp(data[p], src[p], 0.55)|0;
          data[p+1]=lerp(data[p+1], src[p+1], 0.55)|0;
          data[p+2]=lerp(data[p+2], src[p+2], 0.55)|0;
          data[p+3]=255;
        }
      }
    }
    ctx.putImageData(img,0,0);
  }

  function addOutline(canvas, sourceInfo, palette){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const data=img.data;
    const { mask, w, h } = sourceInfo;
    const outline=dominantDark(palette);
    const outMask=new Uint8Array(w*h);
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        if(mask[i]){
          let touchesBg=false;
          for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) if((xx||yy) && !mask[(y+yy)*w+(x+xx)]) touchesBg=true;
          if(touchesBg){
            const p=i*4;
            data[p]=lerp(data[p], outline[0], 0.55)|0;
            data[p+1]=lerp(data[p+1], outline[1], 0.55)|0;
            data[p+2]=lerp(data[p+2], outline[2], 0.55)|0;
            data[p+3]=255;
            for(let yy=-1;yy<=1;yy++){
              for(let xx=-1;xx<=1;xx++){
                const ni=(y+yy)*w+(x+xx);
                if(!mask[ni]) outMask[ni]=1;
              }
            }
          }
        }
      }
    }
    for(let i=0;i<w*h;i++){
      if(!outMask[i]) continue;
      const p=i*4;
      if(data[p+3]) continue;
      data[p]=outline[0]|0; data[p+1]=outline[1]|0; data[p+2]=outline[2]|0; data[p+3]=255;
    }
    // 重要内部境界
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        if(!mask[i]) continue;
        const p=i*4;
        const c=[data[p],data[p+1],data[p+2]];
        let highDiff=false;
        for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const ni=(y+dy)*w+(x+dx);
          if(!mask[ni]) continue;
          const np=ni*4;
          const nc=[data[np],data[np+1],data[np+2]];
          if(distRGB(c,nc) > 52){ highDiff=true; break; }
        }
        if(highDiff){
          data[p]=lerp(data[p], outline[0], 0.23)|0;
          data[p+1]=lerp(data[p+1], outline[1], 0.23)|0;
          data[p+2]=lerp(data[p+2], outline[2], 0.23)|0;
        }
      }
    }
    ctx.putImageData(img,0,0);
  }

  function cleanupSmallNoise(canvas){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const w=canvas.width, h=canvas.height;
    const img=ctx.getImageData(0,0,w,h);
    const data=img.data;
    const alpha=new Uint8Array(w*h);
    for(let i=0;i<w*h;i++) alpha[i]=data[i*4+3]>10?1:0;
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x;
        if(!alpha[i]) continue;
        let cnt=0;
        for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) if((xx||yy) && alpha[(y+yy)*w+(x+xx)]) cnt++;
        if(cnt===0){ data[i*4+3]=0; }
      }
    }
    ctx.putImageData(img,0,0);
  }

  function buildPixel128(source128,kValue){
    const info=buildImportanceMapFromSource(source128);
    const k = clamp(Number(kValue||7)+5, 8, 14);
    const base=createQuantizedBase(info,k);
    const flowMask=detectFlowMask(info);
    const protrusionMask=detectProtrusionMask(info);
    const accentMask=detectAccentMask(info);

    thickenMaskIntoCanvas(base.canvas, flowMask, info, 0.38);      // ルール4・8
    thickenMaskIntoCanvas(base.canvas, protrusionMask, info, 0.50);// ルール5・9
    reinforceHeadDetails(base.canvas, info);                        // ルール3
    compressAccentStrokes(base.canvas, accentMask, info);           // ルール7
    addOutline(base.canvas, info, base.palette);                    // ルール10
    cleanupSmallNoise(base.canvas);

    return { canvas:base.canvas, info, palette:base.palette, flowMask, protrusionMask, accentMask };
  }

  function scaleNearest(src,size){
    const c=makeCanvas(size,size);
    const ctx=c.getContext('2d', { willReadFrequently:true });
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,size,size);
    ctx.drawImage(src,0,0,src.width,src.height,0,0,size,size);
    return c;
  }

  function simplifyPixelCanvas(canvas){
    const w=canvas.width, h=canvas.height;
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const img=ctx.getImageData(0,0,w,h);
    const data=img.data;
    // 1px孤立ノイズ除去。ただし端点は残す。
    for(let y=1;y<h-1;y++){
      for(let x=1;x<w-1;x++){
        const i=y*w+x, p=i*4;
        if(data[p+3] < 10) continue;
        let cnt=0;
        for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) if((xx||yy) && data[((y+yy)*w+(x+xx))*4+3]>10) cnt++;
        const edgeZone = y > h*0.72 || x < w*0.18 || x > w*0.82;
        if(cnt<=1 && !edgeZone) data[p+3]=0;
      }
    }
    ctx.putImageData(img,0,0);
  }

  function drawPreview32(src,dst){
    if(!dst) return;
    const size=320;
    const ctx=clearCanvas(dst,size,size);
    ctx.fillStyle='#0b1220'; ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='rgba(148,163,184,0.18)';
    for(let i=0;i<=32;i++){
      const p=i*10+0.5;
      ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(size,p); ctx.stroke();
    }
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(src,0,0,src.width,src.height,0,0,size,size);
  }

  function drawCanvasInto(id, source, displayScale){
    const canvas=$(id);
    if(!canvas || !source) return;
    const ctx=clearCanvas(canvas, source.width, source.height);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(source,0,0);
    if(displayScale){
      canvas.style.width = (source.width*displayScale)+'px';
      canvas.style.height = (source.height*displayScale)+'px';
    }
  }

  function renderSummarySheet(cutout, source128, pixel128, pixel64, pixel32, stats){
    const c=$('cGameGroups'); if(!c) return;
    c.width=420; c.height=212;
    const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#e2e8f0'; ctx.font='bold 13px sans-serif';
    ctx.fillText('v1.14 source-guided summary', 12, 18);
    ctx.fillStyle='#94a3b8'; ctx.font='12px sans-serif';
    ctx.fillText('Cutout / Source128 / Pixel128 / Pixel64 / Pixel32', 12, 34);
    const thumbs=[cutout, source128, pixel128, pixel64, pixel32];
    const labels=['Cutout','Source128','Pixel128','Pixel64','Pixel32'];
    let x=12;
    for(let i=0;i<thumbs.length;i++){
      const t=thumbs[i];
      const box=72;
      // checker
      for(let yy=0;yy<box;yy+=8){
        for(let xx=0;xx<box;xx+=8){
          ctx.fillStyle=((xx/8+yy/8)&1)?'#1e293b':'#111827';
          ctx.fillRect(x+xx,48+yy,8,8);
        }
      }
      const fit=Math.min(box/t.width, box/t.height);
      const dw=Math.max(1,Math.round(t.width*fit));
      const dh=Math.max(1,Math.round(t.height*fit));
      ctx.drawImage(t,0,0,t.width,t.height,x+Math.round((box-dw)/2),48+Math.round((box-dh)/2),dw,dh);
      ctx.strokeStyle='#334155'; ctx.strokeRect(x,48,box,box);
      ctx.fillStyle='#cbd5e1'; ctx.fillText(labels[i], x, 134);
      x += 80;
    }
    const lines=[
      `bbox: ${stats.bbox.w}x${stats.bbox.h} @ (${stats.bbox.x},${stats.bbox.y})`,
      `bg rgb: ${stats.bg.color.map(v=>v|0).join(', ')}`,
      `palette colors: ${stats.palette.length}`,
      `rules: silhouette / flow / protrusion / accent / outline`,
      `areas: flow=${stats.flowPixels}, protrusion=${stats.protrusionPixels}, accent=${stats.accentPixels}`
    ];
    ctx.fillStyle='#cbd5e1';
    for(let i=0;i<lines.length;i++) ctx.fillText(lines[i], 12, 160 + i*14);
  }

  function saveCanvas(canvas, name){
    if(!canvas || !canvas.width || !canvas.height) return;
    const a=document.createElement('a');
    a.href=canvas.toDataURL('image/png');
    a.download=name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function saveSummaryComposite(){
    const source128=$('cSource128');
    const pixel128=$('cPixel128');
    const pixel64=$('cPixel64');
    const pixel32=$('cPixel32');
    const preview=$('cSpritePreview');
    if(!source128 || !pixel128 || !pixel64 || !pixel32) return;
    const c=makeCanvas(820, 560);
    const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#e2e8f0'; ctx.font='bold 16px sans-serif';
    ctx.fillText('Sprite Studio Pixel Pipeline v1.14', 20, 28);
    ctx.fillStyle='#94a3b8'; ctx.font='12px sans-serif';
    ctx.fillText('Source-guided renderer: background removal -> Source128 -> Pixel128 -> Pixel64 -> Pixel32', 20, 48);
    const cards=[
      ['Cutout', $('cCutout')], ['Source128', source128], ['Pixel128', pixel128], ['Pixel64', pixel64], ['Pixel32', pixel32]
    ];
    let x=20;
    for(const [label,cv] of cards){
      ctx.fillStyle='#111827'; ctx.fillRect(x,70,140,140);
      ctx.strokeStyle='#334155'; ctx.strokeRect(x,70,140,140);
      const fit=Math.min(124/cv.width, 124/cv.height);
      const dw=Math.max(1,Math.round(cv.width*fit));
      const dh=Math.max(1,Math.round(cv.height*fit));
      ctx.drawImage(cv,0,0,cv.width,cv.height,x+Math.round((140-dw)/2),70+Math.round((140-dh)/2),dw,dh);
      ctx.fillStyle='#cbd5e1'; ctx.fillText(label, x, 226);
      x += 155;
    }
    if(preview){
      ctx.fillStyle='#111827'; ctx.fillRect(20,260,320,320);
      ctx.strokeStyle='#334155'; ctx.strokeRect(20,260,320,320);
      ctx.drawImage(preview,0,0,320,320,20,260,320,320);
      ctx.fillStyle='#cbd5e1'; ctx.fillText('Pixel32 Preview', 20, 250);
    }
    const summary=$('cGameGroups');
    if(summary){
      ctx.drawImage(summary,360,260,420,212);
    }
    saveCanvas(c, 'sprite_summary_v114_sourceGuided.png');
  }

  async function renderV114(){
    const input=$('file');
    const file=input && input.files && input.files[0];
    if(!file){ setStatus('no image'); return; }
    try{
      setStatus('v1.14 rendering');
      const img=await loadImage(file);
      const src=canvasFromImage(img);
      drawOriginalPreview(src);

      const bg=sampleBackgroundModel(src.ctx, src.w, src.h);
      const bgMask=floodBackground(src.ctx, src.w, src.h, bg);
      const fgMask=makeForegroundMask(bgMask, src.w, src.h);
      let bbox=getBBox(fgMask, src.w, src.h);
      bbox=applyBBoxAdjustments(bbox, src.h);

      drawCutoutPreview(src, fgMask, bbox);
      drawGuides(src, bbox);

      const source128=buildSource128(src, fgMask, bbox);
      const kSel=($('k') && $('k').value) || 7;
      const pixel128Result=buildPixel128(source128, kSel);
      const pixel128=pixel128Result.canvas;
      const pixel64=scaleNearest(pixel128, 64);
      const pixel32=scaleNearest(pixel128, 32);
      simplifyPixelCanvas(pixel64);
      simplifyPixelCanvas(pixel32);

      drawCanvasInto('cSource128', source128, 1);
      drawCanvasInto('cPixel128', pixel128, 1);
      drawCanvasInto('cPixel64', pixel64, 2);
      drawCanvasInto('cPixel32', pixel32, 4);
      // 互換用: 既存スクリプト参照先にも反映
      drawCanvasInto('cSprite128', source128, 1);
      drawCanvasInto('cSprite64', pixel64, 1);
      drawCanvasInto('cSprite32', pixel32, 1);
      drawPreview32(pixel32, $('cSpritePreview'));

      const flowPixels = pixel128Result.flowMask.reduce((a,b)=>a+b,0);
      const protrusionPixels = pixel128Result.protrusionMask.reduce((a,b)=>a+b,0);
      const accentPixels = pixel128Result.accentMask.reduce((a,b)=>a+b,0);
      renderSummarySheet(buildCutoutCanvas(src, fgMask), source128, pixel128, pixel64, pixel32, {
        bbox, bg, palette:pixel128Result.palette, flowPixels, protrusionPixels, accentPixels
      });

      window.__V114_SPRITES__ = { source128, pixel128, pixel64, pixel32 };
      setStatus(VERSION);
      logPixel([
        `Sprite Output: ${VERSION}`,
        'mode: source-guided renderer',
        'rules:',
        '1. 外周接続背景だけを削除',
        '2. 主シルエットbboxを固定倍率で128へ配置',
        '3. 上部重要領域の可読性を保護',
        '4. 細長い外周連続領域を太い流れへ統合',
        '5. 小さな識別突起を保持',
        '6. 大面積領域を色面として整理',
        '7. 高コントラスト細部を点・短線化',
        '8. 外側へ広がる副シルエットを保持',
        '9. 端点(足先/持ち物/外周先端)を保持',
        '10. 透明境界/重要内部境界へ輪郭追加',
        `bg rgb=${bg.color.map(v=>v|0).join(', ')}, threshold noise=${bg.noise.toFixed(1)}`,
        `bbox=${bbox.x},${bbox.y},${bbox.w},${bbox.h}`,
        `palette=${pixel128Result.palette.map(c=>'['+c.map(v=>v|0).join(',')+']').join(' ')}`,
        `flowPixels=${flowPixels} protrusionPixels=${protrusionPixels} accentPixels=${accentPixels}`
      ]);
    }catch(err){
      console.error(err);
      setStatus('v1.14 error');
      logPixel(['v1.14 error', String(err && err.message || err)]);
    }
  }

  function hookSaveButtons(){
    const intercept=(id, fn)=>{
      const el=$(id);
      if(!el) return;
      el.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if(e.stopImmediatePropagation) e.stopImmediatePropagation();
        fn();
      }, true);
    };
    intercept('saveSource128', ()=> saveCanvas($('cSource128'), 'source128_v114.png'));
    intercept('savePixel128', ()=> saveCanvas($('cPixel128'), 'pixel128_v114.png'));
    intercept('savePixel64', ()=> saveCanvas($('cPixel64'), 'pixel64_v114.png'));
    intercept('savePixel32', ()=> saveCanvas($('cPixel32'), 'pixel32_v114.png'));
    intercept('saveSprite32', ()=> saveCanvas($('cPixel32'), 'pixel32_v114.png'));
    intercept('summary', saveSummaryComposite);
  }

  function patchLabels(){
    const h=$('spriteSectionTitle');
    if(h) h.textContent='12. Source-Guided Output 128 → 64 → 32';
    setLabel('labelSource128','Source128 元画像ベース 128x128');
    setLabel('labelPixel128','Pixel128 ドット絵化 128x128');
    setLabel('labelPixel64','Pixel64 中間段階');
    setLabel('labelPixel32','Pixel32 実寸');
    setLabel('labelPreview32','Pixel32 拡大プレビュー');
    setLabel('labelSummarySheet','解析サマリー');
  }

  function scheduleRender(){
    setTimeout(renderV114, 260);
    setTimeout(renderV114, 980);
    setTimeout(renderV114, 2100);
  }

  function boot(){
    patchLabels();
    hookSaveButtons();
    const run=$('run');
    if(run) run.addEventListener('click', scheduleRender);
    const file=$('file');
    if(file) file.addEventListener('change', ()=> setTimeout(renderV114, 220));
    ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle','k'].forEach(id=>{
      const el=$(id); if(el) el.addEventListener('input', ()=>{ if(file && file.files && file.files[0]) setTimeout(renderV114, 120); });
    });
    setStatus('v1.14 ready');
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
