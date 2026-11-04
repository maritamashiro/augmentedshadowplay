// Run with: node tests/silhouette-browser.cjs (requires Playwright + Chromium).
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html');
      res.end(fs.readFileSync(pathname === '/' && process.env.STANDALONE_HTML ? process.env.STANDALONE_HTML : file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('canvas');
    await page.evaluate(() => { document.querySelector('#hand-silhouette').checked = true; startHandSilhouette(); });
    await page.waitForFunction(() => silhouetteReady || !document.querySelector('#hand-silhouette').checked, null, { timeout: 35000 });
    assert.equal(await page.evaluate(() => silhouetteReady), true,
      await page.locator('#silhouette-status').textContent());
    const result = await page.evaluate(async () => {
      const raw = [[110,182],[80,160],[61,145],[46,127],[32,111],
        [90,127],[82,92],[78,66],[76,43],[111,123],[110,80],[109,53],[108,30],
        [130,129],[137,91],[139,66],[139,45],[147,143],[162,117],[170,97],[176,78]];
      const points = raw.map(([x,y]) => ({x,y}));
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 224;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#5282bd'; ctx.fillRect(0,0,224,224);
      ctx.fillStyle = ctx.strokeStyle = '#cda078'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();ctx.moveTo(98,195);ctx.bezierCurveTo(48,177,58,148,76,132);
      ctx.lineTo(90,117);ctx.lineTo(130,118);ctx.lineTo(156,135);ctx.lineTo(145,170);
      ctx.lineTo(124,195);ctx.closePath();ctx.fill();
      ctx.lineWidth = 18;
      for (const chain of [[0,1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]]) {
        ctx.beginPath(); chain.forEach((i,j) => j ? ctx.lineTo(points[i].x,points[i].y) : ctx.moveTo(points[i].x,points[i].y));ctx.stroke();
      }
      const input = ctx.getImageData(0,0,224,224);
      const promise = new Promise((resolve,reject) => {
        const timer = setTimeout(()=>reject(new Error('No segmentation result')),10000);
        const listener = event => { if(event.data.type === 'mask' || event.data.type === 'error'){
          clearTimeout(timer);silhouetteWorker.removeEventListener('message',listener);
          event.data.type === 'error' ? reject(new Error(event.data.message)) : resolve(event.data);
        }};silhouetteWorker.addEventListener('message',listener);
      });
      silhouetteWorker.postMessage({type:'frame',width:224,height:224,points,pixels:input.data.buffer,
        roi:{x:0,y:0,width:224,height:224},videoWidth:224,videoHeight:224,capturedAt:performance.now()},[input.data.buffer]);
      const mask = await promise;
      const alpha = new Uint8ClampedArray(mask.pixels);
      const foreground = (x,y) => alpha[(y*224+x)*4+3];
      const sampled = { palm:foreground(110,155),finger:foreground(108,36),gap:foreground(94,55),
        background:foreground(10,10),edgeInside:foreground(64,163),edgeOutside:foreground(52,163) };
      // Composite a fresh mask with no video: opacity 0 must not hide the cutout.
      noLoop();cameraStream={};document.querySelector('#camera-overlay').checked=false;
      document.querySelector('#camera-opacity').value=0;lastHandSeenAt=performance.now();silhouetteFrame.capturedAt=performance.now();
      redraw();
      const light=lightCircle();const center=Array.from(drawingContext.getImageData(light.x,light.y,1,1).data);
      let exterior=0;const data=drawingContext.getImageData(0,0,width,height).data;
      for(let y=0;y<height;y+=8)for(let x=0;x<width;x+=8)if(Math.hypot(x-light.x,y-light.y)>light.radius+2){const i=4*(y*width+x);if(data[i]||data[i+1]||data[i+2])exterior++;}
      lastHandSeenAt=performance.now()-1000;redraw();
      const noHand=Array.from(drawingContext.getImageData(light.x,light.y,1,1).data);
      lastHandSeenAt=performance.now();
      document.querySelector('#hand-silhouette').checked=false;redraw();
      const hidden=Array.from(drawingContext.getImageData(light.x,light.y,1,1).data);
      const flat = new Uint8ClampedArray(224*224*4);
      for(let i=0;i<flat.length;i+=4){flat[i]=flat[i+1]=flat[i+2]=140;flat[i+3]=255;}
      const uncertain = new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('No low-contrast response')),10000);
        const listen=event=>{if(['uncertain','mask','error'].includes(event.data.type)){
          clearTimeout(timer);silhouetteWorker.removeEventListener('message',listen);resolve(event.data.type);
        }};silhouetteWorker.addEventListener('message',listen);
      });
      silhouetteWorker.postMessage({type:'frame',width:224,height:224,points,pixels:flat.buffer,
        roi:{x:0,y:0,width:224,height:224},videoWidth:224,videoHeight:224,capturedAt:performance.now()},[flat.buffer]);
      const lowContrast=await uncertain;
      stopHandSilhouette();return {sampled,center,hidden,noHand,lowContrast,exterior,stopped:silhouetteWorker===null};
    });
    assert.equal(result.sampled.palm,255);assert.equal(result.sampled.finger,255);
    assert.equal(result.sampled.background,0);assert.equal(result.sampled.gap,0);
    assert.equal(result.sampled.edgeInside,255);assert.equal(result.sampled.edgeOutside,0);
    assert.deepEqual(result.center,[0,0,0,255]);assert.deepEqual(result.hidden,[244,237,218,255]);
    assert.deepEqual(result.noHand,[244,237,218,255]);assert.equal(result.lowContrast,'uncertain');
    assert.equal(result.exterior,0);assert.equal(result.stopped,true);assert.deepEqual(errors,[]);
    console.log('PASS: real GrabCut mask follows image edges, preserves finger gaps, composites black independently of camera opacity, clips to circle and toggles off.',result);
  } finally { if(browser)await browser.close();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
