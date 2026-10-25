/* BURROS DE COMBATE — curvas de nivel sobre cualquier capa (satélite, calles, carta propia).
   Se calculan en el teléfono a partir del modelo digital de terreno (teselas Terrarium, SRTM ~30 m; las mismas de la cota automática):
   cuadrícula de cotas suavizada (2×2) → «marching squares» con interpolación lineal → líneas en un lienzo por tesela.
   Equidistancia según la escala: 100 m (zoom ≤ 11), 50 m (12), 25 m (13), 20 m (14), 10 m (15 y más).
   Cada 5 curvas, una curva maestra más gruesa con su cota. Necesita internet la primera vez (las teselas vistas quedan guardadas). */
const Curvas = (function(){
  const URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  const memo = new Map();
  const equidistancia = z=>z<=11 ? 100 : z===12 ? 50 : z===13 ? 25 : z===14 ? 20 : 10;

  // cotas de una tesela Terrarium (256×256) → cuadrícula promediada de 129×129 (bordes compartidos para que las curvas calcen)
  function cotas(z, x, y){
    const k = z + '/' + x + '/' + y; if(memo.has(k)) return memo.get(k);
    const p = new Promise(res=>{
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = ()=>{ try {
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, 256, 256).data, h = new Float32Array(65536);
        for(let i=0; i<65536; i++) h[i] = d[i*4]*256 + d[i*4 + 1] + d[i*4 + 2]/256 - 32768;
        const N = 129, r = new Float32Array(N*N);
        for(let j=0; j<N; j++) for(let i=0; i<N; i++){
          const x0 = Math.min(255, i*2), y0 = Math.min(255, j*2), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1);
          r[j*N + i] = (h[y0*256 + x0] + h[y0*256 + x1] + h[y1*256 + x0] + h[y1*256 + x1])/4;
        }
        res(r); } catch(e){ res(null); } };
      img.onerror = ()=>res(null);
      img.src = URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    });
    memo.set(k, p); if(memo.size>400) memo.delete(memo.keys().next().value);
    return p;
  }

  // marching squares: segmentos de la curva de cota «v» en la cuadrícula (coordenadas en celdas)
  function segmentos(r, N, v){
    const out = [];
    for(let j=0; j<N - 1; j++) for(let i=0; i<N - 1; i++){
      const a = r[j*N + i], b = r[j*N + i + 1], c = r[(j + 1)*N + i + 1], d = r[(j + 1)*N + i];
      const k = (a>=v ? 8 : 0) | (b>=v ? 4 : 0) | (c>=v ? 2 : 0) | (d>=v ? 1 : 0); if(k===0 || k===15) continue;
      const t = (p, q)=>(v - p)/(q - p || 1e-9);
      const T = [i + t(a, b), j], R = [i + 1, j + t(b, c)], B = [i + t(d, c), j + 1], Lf = [i, j + t(a, d)];
      switch(k){
        case 1: case 14: out.push([Lf, B]); break;
        case 2: case 13: out.push([B, R]); break;
        case 3: case 12: out.push([Lf, R]); break;
        case 4: case 11: out.push([T, R]); break;
        case 6: case 9: out.push([T, B]); break;
        case 7: case 8: out.push([Lf, T]); break;
        case 5: out.push([Lf, T], [B, R]); break;
        case 10: out.push([T, R], [Lf, B]); break;
      }
    }
    return out;
  }

  // capa de Leaflet: color oscuro sobre mapas claros, claro sobre satélite
  function capa(op){
    op = Object.assign({claro:false}, op || {});
    const Capa = L.GridLayer.extend({
      createTile(co, hecho){
        const t = document.createElement('canvas'); t.width = t.height = 256;
        const z = co.z;
        if(z<10){ setTimeout(()=>hecho(null, t), 0); return t; }
        cotas(z, co.x, co.y).then(r=>{
          if(!r){ hecho(null, t); return; }
          const g = t.getContext('2d'), N = 129, s = 256/(N - 1), eq = equidistancia(z);
          let mn = Infinity, mx = -Infinity; for(let i=0; i<r.length; i++){ if(r[i]<mn) mn = r[i]; if(r[i]>mx) mx = r[i]; }
          const color = op.claro ? '255,226,150' : '120,70,20', halo = op.claro ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.85)';
          g.lineJoin = g.lineCap = 'round';
          const rotulos = [];
          for(let v = Math.ceil(mn/eq)*eq; v<=mx; v += eq){
            const maestra = Math.round(v/eq)%5===0, segs = segmentos(r, N, v); if(!segs.length) continue;
            g.strokeStyle = `rgba(${color},${maestra ? .95 : .45})`; g.lineWidth = maestra ? 1.8 : .9;
            g.beginPath(); segs.forEach(([a, b])=>{ g.moveTo(a[0]*s, a[1]*s); g.lineTo(b[0]*s, b[1]*s); }); g.stroke();
            if(maestra){ // cota sobre el segmento más cercano al centro de la tesela
              let mej = null, dm = Infinity; segs.forEach(([a, b])=>{ const mx2 = (a[0] + b[0])/2*s, my2 = (a[1] + b[1])/2*s, d = Math.hypot(mx2 - 128, my2 - 128); if(d<dm){ dm = d; mej = [mx2, my2, Math.atan2((b[1] - a[1]), (b[0] - a[0]))]; } });
              if(mej && mej[0]>20 && mej[0]<236 && mej[1]>12 && mej[1]<244) rotulos.push([mej, v]);
            }
          }
          g.font = 'bold 10px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
          rotulos.forEach(([[x, y, ang], v])=>{ let a = ang; if(a>Math.PI/2) a -= Math.PI; if(a< -Math.PI/2) a += Math.PI;
            g.save(); g.translate(x, y); g.rotate(a); g.lineWidth = 3; g.strokeStyle = halo; g.strokeText(String(Math.round(v)), 0, 0);
            g.fillStyle = `rgb(${color})`; g.fillText(String(Math.round(v)), 0, 0); g.restore(); });
          hecho(null, t);
        });
        return t;
      }
    });
    return new Capa({maxNativeZoom:15, maxZoom:20, minZoom:10, opacity:1, pane:op.pane || 'overlayPane', zIndex:5});
  }
  /* relieve sombreado (v0.99.38, edición tienda; maqueta aprobada): luz desde el noroeste (azimut 315°, 45° de altura) sobre la misma
     cuadrícula de cotas; las laderas en sombra se oscurecen y las que dan a la luz quedan casi transparentes */
  function relieve(op){
    op = Object.assign({}, op || {});
    const az = 315*Math.PI/180, alt = 45*Math.PI/180, zen = Math.PI/2 - alt;
    const Capa = L.GridLayer.extend({
      createTile(co, hecho){
        const t = document.createElement('canvas'), N = 129; t.width = t.height = 256;
        if(co.z<10){ setTimeout(()=>hecho(null, t), 0); return t; }
        // la tesela y sus cuatro vecinas: en el borde la pendiente se calcula con la cota del lado (si no, se nota la costura entre teselas)
        const n = Math.pow(2, co.z), xv = k=>((co.x + k)%n + n)%n, M = N - 2, C = M + 1;
        Promise.all([cotas(co.z, co.x, co.y), cotas(co.z, xv(-1), co.y), cotas(co.z, xv(1), co.y), co.y>0 ? cotas(co.z, co.x, co.y - 1) : null, co.y<n - 1 ? cotas(co.z, co.x, co.y + 1) : null]).then(([r, iz, de, ar, ab])=>{
          if(!r){ hecho(null, t); return; }
          const lat = Math.atan(Math.sinh(Math.PI*(1 - 2*(co.y + .5)/n))), celda = 40075016*Math.cos(lat)/n/(N - 1);
          // cota de la celda (i, j) (0 a M = 127; la fila y columna 128 repiten el borde de la imagen: no se usan); fuera, la de la vecina
          const cl = v=>Math.max(0, Math.min(M, v));
          const h = (i, j)=>{ if(i<0) return iz ? iz[cl(j)*N + C + i] : r[cl(j)*N]; if(i>M) return de ? de[cl(j)*N + i - C] : r[cl(j)*N + M];
            if(j<0) return ar ? ar[(C + j)*N + i] : r[i]; if(j>M) return ab ? ab[(j - C)*N + i] : r[M*N + i]; return r[j*N + i]; };
          // sombra en cada celda de −1 a 128 (con las vecinas) y luego a 256×256 con interpolación bilineal: sin bordes en la tesela
          const W = C + 2, S = new Float32Array(W*W);
          for(let j=-1; j<=C; j++) for(let i=-1; i<=C; i++){
            const dzdx = (h(i + 1, j) - h(i - 1, j))/(2*celda), dzdy = (h(i, j + 1) - h(i, j - 1))/(2*celda);
            const pend = Math.atan(1.5*Math.hypot(dzdx, dzdy)), asp = Math.atan2(dzdy, -dzdx);
            const luz = Math.cos(zen)*Math.cos(pend) + Math.sin(zen)*Math.sin(pend)*Math.cos(az - asp);   // 1 = de frente a la luz
            S[(j + 1)*W + i + 1] = Math.max(0, Math.min(1, (0.85 - luz)*1.4));
          }
          const g = t.getContext('2d'), img = g.createImageData(256, 256), d = img.data;
          for(let py=0; py<256; py++){ const cy = py/2 - .25 + 1, y0 = Math.floor(cy), fy = cy - y0;
            for(let px=0; px<256; px++){ const cx = px/2 - .25 + 1, x0 = Math.floor(cx), fx = cx - x0, a0 = y0*W + x0;
              const v = (S[a0]*(1 - fx) + S[a0 + 1]*fx)*(1 - fy) + (S[a0 + W]*(1 - fx) + S[a0 + W + 1]*fx)*fy, k = (py*256 + px)*4;
              d[k] = d[k + 1] = d[k + 2] = 20; d[k + 3] = Math.round(v*130); } }
          g.putImageData(img, 0, 0); hecho(null, t);
        });
        return t;
      }
    });
    return new Capa({tileSize:256, maxNativeZoom:15, maxZoom:20, minZoom:10, pane:op.pane || 'overlayPane', zIndex:4, className:'relieve'});
  }
  return {capa, relieve, equidistancia, segmentos};
})();
if(typeof globalThis!=='undefined') globalThis.Curvas = Curvas;
