import { typeDescriptor } from './core/contract/registry.js';

const C = { ink:'#405c43', grass:'#9bac7b', land:'#a6b48b', dark:'#667f59', cream:'#faf4da', wood:'#b9a077', rust:'#b9846e' };
const noise = (i) => { const value = Math.sin(i * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D。');
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * dpr);
    if (canvas.width !== width) { canvas.width = width; canvas.height = Math.round(width * 640 / 1200); }
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
  const path = (points, fill, stroke, lineWidth = 2) => {
    ctx.beginPath(); points(ctx);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
  };
  const rect = (x,y,w,h,r,fill,stroke) => path((p)=>p.roundRect(x,y,w,h,r),fill,stroke);
  const circle = (x,y,r,fill,stroke) => path((p)=>p.arc(x,y,r,0,Math.PI*2),fill,stroke);
  const line = (x1,y1,x2,y2,color,width=2) => path((p)=>{p.moveTo(x1,y1);p.lineTo(x2,y2);},null,color,width);
  const ellipse = (x,y,rx,ry,angle,fill) => path((p)=>p.ellipse(x,y,rx,ry,angle,0,Math.PI*2),fill);
  const star = (x,y,r,color) => {
    path((p)=>{p.moveTo(x,y-r);p.quadraticCurveTo(x+1,y-1,x+r,y);p.quadraticCurveTo(x+1,y+1,x,y+r);p.quadraticCurveTo(x-1,y+1,x-r,y);p.quadraticCurveTo(x-1,y-1,x,y-r);},color);
  };
  const tuft = (x,y,s=1) => {
    path((p)=>{p.moveTo(x-5*s,y);p.quadraticCurveTo(x-7*s,y-9*s,x-9*s,y-11*s);p.moveTo(x,y);p.quadraticCurveTo(x-2*s,y-12*s,x+1*s,y-16*s);p.moveTo(x+3*s,y);p.quadraticCurveTo(x+9*s,y-9*s,x+10*s,y-10*s);},null,'#7e9565',1.4);
  };
  function tree(x,y,s=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    path((p)=>{p.moveTo(-3,0);p.quadraticCurveTo(3,-45,-3,-110);p.moveTo(0,-50);p.lineTo(-21,-75);p.moveTo(-1,-66);p.lineTo(21,-91);},null,'#84916b',5);
    circle(-24,-111,32,'#b9c7a0');circle(20,-133,39,'#b9c7a0');circle(40,-106,28,'#a8bc90');circle(-5,-93,39,'#a8bc90');
    path((p)=>{p.moveTo(-20,-89);p.quadraticCurveTo(8,-107,35,-106);},null,'#99af83',1);
    for(let i=0;i<8;i++){ const a=noise(i+100)*Math.PI*2;circle(Math.cos(a)*31,-114+Math.sin(a)*21,2,'#dfdfaa'); }
    ctx.restore();
  }
  function background(time) {
    const sky=ctx.createLinearGradient(0,0,0,640);sky.addColorStop(0,'#edf1df');sky.addColorStop(.68,'#e0e9d0');sky.addColorStop(1,'#cad9bd');
    ctx.fillStyle=sky;ctx.fillRect(0,0,1200,640);
    const halo=ctx.createRadialGradient(932,151,20,932,151,164);halo.addColorStop(0,'#fff9d871');halo.addColorStop(1,'#fff9d800');ctx.fillStyle=halo;ctx.fillRect(760,0,400,360);
    circle(933,151,43,'#f0d390');
    for(let i=0;i<10;i++){const angle=i*Math.PI/5;line(933+Math.cos(angle)*56,151+Math.sin(angle)*56,933+Math.cos(angle)*65,151+Math.sin(angle)*65,'#d8c88c',2);}
    star(1040,127,8,'#b3bd94');star(867,84,5,'#b9c49e');star(806,167,4,'#aebb94');star(1018,226,4,'#b6c39c');
    for(let i=0;i<30;i++)circle(90+noise(i)*1030,100+noise(i+30)*240,noise(i+60)*1.3+.4,'#a2b88a66');
    path((p)=>{p.moveTo(0,339);p.bezierCurveTo(167,306,169,273,311,309);p.bezierCurveTo(466,350,483,253,650,274);p.bezierCurveTo(819,297,925,282,1200,333);p.lineTo(1200,640);p.lineTo(0,640);p.closePath();},'#cbd7b8');
    path((p)=>{p.moveTo(0,395);p.bezierCurveTo(178,312,289,412,409,352);p.bezierCurveTo(542,289,645,351,758,358);p.bezierCurveTo(926,369,1034,305,1200,357);p.lineTo(1200,640);p.lineTo(0,640);p.closePath();},'#b6c7a0');
    // A distant village, deliberately quiet and low-contrast.
    for(const [x,y,w,h] of [[194,319,32,47],[234,328,28,37],[269,307,30,58],[823,313,33,46],[863,322,26,36]]) {
      rect(x,y,w,h,2,'#cad2b4');
      path((p)=>{p.moveTo(x-4,y);p.lineTo(x+w/2,y-18);p.lineTo(x+w+4,y);p.closePath();},'#b6c4a2');
      rect(x+10,y+13,7,10,1,'#dde0be');
    }
    path((p)=>{p.moveTo(0,432);p.bezierCurveTo(144,359,225,432,327,404);p.bezierCurveTo(471,368,594,434,723,403);p.bezierCurveTo(850,372,1006,401,1200,386);p.lineTo(1200,640);p.lineTo(0,640);p.closePath();},'#a4b98e');
    // Soft cloud strokes.
    for(const [x,y,w] of [[430,178,95],[124,215,74],[681,116,56]]) {
      path((p)=>{p.moveTo(x,y);p.bezierCurveTo(x+w*.2,y+4,x+w*.12,y-15,x+w*.38,y-9);p.bezierCurveTo(x+w*.53,y-24,x+w*.7,y-16,x+w*.76,y-5);p.quadraticCurveTo(x+w*.93,y-10,x+w,y);},null,'#f5f6e8a0',8);
    }
    // The water is visible through gaps in the foreground.
    rect(0,502,1200,138,0,'#cbd9bb');
    for(let i=0;i<21;i++){const x=noise(i+200)*1200,y=526+noise(i+300)*97;line(x,y,x+12+noise(i)*60,y,'#e1e8ce',1.7);}
    path((p)=>{p.moveTo(0,640);p.quadraticCurveTo(350,560,650,626);p.quadraticCurveTo(950,659,1200,602);p.lineTo(1200,640);p.closePath();},'#bbcda7');
    // Faint paper flecks are deterministic and purely decorative.
    for(let i=0;i<320;i++){ctx.fillStyle=i%2?'#ffffff16':'#56693d08';ctx.fillRect(noise(i+400)*1200,noise(i+800)*640,1.2,1.2);}
  }
  function platform(p) {
    const x=p.x,w=p.width,y=p.y??440;
    const soil=ctx.createLinearGradient(0,y,0,640);soil.addColorStop(0,'#a0b180');soil.addColorStop(1,'#b7c79c');
    path((q)=>{q.moveTo(x,y+4);q.quadraticCurveTo(x+Math.min(w/2,14),y-4,x+26,y-3);q.lineTo(x+w-20,y-3);q.quadraticCurveTo(x+w,y-5,x+w,y+11);q.lineTo(x+w,640);q.lineTo(x,640);q.closePath();},soil);
    path((q)=>{q.moveTo(x,y+2);q.quadraticCurveTo(x+w*.3,y-7,x+w*.6,y-1);q.quadraticCurveTo(x+w*.8,y+3,x+w,y);},null,'#7b9463',5);
    path((q)=>{q.moveTo(x+2,y+15);q.quadraticCurveTo(x+18,y+33,x+7,y+70);q.moveTo(x+w-2,y+16);q.quadraticCurveTo(x+w-18,y+60,x+w-8,y+110);},null,'#90a577',3);
    for(let i=0;i<Math.floor(w/18);i++){let px=x+8+noise(i+Math.round(x))*Math.max(1,w-20);let py=y+20+noise(i+200)*160;ellipse(px,py,2+noise(i)*4,1.3,-.2,'#91a57655');}
    for(let i=0;i<Math.floor(w/75);i++)tuft(x+22+i*75+noise(i)*20,y-3,.65+noise(i)*.3);
  }
  function bridge(e) {
    const y=e.y??440,x=e.x,w=e.width;
    if(e.state==='extended') {
      line(x,y+4,x+w,y+4,'#8c7857',5);
      for(let i=0;i<w/15;i++){rect(x+i*15,y-4,13,9,2,'#c5b083','#8d805b');line(x+i*15+3,y-1,x+i*15+10,y-1,'#ded0a8',1);}
      path((p)=>{p.moveTo(x-5,y-29);p.quadraticCurveTo(x+w/2,y+1,x+w+5,y-29);},null,'#8e9673',2);
    } else {
      ctx.save();ctx.translate(x+1,y);ctx.rotate(1.15);
      for(let i=0;i<Math.min(w,110)/15;i++)rect(i*15,-4,13,8,2,'#bba47c','#8f815f');
      ctx.restore();
      line(x+7,y+4,x+19,y+65,'#8e9673',2);
    }
    for(const px of [x-5,x+w+5]){rect(px-3,y-36,6,41,2,'#9b926c');circle(px,y-35,4,'#b3a47b');line(px-5,y-25,px+5,y-25,'#d5caaa',1);}
    if(e.state==='folded') {ctx.fillStyle='#7c9463';ctx.font='10px Georgia';ctx.textAlign='center';ctx.fillText('a little help?',x+w/2,y+62);}
  }
  function lever(e) {
    const x=e.x+e.width/2,y=440,on=e.state==='on';
    ellipse(x,y+2,19,5,0,'#82986555');rect(x-13,y-12,26,12,3,'#a8b18a','#7f9368');
    line(x,y-10,x+(on?12:-12),y-37,'#788963',5);circle(x+(on?12:-12),y-37,6,on?'#b4bc85':'#bd9b78','#7d8b61');
    circle(x,y-10,4,'#d2d7af','#7c8e65');
  }
  function fan(e,time) {
    const x=e.x+e.width/2,y=440;
    ellipse(x,y+3,24,5,0,'#78916245');rect(x-15,y-9,30,8,4,'#85996d');rect(x-5,y-55,10,47,2,'#95a780','#718a63');
    const cy=y-76;circle(x,cy,33,'#dce4c0','#80956a');circle(x,cy,29,null,'#9bab80');
    ctx.save();ctx.translate(x,cy);ctx.rotate(e.state==='running'?time*5.5:.7);
    for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ellipse(11,-7,16,8,-.5,e.state==='running'?'#98ad80':'#afbd96');}
    ctx.restore();circle(x,cy,7,'#c8cea0','#829767');
    line(x-30,cy,x+30,cy,'#81996b80',1);line(x,cy-30,x,cy+30,'#81996b80',1);
    if(e.state==='running') {for(let i=0;i<3;i++)path((p)=>{p.moveTo(x+39,cy-14+i*14);p.quadraticCurveTo(x+54,cy-19+i*14,x+61,cy-13+i*14);},null,'#94aa7d',1.5);}
  }
  function gate(e) {
    const x=e.x,y=440,open=e.state==='open';
    for(const px of [x-4,x+30]){rect(px-4,y-88,8,89,2,'#85976b');circle(px,y-89,5,'#9ead80');}
    if(open){rect(x+30,y-75,8,68,2,'#a6b58b');line(x+32,y-68,x+47,y-62,'#849a6b',3);}
    else{rect(x-1,y-76,27,68,3,'#a7b58b','#7c9365');for(let i=0;i<3;i++)line(x+4+i*8,y-69,x+4+i*8,y-15,'#82996c',2);line(x,y-28,x+28,y-28,'#718e60',3);circle(x+20,y-40,2,'#e0d5a0');}
    path((p)=>{p.moveTo(x-4,y-88);p.quadraticCurveTo(x+13,y-109,x+30,y-88);},null,'#82986b',3);
    for(let i=0;i<3;i++){ellipse(x-4+i*14,y-91-(i===1?6:0),5,3,-.5,'#b4c296');}
  }
  function plate(e) {
    rect(e.x,437,e.width,7,2,e.state==='pressed'?'#87956b':'#c2b386','#8f956a');
    for(let i=0;i<3;i++)line(e.x+8+i*10,439,e.x+11+i*10,441,e.state==='pressed'?'#cbd4a8':'#9d9974',1);
  }
  // 拿在手里时模型会把物体的 x 贴到角色身旁，这里的倾斜只表达"被拿起来了"。
  function axe(e) {
    const x=e.x+e.width/2,held=e.state==='held';
    if(!held)ellipse(x,441,20,4,0,'#849c6a22');
    ctx.save();ctx.translate(x,440);if(held)ctx.rotate(-.45);
    line(0,0,0,-44,'#b1946b',5);
    path((p)=>{p.moveTo(-1,-48);p.quadraticCurveTo(-19,-53,-22,-38);p.quadraticCurveTo(-18,-23,-1,-28);p.closePath();},'#ccd0d6','#8f948b',1.5);
    line(-19,-41,-19,-33,'#7f8a86',2);
    ctx.restore();
  }
  function hammer(e) {
    const x=e.x+e.width/2,held=e.state==='held';
    if(!held)ellipse(x,441,17,4,0,'#849c6a22');
    ctx.save();ctx.translate(x,440);if(held)ctx.rotate(-.4);
    line(0,0,0,-38,'#b1946b',5);
    rect(-14,-52,28,13,4,'#9ea7ad','#78838a');
    line(-6,-49,6,-49,'#c3ccd1',2);
    ctx.restore();
  }
  // 楼梯：一串实心台阶，高度由地图地形决定；画出来只是为了看懂。
  function stairs(s) {
    const {x,width,fromY,toY}=s;
    const steps=Math.max(4,Math.round(Math.abs(toY-fromY)/12));
    for(let i=0;i<steps;i+=1){
      const t0=i/steps,t1=(i+1)/steps;
      const x0=x+width*t0,x1=x+width*t1,y0=fromY+(toY-fromY)*t0,y1=fromY+(toY-fromY)*t1;
      rect(x0,Math.min(y0,y1)-8,Math.max(2,x1-x0+1),8+Math.abs(y1-y0)+2,1,'#c9bb95','#8f956a');
    }
    path((q)=>{q.moveTo(x,fromY+3);q.lineTo(x+width,toY+3);},null,'#7b9463',3);
  }
  // 电梯：井道横跨两层，轿厢画在「当前楼层」（调用方已平移到该层）。
  function lift(e) {
    const x=e.x,w=e.width,t=e.lifts??{};
    const carFloor=carFloorOf(e);
    const localY=(worldY)=>worldY-carFloor+440;
    const upperY=t.upperY??300,lowerY=t.lowerY??440;
    const top=Math.min(localY(upperY),localY(lowerY))-96;
    const bottom=Math.max(localY(upperY),localY(lowerY))+6;
    for(const px of [x-6,x+w-4])rect(px,top,10,bottom-top,3,'#8fa374');
    for(let i=0;i<Math.floor((bottom-top)/22);i+=1)line(x-2,top+12+i*22,x+w+2,top+12+i*22,'#86996f',1.5);
    rect(x+4,440-92,w-8,86,6,'#c8d0b0','#7f8f6a');
    for(let i=0;i<2;i+=1)line(x+14,440-70+i*20,x+w-14,440-70+i*20,'#9aa886',2);
    ctx.save();ctx.textAlign='center';ctx.fillStyle='#5f7050';ctx.font='11px "Microsoft YaHei", sans-serif';
    ctx.fillText(e.label??'',x+w/2,top-8);ctx.restore();
  }
  // 巡逻守卫：会来回移动的机关，红点是它还在巡逻。
  function guard(e) {
    const x=e.x+e.width/2,y=440,active=e.state==='patrolling';
    ellipse(x,y+2,18,4,0,'#849c6a22');
    rect(x-14,y-16,28,14,5,'#a8b58e','#7c9365');
    circle(x-8,y-2,4,'#8a9a78');circle(x+8,y-2,4,'#8a9a78');
    rect(x-11,y-40,22,26,6,'#c8d2b4','#7f8f6a');
    circle(x,y-30,6,'#fdf8e6');circle(x,y-30,3,active?'#b2574a':'#8a9a78');
    line(x,y-40,x,y-48,'#8b9d78',2);circle(x,y-50,2.5,active?'#c2705f':'#9aa886');
    ctx.save();ctx.textAlign='center';ctx.fillStyle='#5f7050';ctx.font='11px "Microsoft YaHei", sans-serif';
    ctx.fillText(e.label??'',x,y-56);ctx.restore();
  }
  // 碎石机：来回碾压的障碍。
  function crusher(e) {
    const x=e.x+e.width/2,y=440,active=e.state==='active';
    rect(e.x,y-40,e.width,40,4,'#9aa3ac','#6f7881');
    for(let i=0;i<4;i+=1){const sx=e.x+6+i*((e.width-12)/3);line(sx,y-2,sx+4,y-14,'#6f7881',3);}
    rect(e.x+4,y-52,e.width-8,12,3,active?'#c2705f':'#a8ae9a','#77808a');
    ctx.save();ctx.textAlign='center';ctx.fillStyle='#5f7050';ctx.font='11px "Microsoft YaHei", sans-serif';
    ctx.fillText(e.label??'',x,y-58);ctx.restore();
  }
  // 钥匙：可携带的小物件，开锁靠规则。
  function key(e) {
    const x=e.x+e.width/2,y=440,held=e.state==='held';
    if(!held)ellipse(x,y+1,10,3,0,'#849c6a22');
    ctx.save();ctx.translate(x,y-14);if(held)ctx.rotate(-.5);
    circle(-6,0,5,null,'#c9a85f');
    line(0,0,14,0,'#c9a85f',3);
    line(11,0,11,6,'#c9a85f',3);
    line(6,0,6,4,'#c9a85f',2);
    ctx.restore();
  }
  // 画法表：类型用 `art` 声明自己长什么样（默认与类型同名，见工厂的 createProduct）。
  // 表里没有的画法一律走 placeholder——新增类型不改渲染代码也能跑，只是画面朴素。
  function artFor(e) {
    const art = typeDescriptor(e.kind)?.art ?? e.kind;
    return ART[art] ?? placeholder;
  }
  // 缺失渲染实现时的占位：画面降级，但校验与模拟不受影响。
  function placeholder(e) {
    rect(e.x,404,e.width,36,7,'#d9d3b7','#a3a97e');
    ctx.save();ctx.textAlign='center';ctx.fillStyle='#6d7d5c';ctx.font='11px "Microsoft YaHei", sans-serif';ctx.fillText(e.label??'',e.x+e.width/2,392);ctx.restore();
  }
  function destination(goal) {
    const x=goal.x,y=440;
    ellipse(x+13,y+6,69,9,0,'#849c6a22');
    rect(x-15,y-2,55,5,2,'#c9b991');
    line(x+29,y,x+29,y-141,'#7b8e68',5);circle(x+29,y-145,5,'#d1ba7f');
    path((p)=>{p.moveTo(x+31,y-137);p.bezierCurveTo(x+53,y-151,x+62,y-126,x+83,y-137);p.lineTo(x+83,y-98);p.bezierCurveTo(x+62,y-88,x+51,y-113,x+31,y-98);p.closePath();},'#c78966','#af7857',1.5);
    line(x-31,y,x-31,y-86,'#8a9872',4);
    path((p)=>{p.moveTo(x-69,y-89);p.lineTo(x-2,y-89);p.lineTo(x+12,y-76);p.lineTo(x-2,y-63);p.lineTo(x-69,y-63);p.closePath();},'#e7dcba','#a1a77b',1.5);
    ctx.save();ctx.textAlign='center';ctx.fillStyle='#64784e';ctx.font='12px "Microsoft YaHei", sans-serif';ctx.fillText('就是那里',x-31,y-71);ctx.restore();
    rect(x+42,y-22,32,8,3,'#bba87f');line(x+47,y-14,x+45,y,'#9b9871',3);line(x+69,y-14,x+71,y,'#9b9871',3);
    rect(x+52,y-34,10,12,3,'#ece5c8','#a9ae83');path((p)=>p.arc(x+63,y-29,4,-Math.PI/2,Math.PI/2),null,'#a9ae83',1.5);
    tuft(x-68,y,.8);tuft(x+83,y,.8);
  }
  function walker(snapshot,time,fallAge,reducedMotion) {
    const x=snapshot.actor.x,walking=snapshot.status==='running',lost=snapshot.status==='lost';
    const phase=walking&&!reducedMotion?Math.sin(snapshot.tick*.15):0;
    const fall=lost&&snapshot.reason==='fall'?(reducedMotion?65:Math.min(fallAge*220,160)):0;
    ctx.save();ctx.translate(x,(snapshot.actor.y??440)+fall);if(fall)ctx.rotate(Math.min(fallAge*.6,.5));
    ellipse(0,3,19,4,0,'#58714825');
    const leg=(offset,delta)=>{line(offset,-19,offset+delta,-4,'#788b75',7);line(offset+delta-2,-3,offset+delta+8,-3,'#8f785d',5);};
    leg(-5,-phase*6);leg(5,phase*6);
    rect(-21,-44,14,25,5,'#a0ae7c','#758b62');rect(-19,-36,10,10,3,'#b9c293');
    rect(-13,-42,25,27,6,'#eee3c3','#a9aa82');
    line(-4,-39,-6,-20,'#98a77f',3);circle(6,-23,1.5,'#9f9c70');
    // Marching arms and a loose scarf give the traveller a stubborn, comic stride.
    line(2,-35,12+phase*4,-27,'#e9dcb9',8);line(12+phase*4,-27,17+phase*5,-21,'#e4cda8',6);
    circle(0,-53,15,'#eadbb9','#a9ab81');ellipse(8,-48,3,1.8,0,'#cbab8d80');
    circle(6,-54,3.5,'#fff6df');circle(7.5,-54,1.6,'#526447');
    line(2,-61,10,-59,'#8a795e',1.7);circle(15,-50,3.1,'#e4cba5');
    path((p)=>{p.moveTo(6,-44);p.quadraticCurveTo(10,-41,13,-45);},null,'#977c62',1.3);
    path((p)=>{p.moveTo(-16,-60);p.quadraticCurveTo(-15,-77,-1,-77);p.quadraticCurveTo(12,-78,14,-63);p.closePath();},'#c3916a','#a27e5a',1);
    path((p)=>{p.moveTo(-15,-62);p.quadraticCurveTo(3,-66,22,-60);p.quadraticCurveTo(17,-57,7,-59);},'#bc855e','#a27e5a',1);
    path((p)=>{p.moveTo(-10,-41);p.lineTo(-28,-32+phase*2);p.lineTo(-22,-42+phase*2);p.lineTo(-11,-45);p.closePath();},'#c98b6a');line(-8,-42,7,-40,'#c98b6a',5);
    if(!lost){
      const bob=reducedMotion?0:Math.sin(time*2)*2;
      ctx.save();rect(-22,-111+bob,52,23,8,'#faf5e3ee','#bfca9f');
      path((p)=>{p.moveTo(-2,-89+bob);p.lineTo(1,-82+bob);p.lineTo(7,-89+bob);},'#faf5e3ee','#bfca9f',1);
      ctx.textAlign='center';ctx.fillStyle='#778b5d';ctx.font='11px "Microsoft YaHei", sans-serif';ctx.fillText(snapshot.status==='won'?'到了！':'那里！',4,-95+bob);ctx.restore();
    }
    ctx.restore();
  }
  // 轿厢当前楼层：由 lifts 声明决定，渲染与内核读的是同一份数据。
  function carFloorOf(e){
    const t=e.lifts;if(!t)return e.y??440;
    return e.state===t.upperState?(t.upperY??300):(t.lowerY??440);
  }
  // 画法名 → 图元。新增类型可以复用已有画法（比如 art:'gate'），也可以不声明。
  const ART = {
    lever, fan, gate, plate, axe, hammer, key, lift, guard, crusher,
    switch: lever, hazard: fan,
  };
  return {
    draw(level,snapshot,{time=0,fallAge=0,reducedMotion=false}={}) {
      ctx.setTransform(canvas.width/1200,0,0,canvas.height/640,0,0);ctx.clearRect(0,0,1200,640);
      background(time);
      tree(47,433,.9);tree(1170,435,.8);
      for(const p of level.platforms)platform(p);
      for(const s of level.stairs??[])stairs(s);
      const isGround=(e)=>Boolean(e.ground);
      const floorOf=(e)=>e.lifts?carFloorOf(e):(e.y??440);
      const hidden=(e)=>Array.isArray(e.hiddenStates)&&e.hiddenStates.includes(e.state);
      for(const e of Object.values(snapshot.entities))if(isGround(e)&&!hidden(e))bridge(e);
      ctx.save();ctx.translate(0,(level.goal.y??440)-440);destination(level.goal);ctx.restore();
      for(const e of Object.values(snapshot.entities)){
        if(isGround(e)||hidden(e))continue;
        ctx.save();ctx.translate(0,floorOf(e)-440);
        artFor(e)(e, snapshot.tick/60);
        ctx.restore();
      }
      walker(snapshot,time,fallAge,reducedMotion);
      // Foreground wildflowers, only on actual ground.
      for(const x of [156,205,701,867,1037])if(level.platforms.some(p=>x>p.x+15&&x<p.x+p.width-15)){
        tuft(x,443,.7);line(x+10,441,x+8,424,'#7f9669',1.2);circle(x+8,422,3.2,'#e7ddad');circle(x+8,422,1,'#bca773');
      }
      if(snapshot.status==='won')for(let i=0;i<9;i++)star(level.goal.x-60+noise(i+9)*110,310+noise(i+20)*80,3+noise(i)*3,'#bdad6a');
    },
    destroy(){observer.disconnect();},
  };
}
