// WCAG 2.x relative luminance + contrast ratio, computed for the real pairs in index.html.
// Run: node contrast.js
const L = c => { const s = c / 255; return s <= 0.04047 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
function lum(hex){
  hex = hex.trim();
  if(hex.startsWith('rgb')){ const m = hex.match(/[\d.]+/g).map(Number); return 0.2126*L(m[0])+0.7152*L(m[1])+0.0722*L(m[2]); }
  const h = hex.replace('#','');
  const f = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  const r = parseInt(f.slice(0,2),16), g = parseInt(f.slice(2,4),16), b = parseInt(f.slice(4,6),16);
  return 0.2126*L(r) + 0.7152*L(g) + 0.0722*L(b);
}
function ratio(fg,bg){ const a = lum(fg), b = lum(bg); const hi = Math.max(a,b), lo = Math.min(a,b); return (hi+0.05)/(lo+0.05); }
// alpha-composite fg over bg, both #rrggbb, fg alpha a
function over(fg, bg, a){
  const p = h => { const f = h.replace('#',''); return [parseInt(f.slice(0,2),16), parseInt(f.slice(2,4),16), parseInt(f.slice(4,6),16)]; };
  const [r1,g1,b1] = p(fg), [r2,g2,b2] = p(bg);
  const c = (x,y) => Math.round(x*a + y*(1-a));
  return '#' + [c(r1,r2),c(g1,g2),c(b1,b2)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const r2 = x => Math.round(x*100)/100;

// [label, fg, bg, need]  need = 4.5 normal text | 3 large text/UI-object | 0 informational
const P = [
  ['body --text on --bg',                '#eef2f6','#0e1319',4.5],
  ['--text on --panel',                  '#eef2f6','#161d25',4.5],
  ['--text on --panel2 (.btn,.kbd)',     '#eef2f6','#1d2630',4.5],
  ['--text on header top #141b23',       '#eef2f6','#141b23',4.5],
  ['--text on canvas bg #12181f',        '#eef2f6','#12181f',4.5],
  ['--text on .q .bar #0f151b',          '#eef2f6','#0f151b',4.5],
  ['--muted on --bg (brand p,note)',     '#a3b0bd','#0e1319',4.5],
  ['--muted on --panel (.note,.q,h2)',   '#a3b0bd','#161d25',4.5],
  ['--muted on --panel2 (.chip,.tile .k)','#a3b0bd','#1d2630',4.5],
  ['--muted on header #141b23',          '#a3b0bd','#141b23',4.5],
  ['.seg button --muted on --panel',     '#a3b0bd','#161d25',4.5],
  ['.btn.danger text on #3a1d22',        '#ffd5d8','#3a1d22',4.5],
  ['.btn.danger border on #3a1d22',      '#6a2c35','#3a1d22',3],
  ['.btn border --line on --panel2',     '#2c3743','#1d2630',3],
  ['.btn:hover border on --panel2',      '#41505f','#1d2630',3],
  ['pressed/primary #1a1405 on --amber', '#1a1405','#f5b83d',4.5],
  ['--amber on --panel (h2 small,hover)','#f5b83d','#161d25',4.5],
  ['--amber on --bg',                    '#f5b83d','#0e1319',4.5],
  ['--amber on header #141b23',          '#f5b83d','#141b23',4.5],
  ['--amber on --panel2',                '#f5b83d','#1d2630',4.5],
  ['--green on --panel',                 '#46e08c','#161d25',4.5],
  ['--green on --bg',                    '#46e08c','#0e1319',4.5],
  ['--red on --panel',                   '#ff6b6b','#161d25',4.5],
  ['--red on --bg',                      '#ff6b6b','#0e1319',4.5],
  ['--blue on --panel',                  '#6cb6ff','#161d25',4.5],
  ['--blue on --panel2',                 '#6cb6ff','#1d2630',4.5],
  ['--blue bar stripes on #0f151b',      '#6cb6ff','#0f151b',3],
  ['--blue bar stripe2 on #0f151b',      '#4a8fd0','#0f151b',3],
  ['.verdict --text on #13261d',         '#eef2f6','#13261d',4.5],
  ['.verdict.bad --text on #2a1d12',     '#eef2f6','#2a1d12',4.5],
  ['.verdict border #2c6a49 on #13261d', '#2c6a49','#13261d',3],
  ['.verdict.bad border #7a5320 on bg',  '#7a5320','#2a1d12',3],
  ['canvas GO label #3ddc84 on pill-bg', '#3ddc84', over('#080b0e','#12181f',0.85), 4.5],
  ['canvas WAIT label #ffbf3c on pill',  '#ffbf3c', over('#080b0e','#12181f',0.85), 4.5],
  ['canvas STOP label #ff6b6b on pill',  '#ff6b6b', over('#080b0e','#12181f',0.85), 4.5],
  ['canvas banner #ffffff on rgba(8,11,14,.9)','#ffffff', over('#080b0e','#12181f',0.9), 4.5],
  ['compass #dfe7ee on rgba(0,0,0,.45) over #26313b','#dfe7ee', over('#000000','#26313b',0.45), 4.5],
  ['compass #dfe7ee on rgba(0,0,0,.45) over #1b242d','#dfe7ee', over('#000000','#1b242d',0.45), 4.5],
  ['lamp unlit #1c242c on case #0b0f13', '#1c242c','#0b0f13',3],
  ['lamp ring #3a4651 on case #0b0f13',  '#3a4651','#0b0f13',3],
];

let fails = [];
console.log('pair | fg | bg | ratio | need | verdict');
for(const [label,fg,bg,need] of P){
  const r = ratio(fg,bg);
  const ok = r >= need;
  if(!ok) fails.push([label,fg,bg,r,need]);
  console.log(`${ok?'PASS':'FAIL'}  ${r2(r).toFixed?(r.toFixed(2)):r}  need ${need}  ${label}   [${fg} on ${bg}]  lum ${lum(fg).toFixed(4)}/${lum(bg).toFixed(4)}`);
}
console.log('\n--- FAILING PAIRS + PROPOSED REPLACEMENTS ---');
const C = { // candidates
  muted_bright:'#c2ccd8', muted_brighter:'#cfd8e3',
};
function best(fg,bg,need,deltas){ // search lightness up
  const p = h => { const f = h.replace('#',''); return [parseInt(f.slice(0,2),16),parseInt(f.slice(2,4),16),parseInt(f.slice(4,6),16)]; };
  for(const [dr,dg,db] of deltas){
    const [r,g,b] = p(fg).map((v,i)=>Math.min(255,Math.max(0,v+[dr,dg,db][i])));
    const c = '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(ratio(c,bg) >= need) return c;
  }
  return null;
}
for(const [label,fg,bg,r,need] of fails){
  console.log(`${label}: ${r.toFixed(2)} (< ${need})  fg=${fg} bg=${bg}`);
}

console.log('\n--- CANDIDATE FIXES, verified ---');
const tests = [
  ['--muted -> #c2ccd8 on --panel',   '#c2ccd8','#161d25',4.5],
  ['--muted -> #c2ccd8 on --panel2',  '#c2ccd8','#1d2630',4.5],
  ['--muted -> #c2ccd8 on --bg',      '#c2ccd8','#0e1319',4.5],
  ['--muted -> #c2ccd8 on header',    '#c2ccd8','#141b23',4.5],
  ['danger text -> #ffd5d8 on #4a2027','#ffd5d8','#4a2027',4.5],
  ['danger text -> #ffcdd2 on #3a1d22','#ffcdd2','#3a1d22',4.5],
  ['danger bg -> #4a2530 keep #ffd5d8','#ffd5d8','#4a2530',4.5],
  ['danger fg -> #e8b4bb on #3a1d22', '#e8b4bb','#3a1d22',4.5],
  ['danger border -> #a05160 on #3a1d22','#a05160','#3a1d22',3],
  ['line -> #46586a on --panel2',     '#46586a','#1d2630',3],
  ['green pill -> #58e39a on panel',  '#58e39a','#161d25',4.5],
  ['red pill -> #ff8585 on panel',    '#ff8585','#161d25',4.5],
  ['amber on panel2',                 '#f5b83d','#1d2630',4.5],
];
for(const [l,f,b,n] of tests){ const r = ratio(f,b); console.log(`${r>=n?'PASS':'FAIL'} ${r.toFixed(2)} need ${n}  ${l}`); }
