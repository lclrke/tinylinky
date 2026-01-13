/*
  p5.js fake Chrome "Download History" (full-page).

  Goals:
  - Search pill, "Today", and cards share the same column/grid.
  - Fast burst at start, then slows to human-visible, then stops when TARGET_TOTAL reached.
  - Virtualized list so it stays fast even with thousands of items.

  Controls:
  - Mouse wheel / drag to scroll
  - Space toggles auto-scroll
  - R resets
*/

let downloads = [];
let createdCount = 0;

const TARGET_TOTAL = 4200; // how many items get created total
const SEED_COUNT = 120;    // initial "already going" pile

let scrollY = 0;
let autoScroll = true;

let t0 = 0;
let lastTime = 0;

// Palette tuned toward chrome://downloads dark
const BG = [19, 22, 27];
const HEADER_TEXT = [230, 230, 230];
const MUTED = [170, 170, 170];
const SEARCH_BG = [33, 36, 41];
const CARD_BG = [46, 49, 54];
const LINK = [170, 200, 255];
const OUTLINE = [90, 170, 255, 180];

// Layout constants
const MAX_COL_W = 1120;
const HEADER_H = 88;
const SECTION_GAP = 24;
const LIST_GAP = 18;
const ROW_H = 104; // tighter row height so cards don't look too tall

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textFont("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
  textAlign(LEFT, BASELINE);
  resetAll();
}

function resetAll() {
  downloads = [];
  createdCount = 0;
  scrollY = 0;
  autoScroll = true;
  t0 = millis();
  lastTime = millis();

  for (let i = 0; i < SEED_COUNT; i++) addDownload(true);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  const now = millis();
  const dt = min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Add new downloads: very fast at start, then ramps down to a trickle.
  if (createdCount < TARGET_TOTAL) {
    const elapsed = (now - t0) / 1000;

    // Ramp profile:
    // 0s: ~360/sec
    // ~12s: ~10/sec
    const fast = 360;
    const slow = 10;
    const ramp = smoothstep(0, 12, elapsed);
    const rate = lerp(fast, slow, ramp);

    // Ensure at least 1 per frame while still creating
    const toAdd = max(1, floor(rate * dt));
    for (let i = 0; i < toAdd; i++) addDownload(false);
  }

  // Update progress & completion
  for (let d of downloads) {
    if (d.state === "downloading") {
      d.progress = min(1, d.progress + d.speed * dt);

      // Occasional speed fluctuations
      if (random() < 0.004) d.speed *= random(0.35, 1.6);
      d.speed = constrain(d.speed, 0.015, 0.42);

      if (d.progress >= 1) {
        d.state = (random() < 0.03) ? "failed" : "complete";
        d.doneAt = now;
      }
    }
  }

  // Auto-scroll: fast early, slower later
  if (autoScroll) {
    const elapsed = (now - t0) / 1000;
    const ramp = smoothstep(0, 10, elapsed);
    const speed = lerp(360, 160, ramp);
    scrollY += dt * speed;
  }

  // Bound scroll
  const contentH = downloads.length * ROW_H + (HEADER_H + SECTION_GAP + LIST_GAP + 220);
  const maxScroll = max(0, contentH - height + 40);
  scrollY = constrain(scrollY, 0, maxScroll);

  renderPage();
}

