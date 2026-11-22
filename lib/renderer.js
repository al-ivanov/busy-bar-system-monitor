/**
 * Renderer for BUSY Bar 72x16 LED front display
 * and optional 160x80 OLED back display
 */

export function getColorForPct(pct) {
  if (pct >= 90) return '#E60022FF'; // Red
  if (pct >= 70) return '#F59E0BFF'; // Amber / Orange
  return '#22C55EFF';                // Green
}

export function getColorForTemp(degC) {
  if (degC >= 85) return '#E60022FF';
  if (degC >= 70) return '#F59E0BFF';
  return '#22C55EFF';
}

export function formatNetRate(bytesPerSec) {
  const G = 1024 * 1024 * 1024;
  const M = 1024 * 1024;
  const K = 1024;

  if (bytesPerSec >= G) {
    const val = bytesPerSec / G;
    return val < 10 ? `${val.toFixed(1)}G` : `${Math.round(val)}G`;
  }
  if (bytesPerSec >= M) {
    const val = bytesPerSec / M;
    return val < 10 ? `${val.toFixed(1)}M` : `${Math.round(val)}M`;
  }
  if (bytesPerSec >= K) {
    const val = bytesPerSec / K;
    return val < 10 ? `${val.toFixed(1)}K` : `${Math.round(val)}K`;
  }
  return `${Math.round(bytesPerSec)}B`;
}

/**
 * Generate 72x16 Front Screen elements
 *
 * Screen dimensions: 72x16
 * 3 rows:
 * - Row 1: y = 0
 * - Row 2: y = 5
 * - Row 3: y = 10
 */
export function renderFrontDisplay(rows) {
  const elements = [];

  // 0. Fullscreen background with no border (border_width: 0)
  elements.push({
    id: 'bg',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 72,
    height: 16,
    border_width: 0,
    fill: 'solid',
    fill_colors: ['#000000FF'],
    display: 'front',
  });

  const rowY = [0, 5, 10];

  rows.slice(0, 3).forEach((item, index) => {
    const y = rowY[index];
    const key = item.label.toLowerCase();
    const pct = Math.max(0, Math.min(100, item.pct));
    const fraction = pct / 100;
    const color = item.color || getColorForPct(pct);

    // 1. Label (left-aligned at x=0)
    elements.push({
      id: `${key}_lbl`,
      type: 'text',
      text: item.label,
      x: 0,
      y,
      font: 'tiny',
      color: '#FFFFFFFF',
      display: 'front',
    });

    // 2. Bar Outline (box at x=17, width=31, height=5)
    elements.push({
      id: `${key}_box`,
      type: 'rectangle',
      x: 17,
      y,
      width: 31,
      height: 5,
      border_width: 1,
      border_color: '#505050FF',
      display: 'front',
    });

    // 3. Bar Fill (interior is 29px wide, 3px tall)
    const fillWidth = Math.round(29 * fraction);
    if (fillWidth >= 1) {
      elements.push({
        id: `${key}_bar`,
        type: 'rectangle',
        x: 18,
        y: y + 1,
        width: fillWidth,
        height: 3,
        border_width: 0,
        fill: 'solid',
        fill_colors: [color],
        display: 'front',
      });
    }

    // 4. Value string (right-aligned at x=71)
    elements.push({
      id: `${key}_val`,
      type: 'text',
      text: item.valueStr,
      x: 71,
      y,
      font: 'tiny',
      align: 'top_right',
      color,
      display: 'front',
    });
  });

  return elements;
}

/**
 * Generate 160x80 Back OLED Display elements
 */
export function renderBackDisplay(info) {
  const elements = [];

  // Title: Hostname
  elements.push({
    id: 'back_title',
    type: 'text',
    text: (info.hostName || 'System Monitor').toUpperCase(),
    x: 4,
    y: 4,
    font: 'bold',
    color: '#FFFFFFFF',
    display: 'back',
  });

  // Subtitle / Uptime
  const hours = Math.floor(info.uptimeSec / 3600);
  const mins = Math.floor((info.uptimeSec % 3600) / 60);
  elements.push({
    id: 'back_uptime',
    type: 'text',
    text: `Up: ${hours}h ${mins}m`,
    x: 4,
    y: 18,
    font: 'small',
    color: '#888888FF',
    display: 'back',
  });

  // Separator line
  elements.push({
    id: 'back_line',
    type: 'rectangle',
    x: 4,
    y: 30,
    width: 152,
    height: 1,
    fill: 'solid',
    fill_colors: ['#444444FF'],
    display: 'back',
  });

  // Details lines
  let curY = 36;
  (info.details || []).slice(0, 3).forEach((item, i) => {
    elements.push({
      id: `back_d_${i}`,
      type: 'text',
      text: `${item.label}: ${item.valueStr}`,
      x: 4,
      y: curY,
      font: 'small',
      color: '#CCCCCCFF',
      display: 'back',
    });
    curY += 13;
  });

  return elements;
}
