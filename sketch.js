let downloads = [];
let createdCount = 0;

const TARGET_TOTAL = 2000;
const BURST_PER_SEC = 260;

let scrollY = 0;
let autoScroll = true;
let lastTime = 0;

// Palette tuned toward chrome://downloads dark
const PAGE_BG = [32, 35, 39];
const HEADER_TEXT = [235, 235, 235];
const MUTED = [185, 185, 185];
const SEARCH_BG = [26, 29, 33];
const CARD_BG = [46, 49, 53];
const LINK = [160, 195, 255];
const OUTLINE = [90, 160, 255, 180];

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
  resetAll();
}

function resetAll() {
  downloads = [];
  createdCount = 0;
  scrollY = 0;
  autoScroll = true;
  lastTime = millis();

  // Seed a bunch so it looks “already happening”
  for (let i = 0; i < 140; i++) addDownload(true);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  const now = millis();
  const dt = min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // Create new downloads quickly
  if (createdCount < TARGET_TOTAL) {
    const toAdd = floor(BURST_PER_SEC * dt);
    for (let i = 0; i < toAdd; i++) addDownload(false);
  }

  // Update progress
  for (let d of downloads) {
    if (d.state === "downloading") {
      d.progress = min(1, d.progress + d.speed * dt);
      if (random() < 0.004) d.speed *= random(0.25, 1.8);
      d.speed = constrain(d.speed, 0.01, 0.45);

      if (d.progress >= 1) {
        d.state = (random() < 0.03) ? "failed" : "complete";
      }
    }
  }

  if (autoScroll) scrollY += dt * 240;

  const contentH = downloads.length * rowH() + 260;
  const maxScroll = max(0, contentH - height + 40);
  scrollY = constrain(scrollY, 0, maxScroll);

  renderDownloadsPage();
}

function renderDownloadsPage() {
  background(...PAGE_BG);

  const leftPad = clamp(width * 0.06, 44, 86);
  const rightPad = leftPad;

  // Header
  const headerTop = 18;
  const titleY = 58;

  // Left icon (simple circle badge)
  drawBadgeIcon(leftPad - 34, titleY - 12);

  // Title (Chrome-ish sizing)
  fill(...HEADER_TEXT);
  textStyle(NORMAL);
  textSize(24);
  text("Download History", leftPad, titleY);

  // Search bar
  const sbW = min(980, width * 0.58);
  const sbH = 44;
  const sbX = leftPad + 320;
  const sbY = headerTop + 10;

  noStroke();
  fill(...SEARCH_BG);
  rect(sbX, sbY, sbW, sbH, 24);

  drawMagnifier(sbX + 20, sbY + 22);

  fill(180);
  textStyle(NORMAL);
  textSize(14);
  text("Search download history", sbX + 44, sbY + 28);

  // Clear all button
  const btnW = 96, btnH = 38;
  const btnX = width - rightPad - btnW;
  const btnY = headerTop + 14;

  noFill();
  stroke(...OUTLINE);
  rect(btnX, btnY, btnW, btnH, 19);
  noStroke();

  fill(140, 200, 255);
  textStyle(BOLD);
  textSize(14);
  text("Clear all", btnX + 18, btnY + 25);

  // Section label
  const sectionY = 130;
  fill(210);
  textStyle(NORMAL);
  textSize(16);
  text("Today", leftPad, sectionY);

  // List area
  const listX = leftPad;
  const listY = sectionY + 18;
  const listW = width - leftPad - rightPad;
  const listH = height - listY - 22;

  push();
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(listX, listY, listW, listH);
  drawingContext.clip();

  const rh = rowH();
  const firstIndex = max(0, floor(scrollY / rh));
  const rowsThatFit = ceil(listH / rh) + 2;
  const lastIndex = min(downloads.length - 1, firstIndex + rowsThatFit);

  let yy = listY - (scrollY % rh);
  for (let i = firstIndex; i <= lastIndex; i++) {
    drawCard(downloads[i], listX, yy, listW, rh);
    yy += rh;
  }

  drawingContext.restore();
  pop();

  // Subtle scrollbar
  const totalH = downloads.length * rh;
  const thumbH = max(26, listH * (listH / max(listH, totalH)));
  const thumbY = map(scrollY, 0, max(1, totalH - listH), listY, listY + listH - thumbH);
  noStroke();
  fill(255, 255, 255, 40);
  rect(listX + listW - 4, thumbY, 3, thumbH, 6);
}

