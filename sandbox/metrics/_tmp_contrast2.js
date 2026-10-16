const L = c => { const s = c / 255; return s <= 0.04047 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
function lum(hex){ const f = hex.replace('#',''); const r=parseInt(f.slice(0,2),16),g=parseInt(f.slice(2,4),16),b=parseInt(f.slice(4,6),16); return 0.2126*L(r)+0.7152*L(g)+0.0722*L(b); }
function ratio(fg,bg){ const a=lum(fg),b=lum(bg); const hi=Math.max(a,b),lo=Math.min(a,b); return (hi+0.05)/(lo+0.05); }
// smallest lightness step (same hue family, uniform additive lift) that clears `need` against every bg
function fix(fg, bgs, need, step = [1,1,1]){
  const p = h => { const f = h.replace('#',''); return [parseInt(f.slice(0,2),16),parseInt(f.slice(2,4),16),parseInt(f.slice(4,6),16)]; };
  const [r,g,b] = p(fg);
  for(let k = 0; k <= 255; k += 1){
    const c = '#' + [r,g,b].map((v,i)=>Math.min(255,Math.max(0,Math.round(v+step[i]*k)))).map(v=>v.toString(16).padStart(2,'0')).join('');
    if(bgs.every(bg => ratio(c,bg) >= need)) return {c, k, r:+ratio(c,bgs[0]).toFixed(2)};
  }
  return null;
}
const show = (l,f,b,n) => console.log(`${l}: ${ratio(f,b).toFixed(2)} (need ${n}) [${f} on ${b}] lum=${lum(f).toFixed(4)}/${lum(b).toFixed(4)}`);

console.log('=== minimum luminance needed for 3:1 against each surface ===');
for(const bg of ['#0e1319','#161d25','#1d2630','#141b23','#0f151b','#12181f','#3a1d22','#13261d','#2a1d12','#0b0f13'])
  console.log(`  bg ${bg} lum ${lum(bg).toFixed(4)} -> 3:1 needs fg lum >= ${(3*(lum(bg)+0.05)-0.05).toFixed(4)}   4.5:1 needs >= ${(4.5*(lum(bg)+0.05)-0.05).toFixed(4)}`);

console.log('\n=== candidates ===');
const cand = ['#3e4b58','#465462','#4a5764','#505e6c','#56626e','#5b6a78','#66798b','#6b7885','#7a8896'];
for(const c of cand){ show('line-vs-panel2', c, '#1d2630', 3); show('line-vs-panel', c, '#161d25', 3); show('line-vs-bg', c, '#0e1319', 3); }

console.log('\n=== auto-solved fixes ===');
console.log('control-boundary line (vs panel2+panel+bg, 3:1):', fix('#2c3743',['#1d2630','#161d25','#0e1319','#12181f'],3));
console.log('btn:hover border      (vs panel2, 3:1):        ', fix('#41505f',['#1d2630'],3));
console.log('danger border         (vs #3a1d22, 3:1):       ', fix('#6a2c35',['#3a1d22','#161d25'],3));
console.log('verdict good border   (vs #13261d+#161d25,3:1):', fix('#2c6a49',['#13261d'],3));
console.log('verdict bad border    (vs #2a1d12, 3:1):      ', fix('#7a5320',['#2a1d12'],3));
console.log('unlit lamp fill       (vs case #0b0f13, 3:1): ', fix('#1c242c',['#0b0f13'],1,[1,1,1]));
console.log('unlit lamp ring       (vs case #0b0f13, 3:1): ', fix('#3a4651',['#0b0f13'],1,[1,1,1]));

console.log('\n=== proposed final values, verified ===');
const P = [
  ['--line-ui #5b6a78', '#5b6a78', [['#1d2630',3],['#161d25',3],['#0e1319',3],['#12181f',3]]],
  ['--line-hair #465462', '#465462', [['#1d2630',1.5],['#161d25',1.5]]],
  ['danger border #b5636f', '#b5636f', [['#3a1d22',3]]],
  ['danger text #ffd5d8 on #3a1d22', '#ffd5d8', [['#3a1d22',4.5]]],
  ['verdict border #4f9d72', '#4f9d72', [['#13261d',3]]],
  ['verdict.bad border #c2903f', '#c2903f', [['#2a1d12',3]]],
  ['lamp unlit #59676f', '#59676f', [['#0b0f13',3]]],
  ['lamp ring unlit #7a8896', '#7a8896', [['#0b0f13',3]]],
  ['corridor fill #3ddc84 vs road #2a2f36', '#3ddc84', [['#2a2f36',3]]],
];
for(const [l,f,bs] of P) for(const [b,n] of bs) show(l, f, b, n);

console.log('\n=== chart palette (new, must pass 3:1 vs panel #161d25 and panel2 #1d2630) ===');
for(const c of ['#6cb6ff','#f5b83d','#46e08c','#ff6b6b','#b7a6d6','#56626e','#a3b0bd','#cfd8e3','#eef2f6'])
  console.log(`  ${c}: vs panel ${ratio(c,'#161d25').toFixed(2)}  vs panel2 ${ratio(c,'#1d2630').toFixed(2)}  vs chartbg#0f151b ${ratio(c,'#0f151b').toFixed(2)}`);
