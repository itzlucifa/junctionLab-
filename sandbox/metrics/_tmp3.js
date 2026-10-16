const L=c=>{const s=c/255;return s<=0.04047?s/12.92:Math.pow((s+0.055)/1.055,2.4)};
const lum=h=>{const f=h.replace('#','');return 0.2126*L(parseInt(f.slice(0,2),16))+0.7152*L(parseInt(f.slice(2,4),16))+0.0722*L(parseInt(f.slice(4,6),16))};
const r=(a,b)=>{const x=lum(a),y=lum(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
const bgs=['#1d2630','#161d25','#0e1319','#12181f','#0f151b'];
for(const c of ['#66798b','#8fa3b8','#7d8ea1','#9b5d66','#65707c','#3a7857','#89622f','#59676f','#4f9d72','#c2903f'])
  console.log(c, bgs.map(b=>`${b}:${r(c,b)}`).join('  '));
console.log('dangerText #ffd5d8 vs #3a1d22', r('#ffd5d8','#3a1d22'), '| border #9b5d66 vs #3a1d22', r('#9b5d66','#3a1d22'), '| border vs panel #161d25', r('#9b5d66','#161d25'));
console.log('hover #8fa3b8 vs rest #66798b (adjacent, 3:1 needed)', r('#8fa3b8','#66798b'));
console.log('blue focus #6cb6ff vs #66798b', r('#6cb6ff','#66798b'), '| #6cb6ff vs panel2', r('#6cb6ff','#1d2630'));