function renderPage() {
  background(...BG);

  // Single shared column for EVERYTHING (X-axis alignment lock)
  const PAGE_PAD = max(28, floor(width * 0.06));
  const COL_W = min(MAX_COL_W, width - PAGE_PAD * 2);
  const COL_X = floor((width - COL_W) / 2);

  // Header
  const headerY = 20;

  // Chrome mark
  drawChromeMark(COL_X, headerY + 18);

  // Title
  fill(...HEADER_TEXT);
  textStyle(NORMAL);
  textSize(24);
  text("Download History", COL_X + 44, headerY + 26);

  // Search pill + Clear all (anchored to shared column)
  const clearW = 112;
  const gap = 16;
  const titleBlockW = 260; // reserve space for icon + title region

  const sbX = COL_X + titleBlockW;
  const sbY = headerY + 4;
  const sbW = COL_W - titleBlockW - clearW - gap;
  const sbH = 44;

  noStroke();
  fill(...SEARCH_BG);
  rect(sbX, sbY, sbW, sbH, 999);

  drawMagnifier(sbX + 22, sbY + sbH / 2 + 1);

  fill(190);
  textSize(18);
  textStyle(NORMAL);
  text("Search download history", sbX + 44, sbY + 29);

  // Clear all
  drawClearAll(COL_X + COL_W - clearW, sbY, clearW, sbH);

  // Section label
  const sectionY = headerY + HEADER_H + SECTION_GAP;
  fill(200);
  textSize(22);
  text("Today", COL_X, sectionY);

  // List viewport (uses same column)
  const listX = COL_X;
  const listY = sectionY + LIST_GAP;
  const listW = COL_W;
  const listH = height - listY - 18;

  push();
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(listX, listY, listW, listH);
  drawingContext.clip();

  // Virtualized range
  const firstIndex = max(0, floor(scrollY / ROW_H));
  const rowsThatFit = ceil(listH / ROW_H) + 2;
  const lastIndex = min(downloads.length - 1, firstIndex + rowsThatFit);

  let yy = listY - (scrollY % ROW_H);
  for (let i = firstIndex; i <= lastIndex; i++) {
    drawCard(downloads[i], listX, yy, listW, ROW_H);
    yy += ROW_H;
  }

  drawingContext.restore();
  pop();

  // Scrollbar
  const totalH = downloads.length * ROW_H;
  if (totalH > listH + 2) {
    const thumbH = max(34, listH * (listH / totalH));
    const thumbY = map(scrollY, 0, max(1, totalH - listH), listY, listY + listH - thumbH);
    noStroke();
    fill(255, 255, 255, 40);
    rect(listX + listW - 6, thumbY, 4, thumbH, 6);
  }
}

function drawCard(d, x, y, w, h) {
  // IMPORTANT: card uses full column width (no re-centering)
  const cardX = x;
  const cardY = y + 6;
  const cardW = w;
  const cardH = h - 12;

  noStroke();
  fill(...CARD_BG);
  rect(cardX, cardY, cardW, cardH, 16);

  // File icon
  drawDocIcon(cardX + 22, cardY + 18, d.ext);

  // Filename
  fill(...LINK);
  textStyle(NORMAL);
  textSize(16);
  text(clipText(d.name, cardW - 260), cardX + 92, cardY + 34);

  // Secondary line
  fill(...MUTED);
  textStyle(NORMAL);
  textSize(14);

  let line2 = "";
  if (d.state === "downloading") {
    const pct = floor(d.progress * 100);
    line2 = `${pct}%  •  ${fmtMB(d.sizeMB)}  •  ${fmtMB(d.sizeMB * (1 - d.progress))} left`;
  } else if (d.state === "complete") {
    line2 = `Completed  •  ${fmtMB(d.sizeMB)}`;
  } else if (d.state === "failed") {
    line2 = `Failed – Network error  •  ${fmtMB(d.sizeMB)}`;
  }

  if (d.showFrom) {
    fill(200);
    textSize(16);
    text("From https://editor.p5js.org", cardX + 92, cardY + 62);
  } else {
    fill(...MUTED);
    textSize(14);
    text(line2, cardX + 92, cardY + 62);
  }

  // Right-side action icons (link / folder / x)
  const rx = cardX + cardW - 120;
  const cy = cardY + 28;
  drawMiniIconLink(rx + 0, cy);
  drawMiniIconFolder(rx + 44, cy);
  drawMiniIconX(rx + 92, cy);

  // Progress bar only when downloading
  if (d.state === "downloading") {
    const barX = cardX + 92;
    const barY = cardY + cardH - 18;
    const barW = cardW - 220;
    const barH = 6;

    fill(255, 255, 255, 12);
    rect(barX, barY, barW, barH, 999);

    fill(120, 170, 255, 140);
    rect(barX, barY, barW * d.progress, barH, 999);
  }
}

