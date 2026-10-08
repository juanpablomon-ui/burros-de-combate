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
  return {capa, equidistancia, segmentos};
})();
if(typeof globalThis!=='undefined') globalThis.Curvas = Curvas;
