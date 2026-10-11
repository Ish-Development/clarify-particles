var et=Object.defineProperty;var st=(l,s,e)=>s in l?et(l,s,{enumerable:!0,configurable:!0,writable:!0,value:e}):l[s]=e;var r=(l,s,e)=>st(l,typeof s!="symbol"?s+"":s,e);import{G as ot,O as it,B as at,I as nt,a as D,S as K,C as Q,P as rt,F as lt,b as U,V as ht,M as ct}from"./engine.js";import"./particles.js";const ft=[[2,4,1,3,5,2],[3,6,2,4,1,3],[1,3,5,2,4,2],[4,2,3,6,2,1],[2,5,1,3,4,3],[1,2,4,2,1,2]],Y={cube:()=>J(5,5,()=>5,.6),diamond:()=>N(7,(l,s,e)=>Math.abs(l-3)+Math.abs(s-3)+Math.abs(e-3)<=3,3/7),frame:()=>N(6,(l,s,e)=>[l,s,e].filter(i=>i<2||i>3).length>=2,.5),checker:()=>N(6,(l,s,e)=>(Math.floor(l/2)+Math.floor(s/2)+Math.floor(e/2))%2===0,.5),hub:()=>N(6,(l,s,e)=>{const i=[l,s,e].every(h=>h>=1&&h<=4),b=[l,s,e].filter(h=>h===2||h===3).length>=2;return i||b},.5),skyline:()=>J(6,6,(l,s)=>ft[l][s],.5,.6),cross:()=>N(6,(l,s,e)=>[l,s,e].filter(i=>i===2||i===3).length>=2,.5)};function J(l,s,e,i,b=i){const h=[];for(let a=0;a<l;a++)for(let M=0;M<s;M++)for(let n=0;n<e(a,M);n++)h.push([a,n,M]);return{cells:h,size:i,height:b}}function N(l,s,e){const i=[];for(let b=0;b<l;b++)for(let h=0;h<l;h++)for(let a=0;a<l;a++)s(b,h,a)&&i.push([b,h,a]);return{cells:i,size:e,height:e}}function ut({cells:l,size:s,height:e}){const i=new Set(l.map(y=>y.join(","))),b=(y,o,c)=>i.has(`${y},${o},${c}`),h=new Map,a=[],M=y=>{const o=y.join(",");let c=h.get(o);return c===void 0&&(c=a.length,h.set(o,c),a.push(y)),c},n=[],p=new Set;for(const[y,o,c]of l)for(let m=0;m<3;m++){const[d,u]=[(m+1)%3,(m+2)%3];for(const I of[0,1])for(const w of[0,1]){const B=[y,o,c];B[d]+=I,B[u]+=w;const v=[...B];v[m]+=1;const g=B.join(",")+"|"+m;if(p.has(g))continue;p.add(g);let S=0;for(const A of[-1,0])for(const P of[-1,0]){const t=[...B];t[d]+=A,t[u]+=P,b(t[0],t[1],t[2])&&S++}n.push([M(B),M(v),S<4])}}const F=[0,1,2].map(y=>Math.min(...a.map(o=>o[y]))),k=[0,1,2].map(y=>Math.max(...a.map(o=>o[y]))),C=a.map(y=>y.map((o,c)=>(o-(F[c]+k[c])/2)*(c===1?e:s))),x=new Array(a.length).fill(!1);for(const[y,o,c]of n)c&&(x[y]=x[o]=!0);return{pos:C,lines:n,outer:x}}const dt=`
  uniform float uPt;
  uniform vec2 uRes; // drawing buffer, px
  uniform float uWidth;
  uniform float uBlur; // px a line spreads at full speed
  attribute vec3 aA;
  attribute vec3 aB;
  attribute float aAlpha;
  attribute vec3 aBolt; // the bolt on it: head (0..1 from the end it enters by), brightness, entering at B (1) or A (0)
  attribute float aBlur; // 0 still .. 1 moving fast
  varying float vA;
  varying float vSide;
  varying float vHalf;
  varying float vSoft;
  varying float vX;
  varying vec3 vBolt;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
    vec2 d = (b.xy - a.xy) * uRes;
    float len = length(d);
    vec2 n = len > 1e-4 ? vec2(-d.y, d.x) / len : vec2(0.0, 1.0);
    // moving fast, a line spreads and softens (and dims, as much light
    // over more width)
    float spread = aBlur * uBlur;
    vHalf = uWidth * uPt * (0.5 + 0.4 * aBolt.y) + 0.5;
    vSoft = 1.0 + spread;
    vSide = position.y * (vHalf + spread + 0.5);
    vX = mix(position.x, 1.0 - position.x, aBolt.z);
    vBolt = aBolt;
    vec4 c = mix(a, b, position.x);
    c.xy += n * vSide / uRes * 2.0;
    gl_Position = c;
    vA = aAlpha / (1.0 + 1.5 * aBlur);
  }
`,pt=`
  uniform vec3 uColor;
  varying float vA;
  varying float vSide;
  varying float vHalf;
  varying float vSoft;
  varying float vX;
  varying vec3 vBolt;
  void main() {
    // lit behind the head, brightest at it
    float lit = step(vX, vBolt.x) * vBolt.y * (0.45 + 0.55 * smoothstep(vBolt.x - 0.5, vBolt.x, vX));
    float a = clamp((vHalf + 0.5 * (vSoft - 1.0) - abs(vSide)) / vSoft, 0.0, 1.0) * min(1.0, vA + lit);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`,mt=`
  uniform float uSize;
  uniform float uBlur;
  attribute float aAlpha;
  attribute float aFlash;
  attribute float aBlur;
  varying float vA;
  varying float vSize;
  varying float vSoft;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vSize = uSize * (1.0 + 0.9 * aFlash) + aBlur * uBlur;
    vSoft = 1.0 + 0.5 * aBlur * uBlur;
    gl_PointSize = vSize + vSoft;
    vA = min(1.0, aAlpha + aFlash) / (1.0 + 1.5 * aBlur);
  }
`,vt=`
  uniform vec3 uColor;
  varying float vA;
  varying float vSize;
  varying float vSoft;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + vSoft);
    float a = clamp((vSize * 0.5 - r) / vSoft + 0.5, 0.0, 1.0) * vA;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`,bt=l=>l*l*l*(l*(l*6-15)+10);function yt(l,s){const e=1.70158*s*1.525;return l<.5?(2*l)**2*((e+1)*2*l-e)/2:((2*l-2)**2*((e+1)*(l*2-2)+e)+2)/2}const _=l=>Math.min(1,Math.max(0,l));class gt{constructor(s){r(this,"root",new ot);r(this,"camera",new it(-1,1,1,-1,.1,100));r(this,"cfg");r(this,"places",[]);r(this,"real",[]);r(this,"lines",[]);r(this,"n");r(this,"delay");r(this,"swirl");r(this,"hit");r(this,"boltIn");r(this,"boltOut");r(this,"boltFromB");r(this,"boltClock",-1/0);r(this,"now");r(this,"nodeGeo",new at);r(this,"lineGeo",new nt);r(this,"nodeMat");r(this,"lineMat");r(this,"nodePos");r(this,"nodeAlpha");r(this,"nodeFlash");r(this,"lineA");r(this,"lineB");r(this,"lineAlpha");r(this,"lineBolt");r(this,"radius");r(this,"reach",{x:0,y:0});r(this,"cssH",1);r(this,"half",1);r(this,"prevScreen",null);r(this,"blur");r(this,"trail",null);r(this,"nodeBlur");r(this,"lineBlurAttr");r(this,"shape",0);r(this,"from",0);r(this,"clock",0);r(this,"morphing",!1);r(this,"turn",.25);r(this,"aspect",1);r(this,"reduced",!1);this.cfg=s;const e=s.shapes.split(",").map(o=>o.trim()).filter(o=>Y[o]),i=(e.length?e:["cube"]).map(o=>ut(Y[o]())),b=o=>{let c=1/0,m=0;for(let d=0;d<12;d++){const u=Math.cos(d*Math.PI/6),I=Math.sin(d*Math.PI/6);let w=1/0,B=-1/0;for(const[v,g,S]of o){const A=2*g-(v*u+S*I)-(-v*I+S*u);w=Math.min(w,A),B=Math.max(B,A)}c=Math.min(c,B-w),m+=(B+w)/24}return{tall:c,mid:m,wide:Math.max(...o.map(([d,,u])=>Math.hypot(d,u)))}},h=b(i[0].pos);i.forEach(o=>{const c=b(o.pos),m=Math.min(h.tall/c.tall,h.wide*1.25/c.wide);for(const d of o.pos){for(let u=0;u<3;u++)d[u]*=m;d[1]-=c.mid*m/2}});const a=this.n=Math.max(...i.map(o=>o.pos.length)),M=Math.random;let n=null;const p=new Map;i.forEach((o,c)=>{const m=o.pos.length,d=o.pos.map((v,g)=>({p:v,real:!0,id:g}));for(;d.length<a;){const v=Math.floor(M()*m);d.push({p:o.pos[v],real:!1,id:-1})}const u=new Array(a);if(!n)d.forEach((v,g)=>u[g]=v);else{const v=new Set(d.map((S,A)=>A)),g=Array.from({length:a},(S,A)=>A).sort(()=>M()-.5);for(const S of[!0,!1])for(const A of g){if(u[A])continue;let P=-1,t=1/0;for(const f of v){if(d[f].real!==S)continue;const z=(d[f].p[0]-n[A][0])**2+(d[f].p[1]-n[A][1])**2+(d[f].p[2]-n[A][2])**2;z<t&&(t=z,P=f)}P<0||(u[A]=d[P],v.delete(P))}}const I=new Float32Array(a*3),w=new Float32Array(a),B=new Map;u.forEach((v,g)=>{I.set(v.p,g*3),w[g]=v.real?o.outer[v.id]?1:s.inner:0,v.real&&B.set(v.id,g)}),this.places.push(I),this.real.push(w);for(const[v,g,S]of o.lines){const A=B.get(v),P=B.get(g),t=A<P?`${A},${P}`:`${P},${A}`;let f=p.get(t);f||p.set(t,f=new Float32Array(i.length)),f[c]=S?1:s.inner}n=u.map(v=>v.p)});for(const[o,c]of p){const[m,d]=o.split(",").map(Number);this.lines.push({a:m,b:d,in:c})}this.radius=Math.max(...this.places.map(o=>Math.max(...Array.from({length:a},(c,m)=>Math.hypot(o[m*3],o[m*3+1],o[m*3+2])))));for(const o of this.places)for(let c=0;c<24;c++){const m=Math.cos(c*Math.PI/12),d=Math.sin(c*Math.PI/12);for(let u=0;u<a;u++){const I=o[u*3]*m+o[u*3+2]*d,w=-o[u*3]*d+o[u*3+2]*m;this.reach.x=Math.max(this.reach.x,Math.abs(I-w)/Math.SQRT2),this.reach.y=Math.max(this.reach.y,Math.abs(2*o[u*3+1]-I-w)/Math.sqrt(6))}}this.delay=new Float32Array(a),this.swirl=Float32Array.from({length:a},()=>.6+.4*M()),this.hit=new Float32Array(a).fill(1/0);const F=this.lines.length;this.boltIn=new Float32Array(F).fill(1/0),this.boltOut=new Float32Array(F).fill(1/0),this.boltFromB=new Uint8Array(F),this.now=new Float32Array(this.places[0]),this.nodePos=new D(new Float32Array(a*3),3),this.nodeAlpha=new D(new Float32Array(a),1),this.nodeGeo.setAttribute("position",this.nodePos),this.nodeGeo.setAttribute("aAlpha",this.nodeAlpha),this.nodeFlash=new D(new Float32Array(a),1),this.nodeGeo.setAttribute("aFlash",this.nodeFlash),this.blur=new Float32Array(a),this.nodeBlur=new D(new Float32Array(a),1),this.nodeGeo.setAttribute("aBlur",this.nodeBlur),this.nodeMat=new K({uniforms:{uColor:{value:new Q(s.color)},uSize:{value:s.nodeSize},uBlur:{value:s.blur}},vertexShader:mt,fragmentShader:vt,transparent:!0,depthWrite:!1,depthTest:!1,toneMapped:!1});const k=new rt(this.nodeGeo,this.nodeMat);k.frustumCulled=!1,k.renderOrder=2;const C=this.lines.length+a,x=this.lineGeo;x.setAttribute("position",new lt([0,-1,0,1,-1,0,1,1,0,0,1,0],3)),x.setIndex([0,1,2,0,2,3]),this.lineA=new U(new Float32Array(C*3),3),this.lineB=new U(new Float32Array(C*3),3),this.lineAlpha=new U(new Float32Array(C),1),x.setAttribute("aA",this.lineA),x.setAttribute("aB",this.lineB),x.setAttribute("aAlpha",this.lineAlpha),this.lineBolt=new U(new Float32Array(C*3),3),x.setAttribute("aBolt",this.lineBolt),this.lineBlurAttr=new U(new Float32Array(C),1),x.setAttribute("aBlur",this.lineBlurAttr),x.instanceCount=C,this.lineMat=new K({uniforms:{uColor:{value:new Q(s.color)},uPt:{value:1},uRes:{value:new ht(1,1)},uWidth:{value:s.lineWidth},uBlur:{value:s.blur}},vertexShader:dt,fragmentShader:pt,transparent:!0,depthWrite:!1,depthTest:!1,toneMapped:!1});const y=new ct(x,this.lineMat);y.frustumCulled=!1,y.renderOrder=1,this.root.add(y,k),this.draw()}setReducedMotion(s){this.reduced=s,s&&(this.shape=this.from=0,this.morphing=!1,this.now.set(this.places[0]),this.draw())}setSize(s,e,i){this.aspect=s/e,this.cssH=e,this.lineMat.uniforms.uPt.value=i,this.lineMat.uniforms.uRes.value.set(s*i,e*i),this.lineMat.uniforms.uBlur.value=this.cfg.blur*i,this.nodeMat.uniforms.uSize.value=this.cfg.nodeSize*i,this.nodeMat.uniforms.uBlur.value=this.cfg.blur*i,this.frame()}startMorph(){const s=this.cfg;this.from=this.shape,this.shape=(this.shape+1)%this.places.length;const e=this.places[this.shape];let i=1/0,b=-1/0;for(let h=0;h<this.n;h++)i=Math.min(i,e[h*3+1]),b=Math.max(b,e[h*3+1]);for(let h=0;h<this.n;h++){const a=b>i?(e[h*3+1]-i)/(b-i):0;this.delay[h]=s.stagger*(.7*a+.3*Math.random())}this.morphing=!0,this.clock=0}strike(){const s=this.cfg,e=this.shape,i=this.places[e],b=this.real[e],h=Array.from({length:this.n},()=>[]);this.lines.forEach((n,p)=>{n.in[e]&&(h[n.a].push([n.b,p]),h[n.b].push([n.a,p]))});let a=-1;for(let n=0;n<this.n;n++)b[n]&&(a<0||i[n*3+1]>i[a*3+1]+1e-6||Math.abs(i[n*3+1]-i[a*3+1])<1e-6&&Math.random()<.5)&&(a=n);if(this.hit.fill(1/0),this.boltIn.fill(1/0),this.boltOut.fill(1/0),a<0)return;this.hit[a]=0;const M=new Uint8Array(this.n);for(;;){let n=-1;for(let p=0;p<this.n;p++)!M[p]&&this.hit[p]<1/0&&(n<0||this.hit[p]<this.hit[n])&&(n=p);if(n<0)break;M[n]=1;for(const[p,F]of h[n]){const k=this.hit[n]+s.boltStep*(.4+1.2*Math.random());k<this.hit[p]&&(this.hit[p]=k,this.boltIn[F]=this.hit[n],this.boltOut[F]=k,this.boltFromB[F]=this.lines[F].b===n?1:0)}}this.lines.forEach((n,p)=>{if(this.boltOut[p]===1/0)return;const F=this.boltFromB[p]?n.a:n.b;this.hit[F]!==this.boltOut[p]&&(this.boltIn[p]=this.boltOut[p]=1/0)}),this.boltClock=0}progress(s){return this.morphing?_((this.clock-this.delay[s])/this.cfg.morphTime):1}draw(s=0){const e=this.cfg,i=this.n,b=this.cssH/(2*this.half),h=this.prevScreen??(this.prevScreen=new Float32Array(i*2).fill(NaN)),a=this.nodeBlur.array,M=this.places[this.from],n=this.places[this.shape],p=this.real[this.from],F=this.real[this.shape],k=Math.cos(this.turn),C=Math.sin(this.turn),x=this.nodePos.array,y=this.nodeAlpha.array,o=new Float32Array(i),c=new Float32Array(i),m=new Float32Array(i),d=this.nodeFlash.array,u=this.boltClock;for(let t=0;t<i;t++){const f=this.progress(t),z=o[t]=bt(f),G=yt(f,e.overshoot),E=Math.sin(Math.PI*f),O=1+e.burst*E;let R=(M[t*3]+(n[t*3]-M[t*3])*G)*O;const Z=(M[t*3+1]+(n[t*3+1]-M[t*3+1])*G)*O;let j=(M[t*3+2]+(n[t*3+2]-M[t*3+2])*G)*O;if(E>0){const V=e.swirl*E*this.swirl[t],$=Math.cos(V),L=Math.sin(V);[R,j]=[R*$+j*L,-R*L+j*$]}const H=R*k+j*C,W=Z,T=-R*C+j*k,X=(H-T)/Math.SQRT2,q=(2*W-H-T)/Math.sqrt(6);if(s>0&&h[t*2]===h[t*2]){const V=Math.hypot(X-h[t*2],q-h[t*2+1])*b/s,$=_(V/e.blurSpeed);this.blur[t]+=($-this.blur[t])*Math.min(1,s*14)}h[t*2]=X,h[t*2+1]=q,a[t]=this.blur[t],d[t]=u>=this.hit[t]?e.boltGain*Math.exp(-(u-this.hit[t])/e.boltFade):0,x[t*3]=this.now[t*3]=H,x[t*3+1]=this.now[t*3+1]=W,x[t*3+2]=this.now[t*3+2]=T,c[t]=_(((H+W+T)/Math.sqrt(3)/this.radius+1)/2);const tt=p[t]+(F[t]-p[t])*z;m[t]=tt*(e.backDim+(1-e.backDim)*c[t]),y[t]=e.nodeOpacity*m[t]}this.nodePos.needsUpdate=!0,this.nodeAlpha.needsUpdate=!0,this.nodeFlash.needsUpdate=!0,this.nodeBlur.needsUpdate=!0;const I=this.lineBlurAttr.array,w=this.lineBolt.array,B=this.lineA.array,v=this.lineB.array,g=this.lineAlpha.array;this.lines.forEach((t,f)=>{B.set(this.now.subarray(t.a*3,t.a*3+3),f*3),v.set(this.now.subarray(t.b*3,t.b*3+3),f*3);const z=(o[t.a]+o[t.b])/2,G=t.in[this.from]+(t.in[this.shape]-t.in[this.from])*z;g[f]=e.lineOpacity*G*(e.backDim+(1-e.backDim)*(c[t.a]+c[t.b])/2),I[f]=(this.blur[t.a]+this.blur[t.b])/2;const E=this.boltIn[f],O=this.boltOut[f];u>=E?(w[f*3]=_((u-E)/Math.max(.001,O-E)),w[f*3+1]=e.boltGain*Math.exp(-Math.max(0,u-O)/e.boltFade),w[f*3+2]=this.boltFromB[f]):w[f*3+1]=0});const S=this.trail??(this.trail=new Float32Array(this.now)),A=s>0&&e.streak>0?1-Math.exp(-s/e.streak):1,P=this.lines.length;for(let t=0;t<i;t++){for(let G=0;G<3;G++)S[t*3+G]+=(this.now[t*3+G]-S[t*3+G])*A;const f=P+t;B.set(S.subarray(t*3,t*3+3),f*3),v.set(this.now.subarray(t*3,t*3+3),f*3),g[f]=0;const z=Math.hypot(this.now[t*3]-S[t*3],this.now[t*3+1]-S[t*3+1],this.now[t*3+2]-S[t*3+2])*b;w[f*3]=1,w[f*3+1]=e.streakGain*m[t]*_(z/16),w[f*3+2]=0,I[f]=this.blur[t]}this.lineBolt.needsUpdate=!0,this.lineA.needsUpdate=!0,this.lineB.needsUpdate=!0,this.lineAlpha.needsUpdate=!0,this.lineBlurAttr.needsUpdate=!0}update(s){if(this.reduced)return!1;const e=this.cfg;this.clock+=s,this.boltClock+=s;const i=e.stagger+e.morphTime,b=this.morphing?e.spinKick*Math.sin(Math.PI*_(this.clock/i)):0;return this.turn+=s*e.turnSpeed*(1+b),this.morphing?this.clock>=i&&(this.morphing=!1,this.from=this.shape,this.clock=0,this.strike()):this.places.length>1&&this.clock>=e.holdTime&&this.startMorph(),this.draw(s),!0}frame(){const s=this.half=Math.max(this.reach.y,this.reach.x/this.aspect)/this.cfg.zoom,e=this.camera;e.left=-s*this.aspect,e.right=s*this.aspect,e.top=s,e.bottom=-s,e.updateProjectionMatrix(),e.position.set(20,20,20),e.lookAt(0,0,0)}dispose(){this.nodeGeo.dispose(),this.lineGeo.dispose(),this.nodeMat.dispose(),this.lineMat.dispose(),this.root.removeFromParent()}}export{gt as BlocksScene};
