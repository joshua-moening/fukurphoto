/* ============================================================
   FUKURPHOTO — p5.js drag/drop + random glitch filter pipeline
   ============================================================ */

const BOX = 500;            // working canvas size (square)
let original = null;        // untouched, resized-to-fit source image
let working  = null;        // filtered copy currently on screen
let hasImage = false;

function setup(){
  const cnv = createCanvas(BOX, BOX);
  cnv.parent('sketch-holder');
  cnv.drop(gotFile);
  imageMode(CENTER);
  noLoop();
  redraw();

  select('#fukitBtn').mousePressed(fukit);
}

function draw(){
  background(110); // --canvas-idle equivalent
  if (hasImage && working){
    push();
    drawFit(working);
    pop();
  } else {
    noStroke();
    fill(255);
    textAlign(CENTER, CENTER);
    textFont('system-ui, sans-serif');
    textSize(16);
    text('Drag an image file onto the canvas.', width/2, height/2);
  }
}

// draw img centered, scaled to fit the square canvas ("contain")
function drawFit(img){
  const s = min(BOX / img.width, BOX / img.height);
  const w = img.width * s;
  const h = img.height * s;
  image(img, width/2, height/2, w, h);
}

function gotFile(file){
  if (file.type !== 'image'){
    return;
  }
  loadImage(file.data, img => {
    // downscale large photos so pixel-level filters stay snappy
    const maxDim = 700;
    if (img.width > maxDim || img.height > maxDim){
      const s = maxDim / max(img.width, img.height);
      img.resize(floor(img.width * s), floor(img.height * s));
    }
    original = img;
    working = original.get(); // clone
    hasImage = true;
    select('#fukitBtn').removeAttribute('disabled');
    redraw();
  });
}

/* ---------------- FUKIT: random filter pipeline ---------------- */

function fukit(){
  if (!hasImage) return;

  working = original.get(); // always start fresh from the source

  const pool = [
    () => applyThreshold(working, random(90, 160)),
    () => applyPosterize(working, floor(random(3, 6))),
    () => applyChromaticAberration(working, floor(random(4, 16))),
    () => applyPixelSort(working, random(80, 160), random() < 0.5),
    () => applyTileDisplace(working, floor(random(12, 40)), floor(random(8, 30))),
    () => applyScanlines(working, floor(random(2, 5)), floor(random(40, 90))),
    () => applyNoiseGrain(working, floor(random(15, 40)))
  ];

  shuffle(pool, true);
  const count = floor(random(2, 4)); // 2–3 filters chained
  for (let i = 0; i < count; i++){
    pool[i]();
  }

  redraw();
}

/* ---------------- pixel filters ---------------- */

function applyThreshold(img, t = 128){
  img.loadPixels();
  const px = img.pixels;
  for (let i = 0; i < px.length; i += 4){
    const b = (px[i] + px[i+1] + px[i+2]) / 3;
    const v = b > t ? 255 : 0;
    px[i] = px[i+1] = px[i+2] = v;
  }
  img.updatePixels();
}

function applyPosterize(img, levels = 4){
  img.loadPixels();
  const px = img.pixels;
  const step = 255 / (levels - 1);
  for (let i = 0; i < px.length; i += 4){
    for (let c = 0; c < 3; c++){
      px[i+c] = round(round(px[i+c] / step) * step);
    }
  }
  img.updatePixels();
}

function applyChromaticAberration(img, offset = 6){
  img.loadPixels();
  const w = img.width, h = img.height;
  const src = img.pixels.slice();
  for (let y = 0; y < h; y++){
    for (let x = 0; x < w; x++){
      const idx = (x + y * w) * 4;
      const xr = constrain(x - offset, 0, w - 1);
      const xb = constrain(x + offset, 0, w - 1);
      const idxR = (xr + y * w) * 4;
      const idxB = (xb + y * w) * 4;
      img.pixels[idx]   = src[idxR];       // R shifted
      img.pixels[idx+2] = src[idxB + 2];   // B shifted
      // G channel (idx+1) stays put
    }
  }
  img.updatePixels();
}

function applyPixelSort(img, threshold = 100, vertical = false){
  img.loadPixels();
  const w = img.width, h = img.height;
  const px = img.pixels;
  const lines  = vertical ? w : h;
  const length = vertical ? h : w;

  for (let L = 0; L < lines; L++){
    let run = [];
    let runStart = 0;

    for (let p = 0; p <= length; p++){
      let inside = false, idx = 0, br = 0;

      if (p < length){
        const x = vertical ? L : p;
        const y = vertical ? p : L;
        idx = (x + y * w) * 4;
        br = (px[idx] + px[idx+1] + px[idx+2]) / 3;
        inside = br > threshold;
      }

      if (inside){
        run.push({ r: px[idx], g: px[idx+1], b: px[idx+2], a: px[idx+3], br });
      } else {
        if (run.length > 1){
          run.sort((a, b) => a.br - b.br);
          for (let k = 0; k < run.length; k++){
            const pp = runStart + k;
            const xx = vertical ? L : pp;
            const yy = vertical ? pp : L;
            const ii = (xx + yy * w) * 4;
            px[ii]   = run[k].r;
            px[ii+1] = run[k].g;
            px[ii+2] = run[k].b;
            px[ii+3] = run[k].a;
          }
        }
        run = [];
        runStart = p + 1;
      }
    }
  }
  img.updatePixels();
}

function applyTileDisplace(img, tileSize = 20, maxOffset = 15){
  img.loadPixels();
  const w = img.width, h = img.height;
  const src = img.pixels.slice();
  const px = img.pixels;

  for (let ty = 0; ty < h; ty += tileSize){
    for (let tx = 0; tx < w; tx += tileSize){
      const ox = floor(random(-maxOffset, maxOffset));
      const oy = floor(random(-maxOffset, maxOffset));
      for (let y = ty; y < min(ty + tileSize, h); y++){
        for (let x = tx; x < min(tx + tileSize, w); x++){
          const sx = constrain(x + ox, 0, w - 1);
          const sy = constrain(y + oy, 0, h - 1);
          const di = (x + y * w) * 4;
          const si = (sx + sy * w) * 4;
          px[di]   = src[si];
          px[di+1] = src[si+1];
          px[di+2] = src[si+2];
          px[di+3] = src[si+3];
        }
      }
    }
  }
  img.updatePixels();
}

function applyScanlines(img, spacing = 3, darken = 80){
  img.loadPixels();
  const w = img.width, h = img.height;
  const px = img.pixels;
  for (let y = 0; y < h; y++){
    if (y % spacing === 0){
      for (let x = 0; x < w; x++){
        const idx = (x + y * w) * 4;
        px[idx]   = max(0, px[idx]   - darken);
        px[idx+1] = max(0, px[idx+1] - darken);
        px[idx+2] = max(0, px[idx+2] - darken);
      }
    }
  }
  img.updatePixels();
}

function applyNoiseGrain(img, amount = 30){
  img.loadPixels();
  const px = img.pixels;
  for (let i = 0; i < px.length; i += 4){
    const n = random(-amount, amount);
    px[i]   = constrain(px[i]   + n, 0, 255);
    px[i+1] = constrain(px[i+1] + n, 0, 255);
    px[i+2] = constrain(px[i+2] + n, 0, 255);
  }
  img.updatePixels();
}