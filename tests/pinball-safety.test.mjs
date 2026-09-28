import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../pinball.js',import.meta.url),'utf8');
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function fixture(n=2,seed=1){
  const context=vm.createContext({window:{}});
  vm.runInContext(source.replace('const font =','window.auditDeck=deck;const font ='),context);
  const game=context.window.createPinballGame({roundFace:()=>null});
  game.reset(Array.from({length:n},(_,i)=>({i,name:'구슬'+i})),rng(seed));
  return {game,context,deck:context.window.auditDeck};
}
function launched(n=2){const result=fixture(n);result.game.update(n*.05);for(const b of result.game.balls)Object.assign(b,{vx:0,vy:0,inLane:false});return result;}
function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;}

test('escaped marbles are eliminated before they can win or be relaunched below the board',()=>{
  for(const position of [{x:200,y:1210},{x:712,y:1400},{x:-100,y:600},{x:NaN,y:500}]){
    const {game}=launched();const [bad,good]=game.balls;
    Object.assign(bad,{...position,vy:100});Object.assign(good,{x:360,y:650});
    const deaths=game.update(1/120);
    assert.ok(deaths.includes(bad.source));assert.equal(bad.alive,false);
    assert.equal(game.winner,good.source);assert.equal(game.finished,true);
  }
});

test('all invalid marbles finish without inventing a winner, and reset clears the finish',()=>{
  const {game,context}=launched();for(const b of game.balls)Object.assign(b,{x:200,y:1300});
  assert.equal(game.update(1/120).length,2);assert.equal(game.finished,true);assert.equal(game.winner,undefined);
  assert.equal(game.command('!왼'),false);
  // Check the actual page consumer also leaves battle when no valid survivor remains.
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),start=html.indexOf('function stepPinball(dt)'),end=html.indexOf('\nwindow.addEventListener',start);
  Object.assign(context,{pinballGame:game,S:{phase:'battle',winners:[]},SFX:{play(){}},fmt:()=>'',deadKey:0,updateRank(){}});
  vm.runInContext(html.slice(start,end),context);context.stepPinball(1/120);
  assert.equal(context.S.phase,'finished');assert.equal(context.S.bannerNext.text,'전원 탈락');
  game.reset([{i:0},{i:1}],rng(1));assert.equal(game.finished,false);assert.equal(game.command('!왼'),true);
});

test('simultaneous drain crossings rank by crossing time and present the last survivor above the drain',()=>{
  const {game}=launched();const [earlier,later]=game.balls;
  Object.assign(earlier,{x:340,y:1164.8,vy:500});Object.assign(later,{x:380,y:1164,vy:500});
  const deaths=game.update(1/120);
  assert.equal(deaths.length,1);assert.equal(deaths[0],earlier.source);
  assert.equal(game.winner,later.source);assert.ok(later.y<1165);assert.equal(later.vy,0);
});

test('stationary marbles leave rollover post caps without commands or teleportation',()=>{
  const {game}=launched();for(const [i,b] of game.balls.entries())Object.assign(b,{x:i?416:304,y:128.9});
  let biggestMove=0;const released=[false,false];
  for(let i=0;i<480;i++){
    const before=game.balls.map(b=>[b.x,b.y]);game.update(1/120);
    game.balls.forEach((b,j)=>{biggestMove=Math.max(biggestMove,Math.hypot(b.x-before[j][0],b.y-before[j][1]));if(Math.hypot(b.x-(j?416:304),b.y-128.9)>20)released[j]=true;});
  }
  assert.ok(released.every(Boolean),'both post caps must release');
  assert.ok(biggestMove<30,'release should be a physical nudge');
});

test('marble crowding at the lower rail is repaired after pair collisions',()=>{
  const {game,deck}=launched(12);
  for(const b of game.balls)Object.assign(b,{x:280,y:1025});
  for(let i=0;i<60&&!game.finished;i++){
    game.update(1/120);
    for(const b of game.balls)if(b.alive)assert.ok(inside(b.x,b.y,deck),`outside at ${b.x},${b.y}`);
  }
});

test('recorded escape seeds stay inside the board under repeated flipper strokes',()=>{
  for(const seed of [2,4,5,7,8,10]){
    const {game,deck}=fixture(22,seed);
    for(let frame=0;frame<4800&&!game.finished;frame++){
      if(frame%24===0){game.command('!왼');game.command('!오');}
      const deaths=game.update(1/120);
      for(const b of game.balls){
        if(b.alive&&!b.queued)assert.ok(inside(b.x,b.y,deck),`seed ${seed}, t=${game.time}, ball ${b.source.i}: ${b.x},${b.y}`);
        if(deaths.includes(b.source))assert.ok(b.y>1165&&b.x>315&&b.x<405,'ordinary play must use the drain, not the escape fallback');
      }
    }
  }
});