function drawCard(d, x, y, w, h) {
  // Center cards like chrome://downloads (big gutters left/right)
  const cardW = min(980, w * 0.72);
  const cardX = x + (w - cardW) / 2;
  const cardY = y + 10;
  const cardH = h - 18;

  // Shadow
  noStroke();
  fill(0, 0, 0, 35);
  rect(cardX, cardY + 2, cardW, cardH, 12);

  // Card
  fill(...CARD_BG);
  rect(cardX, cardY, cardW, cardH, 12);

  // File icon
  drawFileIcon(cardX + 28, cardY + 26);

  // Filename (link blue)
  fill(...LINK);
  textStyle(NORMAL);
  textStyle(NORMAL);
  text(clipText(d.name, cardW - 260), cardX + 92, cardY + 40);

  // Optional "From ..." line
  if (d.showFrom) {
    fill(...MUTED);
    textStyle(NORMAL);
    textSize(14);
    text("From https://editor.p5js.org", cardX + 92, cardY + 70);
  }

  // Right-side actions: link, folder, x
  const rx = cardX + cardW - 116;
  const cy = cardY + 38;
  drawActionIcon(rx + 0, cy, "link");
  drawActionIcon(rx + 42, cy, "folder");
  drawActionIcon(rx + 84, cy, "x");

  // Progress bar when downloading
  if (d.state === "downloading") {
    const barX = cardX + 92;
    const barY = cardY + cardH - 16;
    const barW = cardW - 240;
    const barH = 6;

    fill(255, 255, 255, 20);
    rect(barX, barY, barW, barH, 99);

    fill(130, 190, 255, 170);
    rect(barX, barY, barW * d.progress, barH, 99);
  }
}

function rowH() {
  return 132;
}

// ---------- Fake download generator ----------
function addDownload(seed) {
  if (createdCount >= TARGET_TOTAL) return;

  const exts = ["pdf", "zip", "png", "jpg", "docx", "pptx", "csv"];

  const wordsA = ["BMO", "Internal", "Confidential", "Client", "Design"];
  const wordsB = ["Final", "Approved", "v2", "v3", "(1)", "(2)", "2025", "Archive", "Review", "adrianna+ben pics"];

  const w1 = random(wordsA);
  const w2 = random(wordsB);
  const ext = random(exts);

  const d = {
    id: createdCount++,
    name: `${w1} ${w2} ${nf(floor(random(0, 9999)), 4)}.${ext}`,
    progress: seed ? random(0.05, 0.85) : random(0.0, 0.12),
    speed: seed ? random(0.03, 0.25) : random(0.08, 0.38),
    state: "downloading",
    showFrom: random() < 0.18
  };

  if (seed && random() < 0.08) {
    d.state = "complete";
    d.progress = 1;
  }
  if (seed && random() < 0.015) {
    d.state = "failed";
    d.progress = random(0.2, 0.8);
  }

  downloads.unshift(d);
  if (downloads.length > TARGET_TOTAL) downloads.pop();
}

// ---------- Input ----------
let dragging = false;
let lastMouseY = 0;

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

// ---------- Helpers / drawing ----------
function clipText(str, maxPx) {
  let s = str;
  while (textWidth(s) > maxPx && s.length > 8) s = s.slice(0, -2);
  if (s !== str) return s + "…";
  return s;
}

function clamp(v, a, b) {
  return max(a, min(b, v));
}

function drawBadgeIcon(x, y) {
  noStroke();
  fill(235);
  circle(x, y, 28);
  fill(...PAGE_BG);
  circle(x, y, 12);
}

function drawMagnifier(x, y) {
  noFill();
  stroke(170);
  strokeWeight(2);
  circle(x, y, 12);
  line(x + 7, y + 7, x + 14, y + 14);
  noStroke();
}

function drawFileIcon(x, y) {
  noStroke();
  fill(240);
  rect(x, y, 26, 34, 4);
  fill(210);
  triangle(x + 18, y, x + 26, y + 8, x + 26, y);
  fill(60, 70, 80, 120);
  rect(x + 6, y + 10, 14, 3, 2);
  rect(x + 6, y + 16, 10, 3, 2);
}

function drawActionIcon(x, y, kind) {
  fill(255, 255, 255, 35);
  circle(x, y, 22);

  stroke(255, 255, 255, 120);
  strokeWeight(2);
  noFill();

  if (kind === "link") {
    arc(x - 3, y, 10, 10, -0.8, 2.3);
    arc(x + 3, y, 10, 10, 2.3, 5.9);
  } else if (kind === "folder") {
    rect(x - 7, y - 4, 14, 10, 2);
    line(x - 7, y - 4, x - 2, y - 8);
    line(x - 2, y - 8, x + 7, y - 8);
  } else if (kind === "x") {
    line(x - 5, y - 5, x + 5, y + 5);
    line(x + 5, y - 5, x - 5, y + 5);
  }

  noStroke();
}