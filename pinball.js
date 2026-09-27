/* Standalone planar pinball simulation. All speeds and geometry are in table units. */
(function(){
const W=600,H=980,R=10,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rails=[[45,160,80,60],[80,60,520,60],[520,60,555,160],[45,160,45,740],[555,160,555,740],[45,740,60,850],[60,850,60,940],[555,740,540,850],[540,850,540,940],[100,690,165,755],[165,755,115,800],[115,800,100,690],[500,690,435,755],[435,755,485,800],[485,800,500,690],[100,190,120,310],[500,190,480,310]];
const bumpers=[{x:210,y:245,r:32},{x:390,y:245,r:32},{x:300,y:360,r:37},{x:170,y:485,r:26},{x:430,y:485,r:26},{x:300,y:595,r:43}];
window.createPinballGame=({roundFace})=>{
let balls=[],random=Math.random,time=0,launched=false,effects=[],winner=null,activeCount=0;
const flippers=[{x:145,y:865,angle:.38,side:1,pulse:0},{x:455,y:865,angle:Math.PI-.38,side:-1,pulse:0}];
function reset(marbles,rng){random=rng;time=0;launched=false;effects=[];winner=null;activeCount=marbles.length;
 const order=marbles.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 balls=order.map((source,i)=>({source,x:85+(i%20)*22,y:640-Math.floor(i/20)*22,vx:0,vy:0,r:R,alive:true,cool:0}));
 flippers.forEach(f=>{f.pulse=0;f.angle=f.side===1?.38:Math.PI-.38;});
}
function command(text){if(text!=='!왼'&&text!=='!오')return false;const f=flippers[text==='!왼'?0:1];f.pulse=Math.min(.32,f.pulse+.18);return true;}
function spark(x,y,color){for(let i=0;i<7;i++){const a=random()*Math.PI*2;effects.push({x,y,vx:Math.cos(a)*100,vy:Math.sin(a)*100,life:.4,color});}if(effects.length>240)effects.splice(0,effects.length-240);}
function segment(b,x1,y1,x2,y2,radius=5,kick=0,side=0){const dx=x2-x1,dy=y2-y1,len=dx*dx+dy*dy,t=clamp(((b.x-x1)*dx+(b.y-y1)*dy)/len,0,1),px=x1+t*dx,py=y1+t*dy;let nx=b.x-px,ny=b.y-py,d=Math.hypot(nx,ny),min=b.r+radius;if(d>=min)return; if(d<.0001){nx=-dy;ny=dx;d=Math.hypot(nx,ny);}nx/=d;ny/=d;b.x=px+nx*(min+.1);b.y=py+ny*(min+.1);const dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=1.72*dot*nx;b.vy-=1.72*dot*ny;}if(kick&&b.y<py+8&&b.cool<=0){b.vy=-Math.max(730,Math.abs(b.vy));b.vx+=side*(130+220*t);b.cool=.1;spark(b.x,b.y,'#8fffe0');}}
function update(dt){if(winner)return[];if(!launched){launched=true;for(const b of balls){b.vx=(random()-.5)*350;b.vy=-600-random()*240;}}
 const deaths=[];const count=Math.ceil(dt/(1/180)),h=dt/count;
 for(let step=0;step<count;step++){time+=h;for(const f of flippers){f.pulse=Math.max(0,f.pulse-h);const target=f.side===1?(f.pulse>0?-.55:.38):(f.pulse>0?Math.PI+.55:Math.PI-.38);f.angle+=(target-f.angle)*Math.min(1,h*35);}
 const falling=[];
 for(const b of balls){if(!b.alive)continue;b.cool=Math.max(0,b.cool-h);b.vy+=(310+Math.min(180,time*1.4))*h;b.vx*=Math.exp(-.018*h);b.vy*=Math.exp(-.018*h);b.x+=b.vx*h;b.y+=b.vy*h;
 for(const rail of rails)segment(b,...rail);
 for(const p of bumpers){let dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy),min=p.r+b.r;if(d<min){if(d<.001){dx=1;dy=0;d=1;}const nx=dx/d,ny=dy/d;b.x=p.x+nx*(min+.2);b.y=p.y+ny*(min+.2);const dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=2*dot*nx;b.vy-=2*dot*ny;}b.vx+=nx*140;b.vy+=ny*140;if(b.cool<=0){spark(b.x,b.y,'#ffc875');b.cool=.08;}}}
 for(const f of flippers)segment(b,f.x,f.y,f.x+Math.cos(f.angle)*124,f.y+Math.sin(f.angle)*124,10,f.pulse>0?1:0,f.side);
 const speed=Math.hypot(b.vx,b.vy);if(speed>1100){b.vx*=1100/speed;b.vy*=1100/speed;}
 if(b.y>H+20)falling.push(b);
 // Keep escaped high-speed balls within the closed side walls until the drain.
 if(b.y<740){if(b.x<55){b.x=55;b.vx=Math.abs(b.vx);}if(b.x>545){b.x=545;b.vx=-Math.abs(b.vx);}if(b.y<70){b.y=70;b.vy=Math.abs(b.vy);}}
 }
 // Spatial buckets keep marble contacts affordable with hundreds of entrants.
 const grid=new Map();for(const b of balls){if(!b.alive)continue;const gx=Math.floor(b.x/24),gy=Math.floor(b.y/24);for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++){for(const a of grid.get(x+','+y)||[]){let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=20)continue;if(d<.001){dx=1;dy=0;d=1;}const nx=dx/d,ny=dy/d,p=(20-d)/2;b.x+=nx*p;b.y+=ny*p;a.x-=nx*p;a.y-=ny*p;const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rel<0){const impulse=-rel*.9;b.vx+=nx*impulse;b.vy+=ny*impulse;a.vx-=nx*impulse;a.vy-=ny*impulse;}}}const key=gx+','+gy;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);}
 // Resolve drain crossings in physical order; the last marble remains the winner.
 falling.sort((a,b)=>(b.y-H)/Math.max(1,b.vy)-(a.y-H)/Math.max(1,a.vy)||a.source.i-b.source.i);
 for(const b of falling){if(activeCount<=1)break;b.alive=false;activeCount--;deaths.push(b.source);spark(clamp(b.x,100,500),945,'#ff667b');}
 if(activeCount===1){winner=balls.find(b=>b.alive);break;}
 }
 effects=effects.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});return deaths;
}
function render(ctx,width,height,bounds,options){ctx.fillStyle='#090e17';ctx.fillRect(0,0,width,height);const scale=Math.max(.05,Math.min((bounds.R-bounds.L)/W,(bounds.B-bounds.T)/H)),ox=(bounds.L+bounds.R-W*scale)/2,oy=bounds.T+(bounds.B-bounds.T-H*scale)/2;ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
 const line=(x1,y1,x2,y2,color,lw)=>{ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
 const circle=(x,y,r,fill,stroke,lw=2)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=lw;ctx.strokeStyle=stroke;ctx.stroke();}};
 const text=(str,x,y,size,color='#dbe7f3')=>{ctx.font=`600 ${size}px sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(str,x,y);};
 ctx.fillStyle='#151f31';ctx.beginPath();ctx.roundRect(24,32,552,925,42);ctx.fill();ctx.strokeStyle='#3e526c';ctx.lineWidth=5;ctx.stroke();
 const grd=ctx.createLinearGradient(0,80,0,940);grd.addColorStop(0,'#1b3144');grd.addColorStop(.55,'#111e31');grd.addColorStop(1,'#253048');ctx.fillStyle=grd;ctx.beginPath();ctx.roundRect(44,54,512,885,28);ctx.fill();
 // Printed playfield motifs, deliberately distinct from the reference table.
 ctx.save();ctx.beginPath();ctx.roundRect(44,54,512,885,28);ctx.clip();
 for(let i=0;i<7;i++){ctx.strokeStyle='#6096b018';ctx.lineWidth=2;ctx.beginPath();ctx.arc(300,440,100+i*35,0,Math.PI*2);ctx.stroke();}
 text('B O N G  /  P I N B A L L',300,110,21,'#a8d8e3');text(`${activeCount} / ${balls.length}  생존`,300,147,16,'#829db6');
 ctx.restore();
 for(const r of rails){line(...r,'#080f1d',15);line(...r,'#7389a2',7);line(r[0],r[1]-2,r[2],r[3]-2,'#b5d6dc',2);}
 for(const x of [88,512])for(let i=0;i<11;i++)circle(x,350+i*24,3,i%2?'#67d6ca':'#bd9464');
 for(const p of bumpers){circle(p.x,p.y,p.r+8,'#101724','#50647b',2);circle(p.x,p.y,p.r,'#e6ae61','#fff1bd',3);circle(p.x,p.y,p.r-8,'#234153','#6fd5cc',2);circle(p.x-5,p.y-6,6,'#ffffff50');}
 for(const x of [137,463]){ctx.fillStyle='#44cec124';ctx.beginPath();ctx.moveTo(x,705);ctx.lineTo(x+(x<300?15:-15),766);ctx.lineTo(x+(x<300?-15:15),787);ctx.closePath();ctx.fill();}
 text('LAST MARBLE STANDING',300,720,14,'#708ba7');
 for(const f of flippers){const ex=f.x+Math.cos(f.angle)*124,ey=f.y+Math.sin(f.angle)*124;line(f.x,f.y+5,ex,ey+5,'#050a13',27);line(f.x,f.y,ex,ey,f.side===1?'#55d8c1':'#a995f5',21);line(f.x,f.y-3,ex,ey-3,'#ffffff66',3);circle(f.x,f.y,12,'#213246','#c0d8e6',3);}
 text('!왼',100,914,23,'#68e4cd');text('!오',500,914,23,'#b4a1ff');text('채팅 또는 ← → 로 플리퍼 조작',300,965,15,'#8b9db7');
 for(const p of effects){ctx.globalAlpha=p.life/.4;circle(p.x,p.y,3,p.color);}ctx.globalAlpha=1;
 for(const b of balls){if(!b.alive||winner)continue;circle(b.x+2,b.y+4,b.r+1,'#0008');circle(b.x,b.y,b.r,b.source.color,'#edffff',1.5);const face=options.faces&&roundFace(options.faceOf[b.source.name]);if(face)ctx.drawImage(face,b.x-b.r+1,b.y-b.r+1,b.r*2-2,b.r*2-2);if(activeCount<=30)text(b.source.name,b.x,b.y+20,12,b.source.color);}
 if(options.phase==='idle')text('여러 구슬이 함께 발사됩니다',300,800,17,'#bdcedf');
 if(options.phase==='countdown'){circle(300,470,60,'#0b152ee8','#6ddbc4',2);text(String(Math.ceil(options.countdown)),300,470,54,'#a0f5da');}
 if(winner){ctx.fillStyle='#07111dde';ctx.fillRect(30,200,540,560);text('🏆  최후의 생존자',300,340,25,'#ffda86');circle(300,460,58,winner.source.color,'#ffe4a4',4);const face=options.faces&&roundFace(options.faceOf[winner.source.name]);if(face)ctx.drawImage(face,247,407,106,106);text(winner.source.name,300,565,30,winner.source.color);text(`${time.toFixed(1)}초 생존`,300,615,17,'#9aafc5');}
 ctx.restore();
}
return{reset,command,update,render,get winner(){return winner?.source},get balls(){return balls},get time(){return time}};
};
})();
