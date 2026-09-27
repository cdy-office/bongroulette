/* Pinball uses the same flat palette, marble portraits and outlined labels as the 2D modes. */
(function () {
  const W = 790, H = 1200, R = 12;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pathSegments = pts => pts.slice(1).map((p, i) => [...pts[i], ...p]);
  const boundary = [[315,1190],[315,1100],[220,1010],[100,920],[50,830],[50,205],[75,115],[145,55],[240,35],[600,35],[690,65],[744,120],[744,1100],[680,1100],[680,215],[650,140],[570,105]];
  const rightFloor = [[680,830],[620,920],[500,1010],[405,1100],[405,1190]];
  const orbit = [[145,470],[114,405],[103,300],[113,225],[150,168],[215,133],[280,128],[450,128],[525,160],[563,215],[579,285],[573,350]];
  const leftRamp = [[130,650],[160,620],[185,568],[212,535],[232,493],[224,450],[196,420]];
  const rightRamp = [[585,620],[544,588],[507,548],[484,499],[470,440]];
  const slings = [[[183,775],[240,885],[174,918],[183,775]],[[537,775],[480,885],[546,918],[537,775]]];
  const slingSegments=slings.map(pathSegments);
  const lanePosts = [[293,146,293,210],[350,146,350,210],[407,146,407,210]];
  const targets = [[606,344,626,371],[592,401,612,427],[570,452,590,478]];
  const solid = [...pathSegments(boundary), ...pathSegments(rightFloor), ...pathSegments(orbit), ...pathSegments(leftRamp), ...pathSegments(rightRamp), ...lanePosts];
  const bumpers = [{x:270,y:285,r:29},{x:421,y:285,r:29},{x:350,y:390,r:33},{x:142,y:520,r:25},{x:350,y:657,r:49}];
  const font = 'Pretendard,"Malgun Gothic",sans-serif';

  window.createPinballGame = ({roundFace}) => {
    let balls=[], random=Math.random, time=0, launched=false, effects=[], winner=null, activeCount=0;
    let nextLaunch=0, launchClock=0;
    const camera={x:W/2,y:H/2,zoom:1,ready:false};
    const flippers=[{x:220,y:1010,angle:.4,side:1,pulse:0},{x:500,y:1010,angle:Math.PI-.4,side:-1,pulse:0}];
    function reset(marbles,rng) {
      random=rng; time=0; launched=false; effects=[]; winner=null; activeCount=marbles.length;
      nextLaunch=0; launchClock=0; camera.ready=false;
      const order=marbles.slice();
      for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      balls=order.map(source=>({source,x:712,y:1040,vx:0,vy:0,r:R,alive:true,queued:true,inLane:true,cool:0,stuck:0}));
      flippers.forEach(f=>{f.pulse=0;f.angle=f.side===1?.4:Math.PI-.4;});
    }
    function command(text) {
      if(text!=='!왼'&&text!=='!오')return false;
      const f=flippers[text==='!왼'?0:1];f.pulse=Math.min(.3,f.pulse+.18);return true;
    }
    function spark(x,y,color) {
      for(let i=0;i<7;i++){const a=random()*Math.PI*2;effects.push({x,y,vx:Math.cos(a)*110,vy:Math.sin(a)*110,life:.4,color});}
      if(effects.length>240)effects.splice(0,effects.length-240);
    }
    function segment(b,x1,y1,x2,y2,radius=5,kick=0,side=0) {
      const dx=x2-x1,dy=y2-y1,t=clamp(((b.x-x1)*dx+(b.y-y1)*dy)/(dx*dx+dy*dy),0,1),px=x1+t*dx,py=y1+t*dy;
      let nx=b.x-px,ny=b.y-py,d=Math.hypot(nx,ny);const min=b.r+radius;
      if(d>=min)return false;
      if(d<.0001){nx=-dy;ny=dx;d=Math.hypot(nx,ny);}
      nx/=d;ny/=d;b.x=px+nx*(min+.1);b.y=py+ny*(min+.1);
      const dot=b.vx*nx+b.vy*ny;
      if(dot<0){b.vx-=1.7*dot*nx;b.vy-=1.7*dot*ny;}
      if(kick&&b.cool<=0){
        b.vy=-Math.max(kick,Math.abs(b.vy));b.vx+=side*(110+160*t);b.cool=.12;
        spark(b.x,b.y,kick>700?'#4fd1c5':'#b388ff');
      }
      return true;
    }
    function update(dt) {
      if(winner||dt<=0)return [];
      launched=true;
      const deaths=[],count=Math.ceil(dt/(1/200)),h=dt/count;
      for(let step=0;step<count;step++) {
        time+=h;launchClock-=h;
        // One shared shooter lane fires a rapid volley. Waiting marbles have no collisions.
        if(nextLaunch<balls.length&&launchClock<=0) {
          const b=balls[nextLaunch++];b.queued=false;b.x=712;b.y=1040;b.vx=(random()-.5)*12;b.vy=-1540;
          launchClock=.045;
        }
        for(const f of flippers) {
          f.pulse=Math.max(0,f.pulse-h);
          const target=f.side===1?(f.pulse>0?-.52:.4):(f.pulse>0?Math.PI+.52:Math.PI-.4);
          f.angle+=(target-f.angle)*Math.min(1,h*38);
        }
        const falling=[];
        for(const b of balls) {
          if(!b.alive||b.queued)continue;
          b.cool=Math.max(0,b.cool-h);
          b.vy+=(350+Math.min(100,time*.5))*h;b.vx*=Math.exp(-.02*h);b.vy*=Math.exp(-.02*h);
          b.x+=b.vx*h;b.y+=b.vy*h;
          for(const rail of solid)segment(b,...rail);
          for(let k=0;k<slings.length;k++)for(const rail of slingSegments[k])segment(b,...rail,5,520,k===0?1:-1);
          for(const rail of targets)segment(b,...rail,7,450,-1);
          for(const p of bumpers) {
            let dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);const min=p.r+b.r;
            if(d>=min)continue;
            if(d<.001){dx=1;dy=0;d=1;}
            const nx=dx/d,ny=dy/d;b.x=p.x+nx*(min+.2);b.y=p.y+ny*(min+.2);
            const dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=1.9*dot*nx;b.vy-=1.9*dot*ny;}
            b.vx+=nx*125;b.vy+=ny*125;
            if(b.cool<=0){spark(b.x,b.y,'#ffd166');b.cool=.1;}
          }
          for(const f of flippers)segment(b,f.x,f.y,f.x+Math.cos(f.angle)*112,f.y+Math.sin(f.angle)*112,10,f.pulse>0?960:0,f.side);
          if(b.inLane&&b.x<656&&b.y<240)b.inLane=false;
          const max=b.inLane?1650:1150,speed=Math.hypot(b.vx,b.vy);
          if(speed>max){b.vx*=max/speed;b.vy*=max/speed;}
          // The ONLY drain is the narrow central chute, below both flippers.
          if(b.y>1165&&b.x>315&&b.x<405)falling.push(b);
          if(b.x<63){b.x=63;b.vx=Math.abs(b.vx);}if(b.x>731){b.x=731;b.vx=-Math.abs(b.vx);}
          if(b.y<48){b.y=48;b.vy=Math.abs(b.vy);}
        }
        const grid=new Map();
        for(const b of balls) {
          if(!b.alive||b.queued)continue;
          const gx=Math.floor(b.x/28),gy=Math.floor(b.y/28);
          for(let x=gx-1;x<=gx+1;x++)for(let y=gy-1;y<=gy+1;y++)for(const a of grid.get(x+','+y)||[]) {
            let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=R*2)continue;
            if(d<.001){dx=1;dy=0;d=1;}const nx=dx/d,ny=dy/d,p=(R*2-d)/2;
            b.x+=nx*p;b.y+=ny*p;a.x-=nx*p;a.y-=ny*p;
            const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
            if(rel<0){const impulse=-rel*.87;b.vx+=nx*impulse;b.vy+=ny*impulse;a.vx-=nx*impulse;a.vy-=ny*impulse;}
          }
          const key=gx+','+gy;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);
        }
        falling.sort((a,b)=>(b.y-1165)/Math.max(1,b.vy)-(a.y-1165)/Math.max(1,a.vy)||a.source.i-b.source.i);
        for(const b of falling){if(activeCount<=1)break;b.alive=false;activeCount--;deaths.push(b.source);spark(b.x,1150,'#ff4d6d');}
        if(activeCount===1&&nextLaunch===balls.length){winner=balls.find(b=>b.alive);break;}
      }
      effects=effects.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return p.life>0;});
      return deaths;
    }
    function render(ctx,width,height,bounds,options) {
      ctx.fillStyle='#0a0a0f';ctx.fillRect(0,0,width,height);
      const vw=bounds.R-bounds.L,vh=bounds.B-bounds.T,base=Math.max(.05,Math.min(vw/W,vh/H));
      let tx=W/2,ty=H/2,tz=1;
      const live=balls.filter(b=>b.alive&&!b.queued);
      if(options.phase==='battle'&&nextLaunch===balls.length&&live.length&&live.length<=8) {
        const minY=Math.min(...live.map(b=>b.y)),maxY=Math.max(1055,...live.map(b=>b.y));
        tz=clamp(H/(maxY-minY+260),1,1.55);ty=(minY+maxY)/2;
      }
      if(winner){tx=winner.x;ty=clamp(winner.y,180,1020);tz=2.1;}
      if(!camera.ready){camera.x=tx;camera.y=ty;camera.zoom=tz;camera.ready=true;}
      const delta=options.paused?0:Math.min(.05,options.delta??1/60),pan=1-Math.exp(-delta*1.5),zoom=1-Math.exp(-delta*.7);
      camera.x+=(tx-camera.x)*pan;camera.y+=(ty-camera.y)*pan;camera.zoom+=(tz-camera.zoom)*zoom;
      const scale=base*camera.zoom,cx=(bounds.L+bounds.R)/2,cy=(bounds.T+bounds.B)/2;
      ctx.save();ctx.beginPath();ctx.rect(bounds.L,bounds.T,vw,vh);ctx.clip();
      ctx.translate(cx-camera.x*scale,cy-camera.y*scale);ctx.scale(scale,scale);
      const poly=(pts,fill,stroke,lw=4)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}};
      const line=(pts,color,lw)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();};
      const circle=(x,y,r,fill,stroke,lw=2)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}};
      const text=(s,x,y,size,color='#8b8d9c',outline=false)=>{ctx.font=`600 ${size}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';if(outline){ctx.strokeStyle='#0a0a0f';ctx.lineWidth=3;ctx.strokeText(s,x,y);}ctx.fillStyle=color;ctx.fillText(s,x,y);};
      // Flat filled playfield and collider-aligned cushions match arena / gate rendering.
      poly([[315,1185],[315,1100],[220,1010],[100,920],[50,830],[50,205],[75,115],[145,55],[240,35],[600,35],[690,65],[744,120],[744,1100],[680,1100],[680,830],[620,920],[500,1010],[405,1100],[405,1185]],'#12121b','#3a3a52',5);
      // Closed apron makes the central drain visually unambiguous.
      poly([[50,830],[100,920],[220,1010],[315,1100],[315,1185],[50,1185]],'#191923','#3a3a52');
      poly([[680,830],[620,920],[500,1010],[405,1100],[405,1185],[680,1185]],'#191923','#3a3a52');
      poly([[320,1090],[400,1090],[400,1200],[320,1200]],'#08080d');
      for(let y=1110;y<1180;y+=23)line([[342,y],[360,y+10],[378,y]],'#ff4d6d55',3);
      const rail=pts=>{line(pts,'#3d3d58',12);line(pts,'#22222f',7);};
      rail(boundary);rail(rightFloor);rail(orbit);rail(leftRamp);rail(rightRamp);
      for(const r of lanePosts)rail([[r[0],r[1]],[r[2],r[3]]]);
      for(const [i,x] of [266,322,379,435].entries()){circle(x,183,7,'#ffd16640','#ffd16688',1);text(String(i+1),x,230,12,'#686879');}
      // Dashed arrows follow the orbit and shooter lane rather than unrelated decorations.
      for(let y=980;y>300;y-=76)line([[703,y+6],[712,y-3],[721,y+6]],'#4fd1c53d',3);
      for(let i=0;i<7;i++){const a=Math.PI*.94+i*.24;circle(350+235*Math.cos(a),305+180*Math.sin(a),4,'#ffd16670');}
      for(const [i,r] of targets.entries()){line([[r[0],r[1]],[r[2],r[3]]],'#3d3d58',20);line([[r[0],r[1]],[r[2],r[3]]],i===1?'#4fd1c5':'#b388ff',9);}
      for(const p of bumpers){circle(p.x,p.y,p.r+6,'#22222f','#3d3d58',3);circle(p.x,p.y,p.r-2,'#181823',p.y>600?'#b388ff':'#ffd166',3);circle(p.x,p.y,p.r-10,'#22222f');}
      // Reference-inspired central circular feature and offset upper mechanisms.
      for(let i=0;i<12;i++){const a=i*Math.PI/6;circle(350+78*Math.cos(a),657+78*Math.sin(a),4,i%3===0?'#b388ff':'#3d3d58');}
      for(let i=0;i<4;i++)line([[270+i*17,514],[275+i*17,498]],'#4fd1c570',5);
      poly([[328,471],[350,455],[372,471],[350,487]],'#22222f','#3d3d58',2);
      for(let i=0;i<2;i++){poly(slings[i],'#22222f','#3d3d58',5);line(slings[i].slice(0,2),i===0?'#4fd1c5':'#b388ff',3);}
      for(const f of flippers){const end=[f.x+Math.cos(f.angle)*112,f.y+Math.sin(f.angle)*112],c=f.side===1?'#4fd1c5':'#b388ff';line([[f.x,f.y],end],'#282837',25);line([[f.x,f.y],end],c,17);circle(f.x,f.y,11,'#22222f',c,3);}
      text('!왼',160,1042,22,'#4fd1c5');text('!오',560,1042,22,'#b388ff');
      line([[695,1070],[729,1070]],'#ffd166',5);line([[698,1083],[726,1083]],'#3d3d58',4);
      const pending=balls.length-nextLaunch;
      if(pending){circle(712,1040,R,'#4fd1c5','#4fd1c5',2);const face=options.faces&&balls[nextLaunch]&&roundFace(options.faceOf[balls[nextLaunch].source.name]);if(face)ctx.drawImage(face,700,1028,24,24);text(`${pending}`,712,1140,17,'#ffd166');}
      for(const p of effects){ctx.globalAlpha=p.life/.4;circle(p.x,p.y,3,p.color);}ctx.globalAlpha=1;
      for(const b of balls){if(!b.alive||b.queued)continue;circle(b.x,b.y,R,b.source.color);const face=options.faces&&roundFace(options.faceOf[b.source.name]);if(face){ctx.drawImage(face,b.x-R,b.y-R,R*2,R*2);circle(b.x,b.y,R,'#0000',b.source.color,1.7);}if(activeCount<=35||winner)text(b.source.name,b.x,b.y+24,15,b.source.color,true);if(winner)text('👑',b.x,b.y-29,23,'#ffd166');}
      ctx.restore();
      // Screen-space information follows the other modes' unobtrusive centered HUD.
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 16px ${font}`;ctx.fillStyle='#ecedf3';ctx.fillText(`🎱 핀볼  ·  생존 ${activeCount} / ${balls.length}`,cx,bounds.T+21);
      ctx.font=`12px ${font}`;ctx.fillStyle='#8b8d9c';ctx.fillText(options.paused?'일시정지':pending?`오른쪽 발사 대기 ${pending}개`:'!왼 · !오  또는  ← →  플리퍼 조작',cx,bounds.T+44);
      if(options.phase==='countdown'){ctx.fillStyle='#12121be8';ctx.beginPath();ctx.roundRect(cx-75,cy-55,150,110,10);ctx.fill();ctx.font=`700 48px ${font}`;ctx.fillStyle='#ecedf3';ctx.fillText(String(Math.ceil(options.countdown)),cx,cy);}
      if(winner){ctx.font=`700 26px ${font}`;ctx.strokeStyle='#0a0a0f';ctx.lineWidth=5;ctx.strokeText(`🏆 ${winner.source.name} 승리!`,cx,bounds.B-60);ctx.fillStyle='#ffd166';ctx.fillText(`🏆 ${winner.source.name} 승리!`,cx,bounds.B-60);}
    }
    return {reset,command,update,render,get winner(){return winner?.source},get balls(){return balls},get time(){return time},get camera(){return {...camera}}};
  };
})();
