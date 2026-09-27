import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createChatReceiver} from '../../soop-chat.js';
function game(n){const c={window:{}};vm.runInNewContext(readFileSync(new URL('../../pinball.js',import.meta.url),'utf8'),c);let seed=123;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);const g=c.window.createPinballGame({roundFace:()=>null});g.reset(Array.from({length:n},(_,i)=>({i,name:`ball ${i}`})),rng);return g;}
for(const n of [2,22,200])test(`${n} marbles launch, remain finite, drain to exactly one winner`,()=>{const g=game(n),dead=new Set();for(let i=0;!g.winner&&i<120*90;i++){for(const m of g.update(1/120)){assert(!dead.has(m.i));dead.add(m.i);}assert(g.balls.every(b=>Number.isFinite(b.x+b.y+b.vx+b.vy)));}assert(g.winner);assert.equal(dead.size,n-1);assert.equal(g.balls.filter(b=>b.alive).length,1);});
test('left flipper strikes a nearby marble upward',()=>{const g=game(2);g.update(.01);Object.assign(g.balls[0],{x:276,y:1012,vx:0,vy:100,cool:0,queued:false,inLane:false});Object.assign(g.balls[1],{x:350,y:245,vx:0,vy:0,queued:false,inLane:false});assert(g.command('!왼'));g.update(1/120);assert(g.balls[0].vy< -500);assert(!g.command('anything'));});
test('simultaneous drain preserves one winner, reset clears result',()=>{const g=game(2);g.update(.1);g.balls.forEach((b,i)=>Object.assign(b,{x:337+i*30,y:1166+i,vy:100,vx:0,queued:false,inLane:false}));assert.equal(g.update(.01).length,1);assert(g.winner);g.reset([{i:0},{i:1}],()=>.5);assert.equal(g.winner,undefined);assert.equal(g.time,0);});
test('SOOP pinball commands deduplicate and stop while paused',()=>{const calls=[];let paused=false;const r=createChatReceiver({game:()=>({mode:'pinball',phase:'battle',paused}),command:t=>{calls.push(t);return true;},show:()=>{},now:()=>100});const e={id:'a',at:100,text:'!왼'};assert(r.receive(e));assert(!r.receive(e));assert(!r.receive({...e,id:'b',text:'hello'}));paused=true;assert(!r.receive({...e,id:'c',text:'!오'}));assert.deepEqual(calls,['!왼']);});

test('every marble starts in the right shooter and exits through the top',()=>{const g=game(22);assert(g.balls.every(b=>b.queued&&b.x===712&&b.y===1040));g.update(.1);const flying=g.balls.filter(b=>!b.queued);assert(flying.length>1);assert(flying.every(b=>b.x>680&&b.vy<0));for(let i=0;i<120*3;i++)g.update(1/120);assert(g.balls.some(b=>!b.inLane&&b.x<656));assert(g.balls.every(b=>!b.queued));});
test('drain is confined to the central chute with closed side aprons',()=>{const g=game(22);const dead=[];for(let i=0;i<120*90&&!g.winner;i++){for(const source of g.update(1/120)){const b=g.balls.find(b=>b.source===source);assert(b.x>315&&b.x<405);assert(b.y>1165);dead.push(source);}}assert.equal(dead.length,21);assert(g.balls.every(b=>b.y<1200));});

test('a returned marble is relaunched instead of remaining in the shooter pocket',()=>{const g=game(2);g.update(.1);Object.assign(g.balls[0],{x:712,y:1035,vx:0,vy:120,inLane:false});g.update(1/120);assert(g.balls[0].vy< -1000);assert(g.balls[0].inLane);});

function isolatedBall(position){
  const g=game(2);g.update(.1);
  Object.assign(g.balls[0],{queued:false,inLane:false,cool:0,...position});
  Object.assign(g.balls[1],{x:360,y:740,vx:0,vy:0,queued:false,inLane:false});
  return {g,b:g.balls[0]};
}
for(const right of [false,true])test(`${right?'right':'left'} sling only powers its colored face`,()=>{
  const place=(x,y,vx,vy)=>({x:right?720-x:x,y,vx:right?-vx:vx,vy});
  for(const pos of [place(159,826,120,0),place(214,899,-50,-100)]){
    const {g,b}=isolatedBall(pos);g.update(.002);
    assert(b.vy> -130,'dark sides must not launch the marble upward');
    assert(Math.hypot(b.vx,b.vy)<140,'dark sides must dissipate energy');
  }
  const {g,b}=isolatedBall(place(222,806,-150,80));g.update(.002);
  assert((right?-b.vx:b.vx)>.85*280,'lit face pushes toward the playfield');
  assert(b.vy< -100,'lit face kicks along its outward normal');
});
test('ordinary wall collisions lose energy and separating bumper contacts add none',()=>{
  const wall=isolatedBall({x:55,y:700,vx:-200,vy:0});wall.g.update(.002);
  assert(wall.b.vx>50&&wall.b.vx<90);
  const bumper=isolatedBall({x:317,y:302,vx:100,vy:0});bumper.g.update(.002);
  assert(bumper.b.vx<=100&&bumper.b.vx>95,'separating contact must not gain bumper energy');
});
test('marble collisions retain momentum while losing rebound energy',()=>{
  const g=game(2);g.update(.1);
  g.balls.forEach((b,i)=>Object.assign(b,{x:350+i*22,y:740,vx:i?-100:100,vy:0,queued:false,inLane:false}));
  g.update(.002);
  assert(g.balls[0].vx<0&&g.balls[1].vx>0);
  assert(Math.abs(g.balls[0].vx+g.balls[1].vx)<.01);
  assert(g.balls.reduce((v,b)=>v+b.vx*b.vx,0)<8000);
});
test('close camera follows a new living marble every three real-time seconds and freezes on pause',()=>{
  const g=game(3);g.update(.2);
  g.balls.forEach((b,i)=>Object.assign(b,{x:280+i*70,y:300+i*260,vx:0,vy:0,inLane:false}));
  const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});
  const options={phase:'battle',faces:false,delta:1/60};
  const frame=extra=>g.render(ctx,1440,1000,{L:250,R:1224,T:12,B:1000},{...options,...extra});
  frame({phase:'idle'});frame();const first=g.camera.targetId;
  for(let i=0;i<175;i++)frame();
  assert.equal(g.camera.targetId,first);assert(g.camera.zoom>2);
  const paused=g.camera;for(let i=0;i<300;i++)frame({paused:true});assert.deepEqual(g.camera,paused);
  for(let i=0;i<7;i++)frame();assert.notEqual(g.camera.targetId,first);
  const second=g.camera.targetId;g.balls.find(b=>b.source.i===second).alive=false;
  frame();assert.notEqual(g.camera.targetId,second,'eliminated marbles are skipped immediately');
});
test('both outer rollover joins release marbles instead of trapping them in a gap',()=>{
  for(const x of [228,234,240,246,492,486,480,474]){
    const g=game(22);g.update(1.1);const b=g.balls[0];
    Object.assign(b,{x,y:126,vx:0,vy:0,queued:false,inLane:false,cool:0});
    for(let i=0;i<360;i++)g.update(1/120);
    assert(b.y>240||!b.alive,`marble at ${x} should clear the connected upper rail`);
  }
});
test('removed central bumper leaves an unobstructed falling path',()=>{
  const {g,b}=isolatedBall({x:360,y:620,vx:0,vy:140});
  Object.assign(g.balls[1],{x:500,y:740});
  g.update(.3);assert(b.y>663&&b.vy>200);
});
