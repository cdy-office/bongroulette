/* Pinball uses the same flat palette, marble portraits and outlined labels as the 2D modes. */
(function () {
  const W = 790, H = 1200, R = 12, CENTER = 360, FLIPPER_LENGTH = 108;
  const mirror = pts => pts.map(([x,y])=>[CENTER*2-x,y]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pathSegments = pts => pts.slice(1).map((p, i) => [...pts[i], ...p]).filter(r=>Math.hypot(r[2]-r[0],r[3]-r[1])>.001);
  function arc(cx,cy,r,start,end) {
    const a=start*Math.PI/180,b=end*Math.PI/180,n=Math.ceil(Math.abs(b-a)*r/5);
    return Array.from({length:n+1},(_,i)=>{const t=a+(b-a)*i/n;return [cx+r*Math.cos(t),cy+r*Math.sin(t)];});
  }
  // Both drawing and physics use these sampled Bezier curves, so a rounded rail
  // never retains the old angular hitbox. Chords are at most about six units.
  function curve(commands) {
    const pts=[];let x=0,y=0;
    for(const [op,...v] of commands) {
      if(op==='M'||op==='L'){[x,y]=v;pts.push([x,y]);continue;}
      const sx=x,sy=y,c=op==='Q'?[sx+2*(v[0]-sx)/3,sy+2*(v[1]-sy)/3,v[2]+2*(v[0]-v[2])/3,v[3]+2*(v[1]-v[3])/3,v[2],v[3]]:v;
      const length=Math.hypot(c[0]-sx,c[1]-sy)+Math.hypot(c[2]-c[0],c[3]-c[1])+Math.hypot(c[4]-c[2],c[5]-c[3]);
      const n=Math.max(4,Math.ceil(length/6));
      for(let i=1;i<=n;i++){const t=i/n,u=1-t;pts.push([u*u*u*sx+3*u*u*t*c[0]+3*u*t*t*c[2]+t*t*t*c[4],u*u*u*sy+3*u*u*t*c[1]+3*u*t*t*c[3]+t*t*t*c[5]]);}
      [x,y]=c.slice(4);
    }
    return pts;
  }
  function roundedPolygon(points,radius) {
    const corners=points.map((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length],da=Math.hypot(a[0]-p[0],a[1]-p[1]),db=Math.hypot(b[0]-p[0],b[1]-p[1]),r=Math.min(radius,da*.3,db*.3);return {p,from:[p[0]+(a[0]-p[0])*r/da,p[1]+(a[1]-p[1])*r/da],to:[p[0]+(b[0]-p[0])*r/db,p[1]+(b[1]-p[1])*r/db]};});
    const commands=[['M',...corners[0].from]];
    for(const c of corners){commands.push(['L',...c.from],['Q',...c.p,...c.to]);}
    commands.push(['L',...corners[0].from]);return curve(commands);
  }
  const leftFloor=curve([['M',40,820],['C',40,914,141,951,220,1010],['C',261,1041,315,1071,315,1110],['L',315,1190]]);
  const shell=curve([['M',40,820],['L',40,210],['C',40,108,106,35,208,35],['L',512,35],['C',629,35,744,69,744,186],['L',744,1085],['Q',744,1100,729,1100],['L',695,1100],['Q',680,1100,680,1085],['L',680,820]]);
  const shooterGuide=curve([['M',680,820],['L',680,226],['C',680,169,643,133,570,105]]);
  const boundary=[...leftFloor.slice().reverse(),...shell.slice(1),...shooterGuide.slice(1)];
  // Every paired playfield part is reflected from one profile, never hand-aligned.
  const rightFloor=mirror(leftFloor);
  const orbitArc=arc(280,316,174,166,252),orbitTip=orbitArc[orbitArc.length-1];
  // Continue into the outer rollover post: the former gap trapped a marble.
  const orbitLeft=[...orbitArc,...curve([['M',...orbitTip],['C',orbitTip[0]+12,orbitTip[1]-4,248,141,248,160],['L',248,210]]).slice(1)];
  const orbitRight=mirror(orbitLeft);
  const leftRamp=arc(136,538,112,-60,60);
  const rightRamp=mirror(leftRamp);
  // Leave a full marble's clearance between the unpowered back and return rail.
  const slingFront=curve([['M',181,761],['C',190,779,227,846,238,865]]);
  const slingLeft=[...slingFront,...curve([['M',238,865],['Q',241,871,235,874],['L',179,899],['Q',171,903,172,893],['L',177,765],['Q',178,755,181,761]]).slice(1)];
  const slings=[slingLeft,mirror(slingLeft)];
  const slingActive=slingFront.slice(2,-1);
  const slingSegments=slings.map(pathSegments);
  const lanePosts=[304,CENTER,416].map(x=>[x,146,x,210]);
  const leftTargets=[[117,400,101,425],[134,449,118,474]];
  const targets=[...leftTargets,...leftTargets.map(([x1,y1,x2,y2])=>[CENTER*2-x1,y1,CENTER*2-x2,y2])];
  const solid=[...pathSegments(boundary),...pathSegments(rightFloor),...pathSegments(orbitLeft),...pathSegments(orbitRight),...pathSegments(leftRamp),...pathSegments(rightRamp),...lanePosts];
  const bumpers=[{x:276,y:302,r:30},{x:444,y:302,r:30},{x:CENTER,y:414,r:34},{x:136,y:538,r:24},{x:584,y:538,r:24}];
  const deck=[...shell,...rightFloor.slice(1),...leftFloor.slice().reverse()];
  const leftApron=[...leftFloor,...curve([['M',315,1190],['L',58,1190],['Q',40,1190,40,1172],['L',40,820]])];
  const rightApron=mirror(leftApron);
  // Broad-phase buckets keep hundreds of marbles affordable with finer curves.
  const collisionGrid=new Map(),CELL=64;
  const colliders=[
    ...solid.map(r=>({r,radius:5,kick:0})),
    ...slingSegments.flatMap((rs,i)=>rs.map((r,j)=>({r,radius:3,kick:j>=2&&j<slingFront.length-2?580:0,id:'sling-'+i,color:i===0?'#4fd1c5':'#b388ff'}))),
    ...targets.map((r,i)=>({r,radius:7,kick:520,id:'target-'+i,color:r[0]<CENTER?'#4fd1c5':'#b388ff'}))
  ];
  for(const item of colliders){const [x1,y1,x2,y2]=item.r,pad=R+item.radius+3;for(let x=Math.floor((Math.min(x1,x2)-pad)/CELL);x<=Math.floor((Math.max(x1,x2)+pad)/CELL);x++)for(let y=Math.floor((Math.min(y1,y2)-pad)/CELL);y<=Math.floor((Math.max(y1,y2)+pad)/CELL);y++){const key=x+','+y;if(!collisionGrid.has(key))collisionGrid.set(key,[]);collisionGrid.get(key).push(item);}}
  const font = 'Pretendard,"Malgun Gothic",sans-serif';

  window.createPinballGame = ({roundFace,onError=()=>{}}) => {
    let view3d=null;
    const layout={deck,shell,boundary,rightFloor,leftFloor,orbitLeft,orbitRight,leftRamp,rightRamp,lanePosts,targets,bumpers,slings,slingActive,leftApron,rightApron,flipperLength:FLIPPER_LENGTH};
    let balls=[], random=Math.random, time=0, launched=false, effects=[], winner=null, activeCount=0;
    let nextLaunch=0, launchClock=0;
    const hitFlashes=new Map();
    const camera={x:W/2,y:H/2,zoom:1,ready:false};
    const flippers=[{x:220,y:1010,angle:.4,side:1},{x:500,y:1010,angle:Math.PI-.4,side:-1}];
    function reset(marbles,rng) {
      random=rng; time=0; launched=false; effects=[]; winner=null; activeCount=marbles.length;
      nextLaunch=0; launchClock=0; camera.ready=false;hitFlashes.clear();
      const order=marbles.slice();
      for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
      balls=order.map(source=>({source,x:712,y:1040,vx:0,vy:0,r:R,alive:true,queued:true,inLane:true,cool:0,poweredUntil:new Map()}));
      flippers.forEach(f=>{f.active=false;f.pending=false;f.stroke=0;f.angle=f.side===1?.4:Math.PI-.4;f.omega=0;});
    }
    function command(text) {
      if(text!=='!왼'&&text!=='!오')return false;
      const f=flippers[text==='!왼'?0:1];
      // Coalesce a burst into one next stroke; never prolong the raised phase.
      if(f.active)f.pending=true;else{f.active=true;f.stroke=0;}
      return true;
    }
    function spark(x,y,color) {
      for(let i=0;i<7;i++){const a=random()*Math.PI*2;effects.push({x,y,vx:Math.cos(a)*110,vy:Math.sin(a)*110,life:.4,color});}
      if(effects.length>240)effects.splice(0,effects.length-240);
    }
    function powerHit(b,id,nx,ny,incoming,strength,x,y,color) {
      if(incoming>=-1||time<(b.poweredUntil.get(id)||0))return;
      const outgoing=strength+Math.min(160,-incoming*.15);
      const boost=Math.max(0,outgoing-(b.vx*nx+b.vy*ny));
      b.vx+=nx*boost;b.vy+=ny*boost;
      b.poweredUntil.set(id,time+.09);hitFlashes.set(id,time+.14);
      spark(x,y,color);
    }
    function segment(b,x1,y1,x2,y2,radius=5,kick=0,color='#4fd1c5',omega=0,id='') {
      const dx=x2-x1,dy=y2-y1,t=clamp(((b.x-x1)*dx+(b.y-y1)*dy)/(dx*dx+dy*dy),0,1),px=x1+t*dx,py=y1+t*dy;
      let nx=b.x-px,ny=b.y-py,d=Math.hypot(nx,ny);const min=b.r+radius;
      if(d>=min)return false;
      if(d<.0001){nx=-dy;ny=dx;d=Math.hypot(nx,ny);}
      nx/=d;ny/=d;b.x=px+nx*(min+.1);b.y=py+ny*(min+.1);
      // Resolve against the surface velocity: a resting flipper is not a launcher.
      const sx=-omega*dy*t,sy=omega*dx*t,dot=(b.vx-sx)*nx+(b.vy-sy)*ny;
      if(dot<0){
        const restitution=-dot<25?0:b.inLane?.68:.38;
        b.vx-=(1+restitution)*dot*nx;b.vy-=(1+restitution)*dot*ny;
        const tangent=(b.vx-sx)*(-ny)+(b.vy-sy)*nx;
        b.vx+=ny*tangent*.025;b.vy-=nx*tangent*.025;
      }
      // Only an incoming hit on a lit rubber face fires its solenoid.
      if(kick){
        powerHit(b,id,nx,ny,dot,kick,px,py,color);
      }else if(omega&&dot< -150&&b.cool<=0){
        spark(px,py,color);b.cool=.12;
      }
      return true;
    }
    // Countdown runs only this mechanism: marbles stay in the shooter lane.
    function updateFlippers(dt) {
      if(winner||!Number.isFinite(dt)||dt<=0)return;
      const count=Math.ceil(dt/(1/200)),h=dt/count;
      for(let step=0;step<count;step++)for(const f of flippers) {
        const before=f.angle;
        if(f.active){
          f.stroke+=h;
          if(f.stroke>=.24){f.stroke-=.24;f.active=f.pending;f.pending=false;}
        }
        // Fast upstroke, brief impact stop, complete return, then a rest beat.
        const t=f.stroke;let lift=0;
        if(f.active&&t<.055)lift=1-Math.pow(1-t/.055,2);
        else if(f.active&&t<.08)lift=1;
        else if(f.active&&t<.20){const u=(t-.08)/.12;lift=1-u*u*(3-2*u);}
        f.angle=f.side===1?.4-.96*lift:Math.PI-.4+.96*lift;
        f.omega=(f.angle-before)/h;
      }
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
        updateFlippers(h);
        const falling=[];
        for(const b of balls) {
          if(!b.alive||b.queued)continue;
          b.cool=Math.max(0,b.cool-h);
          b.vy+=460*h;b.vx*=Math.exp(-.10*h);b.vy*=Math.exp(-.10*h);
          b.x+=b.vx*h;b.y+=b.vy*h;
          for(const c of collisionGrid.get(Math.floor(b.x/CELL)+','+Math.floor(b.y/CELL))||[])segment(b,...c.r,c.radius,c.kick,c.color,0,c.id);
          for(const [i,p] of bumpers.entries()) {
            let dx=b.x-p.x,dy=b.y-p.y,d=Math.hypot(dx,dy);const min=p.r+b.r;
            if(d>=min)continue;
            if(d<.001){dx=1;dy=0;d=1;}
            const nx=dx/d,ny=dy/d;b.x=p.x+nx*(min+.2);b.y=p.y+ny*(min+.2);
            const dot=b.vx*nx+b.vy*ny;
            if(dot<0){b.vx-=1.5*dot*nx;b.vy-=1.5*dot*ny;}
            powerHit(b,'bumper-'+i,nx,ny,dot,480,p.x+nx*p.r,p.y+ny*p.r,'#ffd166');
          }
          for(const f of flippers)segment(b,f.x,f.y,f.x+Math.cos(f.angle)*FLIPPER_LENGTH,f.y+Math.sin(f.angle)*FLIPPER_LENGTH,10,0,f.side===1?'#4fd1c5':'#b388ff',f.omega);
          if(b.inLane&&b.x<656&&b.y<240)b.inLane=false;
          // A marble returned to the shooter is relaunched by the plunger;
          // it must never sit forever in the closed launch pocket.
          if(b.x>680&&b.y>1020&&b.vy>0){b.inLane=true;b.vy=-1540;b.vx=(712-b.x)*3;}
          const max=b.inLane?1650:1150,speed=Math.hypot(b.vx,b.vy);
          if(speed>max){b.vx*=max/speed;b.vy*=max/speed;}
          // The ONLY drain is the narrow central chute, below both flippers.
          if(b.y>1165&&b.x>315&&b.x<405)falling.push(b);
          if(b.x<53){b.x=53;b.vx=Math.abs(b.vx);}if(b.x>731){b.x=731;b.vx=-Math.abs(b.vx);}
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
            if(rel<0){const impulse=-rel*.76;b.vx+=nx*impulse;b.vy+=ny*impulse;a.vx-=nx*impulse;a.vy-=ny*impulse;}
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
      const vw=bounds.R-bounds.L,vh=bounds.B-bounds.T,boardTop=bounds.T+58,boardHeight=Math.max(100,vh-58),base=Math.max(.05,Math.min(vw/W,boardHeight/H));
      let tx=W/2,ty=H/2,tz=1;
      const live=balls.filter(b=>b.alive);
      const delta=options.paused?0:Math.min(.05,options.delta??1/60);
      let framing=null;
      if(options.phase==='battle'&&live.length&&!winner) {
        framing={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
        for(const b of live){framing.minX=Math.min(framing.minX,b.x-48);framing.maxX=Math.max(framing.maxX,b.x+48);framing.minY=Math.min(framing.minY,b.y-48);framing.maxY=Math.max(framing.maxY,b.y+48);}
        tx=(framing.minX+framing.maxX)/2;ty=(framing.minY+framing.maxY)/2;
        tz=clamp(Math.min(vw/(framing.maxX-framing.minX),boardHeight/(framing.maxY-framing.minY))/base,.75,2.5);
      }
      if(winner){tx=winner.x;ty=winner.y+70/(base*2.45);tz=2.45;}
      const halfW=vw/(2*base*tz),halfH=boardHeight/(2*base*tz);
      if(!framing&&!winner){tx=halfW>=W/2?W/2:clamp(tx,halfW,W-halfW);ty=halfH>=H/2?H/2:clamp(ty,halfH,H-halfH);}
      if(!camera.ready){camera.x=tx;camera.y=ty;camera.zoom=tz;camera.ready=true;}
      const pan=1-Math.exp(-delta*3.8),zoom=1-Math.exp(-delta*1.9);
      camera.x+=(tx-camera.x)*pan;camera.y+=(ty-camera.y)*pan;camera.zoom+=(tz-camera.zoom)*zoom;
      if(framing&&!options.paused){
        // Smooth zoom-in, but widen immediately if spreading marbles would leave
        // the frame while the camera center is still catching up.
        const spanX=2*Math.max(camera.x-framing.minX,framing.maxX-camera.x);
        const spanY=2*Math.max(camera.y-framing.minY,framing.maxY-camera.y);
        camera.zoom=Math.min(camera.zoom,vw/(base*spanX),boardHeight/(base*spanY));
      }
      const scale=base*camera.zoom,cx=(bounds.L+bounds.R)/2,cy=(boardTop+bounds.B)/2;
      const pending=balls.length-nextLaunch;
      function hud(){
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 16px ${font}`;ctx.fillStyle='#ecedf3';ctx.fillText(`🎱 핀볼  ·  생존 ${activeCount} / ${balls.length}`,cx,bounds.T+21);
        ctx.font=`12px ${font}`;ctx.fillStyle='#8b8d9c';ctx.fillText(options.paused?'일시정지':pending?`오른쪽 발사 대기 ${pending}개`:'!왼 · !오  또는  ← →  플리퍼 조작',cx,bounds.T+44);
        if(options.phase==='countdown'){ctx.fillStyle='#12121be8';ctx.beginPath();ctx.roundRect(cx-75,cy-55,150,110,10);ctx.fill();ctx.font=`700 48px ${font}`;ctx.fillStyle='#ecedf3';ctx.fillText(String(Math.ceil(options.countdown)),cx,cy);}
      }
      if(options.view3d&&window.createPinball3D){
        try{
          if(!view3d)view3d=window.createPinball3D({layout,roundFace,onError});
          const fieldBounds={...bounds,T:boardTop};
          if(view3d.render({balls,flippers,time,hitFlashes},{x:camera.x,y:camera.y,halfW:Math.min(W/2+15,vw/(2*scale)),halfH:boardHeight/(2*scale),framing},fieldBounds,width,height,options)){
            ctx.clearRect(0,0,width,height);ctx.save();ctx.beginPath();ctx.rect(bounds.L,boardTop,vw,boardHeight);ctx.clip();
            const label=(s,x,y,size,color)=>{ctx.font=`600 ${size}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeStyle='#080d14';ctx.lineWidth=3;ctx.lineJoin='round';ctx.strokeText(s,x,y);ctx.fillStyle=color;ctx.fillText(s,x,y);};
            for(const b of balls){if(!b.alive||b.queued)continue;const p=view3d.project(b.x,b.y,R+1);if(p.visible&&(activeCount<=35||winner))label(b.source.name,p.x,p.y+18,14,b.source.color);if(winner)label('👑',p.x,p.y-25,22,'#ffd166');}
            for(const [x,s,c] of [[160,'!왼','#4fd1c5'],[560,'!오','#b388ff']]){const p=view3d.project(x,1042,5);label(s,p.x,p.y,16,c);}
            ctx.restore();hud();
            if(winner){const p=view3d.project(winner.x,winner.y,R+1),edge=view3d.project(winner.x+R,winner.y,R+1),r=Math.abs(edge.x-p.x);return {...p,r,scale:r/R};}
            return;
          }
        }catch(error){view3d?.setActive(false);onError(error);}
      }
      view3d?.setActive(false);
      ctx.save();ctx.beginPath();ctx.rect(bounds.L,boardTop,vw,boardHeight);ctx.clip();
      ctx.translate(cx-camera.x*scale,cy-camera.y*scale);ctx.scale(scale,scale);
      const poly=(pts,fill,stroke,lw=4)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}};
      const line=(pts,color,lw)=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();};
      const circle=(x,y,r,fill,stroke,lw=2)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}};
      const text=(s,x,y,size,color='#8b8d9c',outline=false)=>{ctx.font=`600 ${size}px ${font}`;ctx.textAlign='center';ctx.textBaseline='middle';if(outline){ctx.strokeStyle='#0a0a0f';ctx.lineWidth=3;ctx.strokeText(s,x,y);}ctx.fillStyle=color;ctx.fillText(s,x,y);};
      // Restrained flat surfaces use the same palette as the other 2D boards.
      poly(deck,'#12121b');
      poly(leftApron,'#191923','#303044',2);poly(rightApron,'#191923','#303044',2);
      poly([[320,1100],[400,1100],[400,1200],[320,1200]],'#08080d');
      for(let y=1120;y<1180;y+=23)line([[346,y],[360,y+8],[374,y]],'#ff4d6d44',2.5);
      const rail=pts=>{line(pts,'#3d3d58',11);line(pts,'#22222f',7);line(pts,'#323247',1.5);};
      rail(boundary);rail(rightFloor);rail(orbitLeft);rail(orbitRight);rail(leftRamp);rail(rightRamp);
      for(const r of lanePosts)rail([[r[0],r[1]],[r[2],r[3]]]);
      for(const [i,x] of [276,332,388,444].entries()){circle(x,183,7,'#ffd16622','#ffd16688',1.5);text(String(i+1),x,230,12,'#686879');}
      // Dashed arrows follow the orbit and shooter lane rather than unrelated decorations.
      for(let y=980;y>300;y-=76)line([[703,y+6],[712,y-3],[721,y+6]],'#4fd1c53d',3);
      const flash=id=>clamp(((hitFlashes.get(id)||0)-time)/.14,0,1);
      for(const [i,r] of targets.entries()){const c=r[0]<CENTER?'#4fd1c5':'#b388ff',pts=[[r[0],r[1]],[r[2],r[3]]];line(pts,'#3d3d58',18);line(pts,c,8);if(flash('target-'+i)){ctx.globalAlpha=flash('target-'+i);line(pts,'#ffffff',4);ctx.globalAlpha=1;}}
      for(const [i,p] of bumpers.entries()){
        const c='#ffd166';
        circle(p.x,p.y+3,p.r+8,'#090910');circle(p.x,p.y,p.r+7,'#1b1b27','#3d3d58',2);
        circle(p.x,p.y,p.r,'#22222f',c,3);circle(p.x,p.y,p.r-7,'#181823','#303043',1);
        for(let i=0;i<4;i++){const a=i*Math.PI/2;circle(p.x+(p.r+4)*Math.cos(a),p.y+(p.r+4)*Math.sin(a),1.5,c);}
        if(flash('bumper-'+i)){ctx.globalAlpha=flash('bumper-'+i);circle(p.x,p.y,p.r+2,'#0000','#ffffff',4);ctx.globalAlpha=1;}
      }
      poly(roundedPolygon([[342,499],[CENTER,482],[378,499],[CENTER,516]],4),'#1b1b27','#484860',1.5);
      for(let i=0;i<2;i++){
        const c=i===0?'#4fd1c5':'#b388ff';
        poly(slings[i],'#20202d','#42425c',3);
        line(i===0?slingActive:mirror(slingActive),c,3);
        if(flash('sling-'+i)){ctx.globalAlpha=flash('sling-'+i);line(i===0?slingActive:mirror(slingActive),'#ffffff',4);ctx.globalAlpha=1;}
        circle(i===0?184:536,882,3,'#12121b',c,1.3);
      }
      for(const f of flippers){const end=[f.x+Math.cos(f.angle)*FLIPPER_LENGTH,f.y+Math.sin(f.angle)*FLIPPER_LENGTH],c=f.side===1?'#4fd1c5':'#b388ff';line([[f.x,f.y],end],'#282837',24);line([[f.x,f.y],end],c,16);circle(f.x,f.y,10,'#22222f',c,2.5);}
      text('!왼',160,1042,22,'#4fd1c5');text('!오',560,1042,22,'#b388ff');
      line([[695,1070],[729,1070]],'#ffd166',5);line([[698,1083],[726,1083]],'#3d3d58',4);
      if(pending){circle(712,1040,R,'#4fd1c5','#4fd1c5',2);const face=options.faces&&balls[nextLaunch]&&roundFace(options.faceOf[balls[nextLaunch].source.name]);if(face)ctx.drawImage(face,700,1028,24,24);text(`${pending}`,712,1140,17,'#ffd166');}
      for(const p of effects){ctx.globalAlpha=p.life/.4;circle(p.x,p.y,3,p.color);}ctx.globalAlpha=1;
      for(const b of balls){if(!b.alive||b.queued)continue;circle(b.x,b.y,R,b.source.color);const face=options.faces&&roundFace(options.faceOf[b.source.name]);if(face){ctx.drawImage(face,b.x-R,b.y-R,R*2,R*2);circle(b.x,b.y,R,'#0000',b.source.color,1.7);}if(activeCount<=35||winner)text(b.source.name,b.x,b.y+24,15,b.source.color,true);if(winner)text('👑',b.x,b.y-29,23,'#ffd166');}
      ctx.restore();
      // Screen-space information follows the other modes' unobtrusive centered HUD.
      hud();
      if(winner)return {x:cx+(winner.x-camera.x)*scale,y:cy+(winner.y-camera.y)*scale,r:R*scale,scale};
    }
    return {reset,command,updateFlippers,update,render,setActive:value=>view3d?.setActive(value),get view3dMetrics(){return view3d?.metrics},get winner(){return winner?.source},get balls(){return balls},get time(){return time},get camera(){return {...camera}},get flippers(){return flippers.map(f=>({...f}))}};
  };
})();
