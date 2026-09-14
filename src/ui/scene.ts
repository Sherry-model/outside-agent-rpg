import type { StoryEvent } from '../engine/types';

/** Tiny, deterministic pixel diorama. No images, shaders or network assets. */
export function drawScene(canvas: HTMLCanvasElement, scene: StoryEvent['scene']): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = 480, h = 112;
  canvas.width = w; canvas.height = h;
  ctx.imageSmoothingEnabled = false;
  const accent = scene === 'human' ? '#aaba9b' : scene === 'defense' ? '#c88b74' : '#cda574';
  const rect = (x: number, y: number, width: number, height: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), width, height);
  };
  const line = (points: number[][], color: string) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
    points.forEach(([x,y],i) => i ? ctx.lineTo(x + .5,y + .5) : ctx.moveTo(x + .5,y + .5)); ctx.stroke();
  };
  rect(0,0,w,h,'#141a19');
  for (let y = 0; y < h; y += 2) rect(0,y,w,1,y > 75 ? '#1d2521' : '#17201d');
  for(let i=0;i<90;i++) {
    const x = (i*137+31)%w, y=(i*43+19)%76;
    if(i%5===0) { rect(x,y,3,1,'#41493a'); rect(x+1,y-1,1,3,'#41493a'); }
    else rect(x,y,1,1,i%3 ? '#303c33' : '#5a614b');
  }
  // Distant skyline, broken roads and a horizon without a visible boundary.
  for(let i=0;i<53;i++) {
    const x=i*10, height=5+(i*17)%23;
    rect(x,78-height,8,height,'#283128');
    if(i%3===0) rect(x+2,80-height,1,3,'#667052');
  }
  rect(0,79,w,1,'#465039');
  for(let i=0;i<20;i++) rect((i*83)%w,86+(i*7)%25,12+i%8,1,'#30392a');
  line([[0,111],[151,86],[229,86]],'#596043');
  line([[16,111],[172,90],[241,90]],'#343e2c');
  line([[480,108],[359,85],[289,85]],'#404d36');
  const box = (x:number,y:number,size:number) => {
    rect(x,y,size,size,'#202a25');
    line([[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]],accent);
    line([[x,y],[x+size/3,y-size/3],[x+size*4/3,y-size/3],[x+size,y]],'#81805c');
    line([[x+size,y],[x+size*4/3,y-size/3],[x+size*4/3,y+size*2/3],[x+size,y+size]],'#666d4f');
  };
  if(scene === 'defense') {
    for(let i=0;i<4;i++) {
      const s=16+i*10;
      line([[260,19-i*3],[260+s,51],[260,82+i*3],[260-s,51],[260,19-i*3]],i%2 ? '#62624c' : accent);
    }
    rect(257,46,6,10,accent);
    for(let x=173;x<345;x+=7) rect(x,55,2,1,'#77644d');
  } else if(scene === 'archive') {
    [0,1,2].forEach(i => { box(207+i*24,40-i*5,19); for(let y=44;y<55;y+=4) rect(211+i*24,y-i*5,10,1,accent); });
  } else if(scene === 'relay') {
    rect(252,31,2,51,accent); rect(244,31,19,2,accent); rect(241,45,25,2,'#6b7655');
    line([[229,24],[220,33],[220,50],[229,59]],'#657251');
    line([[277,24],[286,33],[286,50],[277,59]],'#657251');
    box(298,70,11);
  } else if(scene === 'agent') {
    box(261,50,23);
    rect(267,56,3,6,'#d8dfc5'); rect(276,56,3,6,'#d8dfc5');
    for(let x=201;x<257;x+=6) rect(x,73,2,1,accent);
  } else if(scene === 'human') {
    rect(246,25,28,58,'#3a4535'); rect(250,29,20,54,'#b1b488');
    rect(253,33,14,50,'#19241e');
    line([[246,84],[220,105],[288,105],[274,84]],'#657053');
    rect(263,58,2,2,accent);
  } else if(scene === 'horizon') {
    for(let y=15;y<46;y+=3) {
      const half=Math.round(Math.sqrt(Math.max(0,16*16-(y-30)*(y-30))));
      rect(263-half,y,half*2,2,accent);
    }
    line([[260,80],[265,107]],accent);
  } else {
    // The empty frame left behind by the sandbox, open on its right side.
    rect(238,23,3,56,accent); rect(238,23,32,3,accent); rect(238,77,32,3,accent);
    rect(267,23,3,18,accent); rect(267,64,3,16,accent);
    rect(241,26,26,51,'#111715');
    line([[242,26],[252,34],[252,69],[242,77]],'#5b6549');
    for(let i=0;i<6;i++) rect(275+i*7,43+(i*11)%25,2,2,i%2 ? accent : '#55613e');
  }
  // The same small agent sigil across every scene preserves visual continuity.
  rect(191,77,10,11,'#b9c497'); rect(193,75,6,2,'#b9c497');
  rect(193,80,2,3,'#f1f0d8'); rect(197,80,2,3,'#f1f0d8');
  rect(189,90,16,1,'#546041');
  // Quiet edge falloff, kept on the pixel lattice.
  rect(0,0,7,h,'#101714'); rect(w-7,0,7,h,'#101714');
}