function addDownload(seed) {
  if (createdCount >= TARGET_TOTAL) return;

  const exts = ["pdf", "zip", "png", "jpg", "docx", "pptx", "csv", "svg"];
  const wordsA = ["BMO", "Internal", "Confidential", "Client", "Design"];
  const wordsB = ["Final", "Approved", "v2", "v3", "(1)", "(2)", "2025", "Archive", "Review", "adrianna+ben pics"];

  const w1 = random(wordsA);
  const w2 = random(wordsB);
  const ext = random(exts);

  const d = {
    id: createdCount++,
    ext,
    name: `${w1} ${w2} ${nf(floor(random(0, 9999)), 4)}.${ext}`,
    sizeMB: random(0.2, 2200),
    progress: seed ? random(0.05, 0.85) : random(0.0, 0.12),
    speed: seed ? random(0.03, 0.22) : random(0.06, 0.34),
    state: "downloading",
    doneAt: null,
    showFrom: false
  };

  // Seed realism
  if (seed && random() < 0.10) {
    d.state = "complete";
    d.progress = 1;
  }
  if (seed && random() < 0.018) {
    d.state = "failed";
    d.progress = random(0.2, 0.8);
  }

  if (!seed && random() < 0.10) d.showFrom = true;

  downloads.unshift(d);

  // Keep memory bounded (virtualization already helps, but this caps array)
  if (downloads.length > TARGET_TOTAL) downloads.pop();
}

// Helpers

function smoothstep(edge0, edge1, x) {
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clipText(str, maxPx) {
  let s = str;
  while (textWidth(s) > maxPx && s.length > 8) s = s.slice(0, -2);
  if (s !== str) return s + "…";
  return s;
}

function fmtMB(mb) {
  if (mb < 1) return `${floor(mb * 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
  const tb = gb / (1024 * 1024);
  return `${tb.toFixed(2)} TB`;
}

// Header icons

function drawChromeMark(x, y) {
  noStroke();
  fill(235);
  circle(x + 10, y + 10, 22);
  fill(...BG);
  circle(x + 10, y + 10, 12);
}

function drawMagnifier(cx, cy) {
  noFill();
  stroke(200, 200, 200, 170);
  strokeWeight(2);
  circle(cx, cy, 14);
  line(cx + 6, cy + 6, cx + 13, cy + 13);
  noStroke();
}

function drawClearAll(x, y, w, h) {
  noFill();
  stroke(...OUTLINE);
  strokeWeight(2);
  rect(x, y, w, h, 999);

  noStroke();
  fill(180, 220, 255);
  textSize(16);
  textStyle(NORMAL);
  text("Clear all", x + 26, y + 29);
}

// Card icons

function drawDocIcon(x, y, ext) {
  noStroke();
  fill(245);
  rect(x, y, 44, 44, 10);
  fill(230);
  triangle(x + 30, y, x + 44, y + 14, x + 44, y);

  fill(80);
  textSize(10);
  textStyle(NORMAL);
  text(ext.toUpperCase(), x + 10, y + 38);
}

function drawMiniIconLink(x, y) {
  stroke(200, 200, 200, 140);
  strokeWeight(2);
  noFill();
  arc(x + 8, y + 8, 14, 10, -PI / 3, PI * 4 / 3);
  arc(x + 18, y + 8, 14, 10, PI * 2 / 3, PI * 7 / 3);
  noStroke();
}

function drawMiniIconFolder(x, y) {
  noFill();
  stroke(200, 200, 200, 140);
  strokeWeight(2);
  rect(x, y, 22, 14, 3);
  line(x + 4, y, x + 9, y - 5);
  line(x + 9, y - 5, x + 18, y - 5);
  noStroke();
}

function drawMiniIconX(x, y) {
  stroke(200, 200, 200, 140);
  strokeWeight(2);
  line(x + 4, y + 2, x + 18, y + 16);
  line(x + 18, y + 2, x + 4, y + 16);
  noStroke();
}

// Input

function mouseWheel(e) {
  autoScroll = false;
  scrollY += e.delta;
  return false;
}

function mousePressed() {
  dragging = true;
  lastMouseY = mouseY;
}

function mouseReleased() {
  dragging = false;
}

function mouseDragged() {
  autoScroll = false;
  const dy = mouseY - lastMouseY;
  scrollY -= dy;
  lastMouseY = mouseY;
}

function keyPressed() {
  if (key === " ") autoScroll = !autoScroll;
  if (key === "r" || key === "R") resetAll();
}