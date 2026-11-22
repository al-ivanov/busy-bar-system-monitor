/**
 * System Monitor — On-Device BUSY Bar Application
 *
 * Runs inside BUSY Bar (JerryScript) in the APPS menu.
 * Communicates with the Host System Monitor agent over HTTP
 * and renders live stats on the 72x16 LED display.
 *
 * Controls:
 * - Encoder wheel (turn or click OK): Switch between Load % and Temperatures (CPU/GPU)
 * - Back button (short press): Exit app
 */

var APP_ID = 'app.system.monitor';

function getColorForPct(pct) {
  if (pct >= 90) return '#E60022FF'; // Red
  if (pct >= 70) return '#F59E0BFF'; // Amber
  return '#22C55EFF';                // Green
}

function getColorForTemp(degC) {
  if (degC >= 85) return '#E60022FF'; // Red
  if (degC >= 70) return '#F59E0BFF'; // Amber
  return '#22C55EFF';                // Green
}

function formatNetRate(bytesPerSec) {
  var K = 1024;
  var M = K * 1024;
  var G = M * 1024;

  if (bytesPerSec >= G) {
    return Math.round(bytesPerSec / G) + 'G';
  }
  if (bytesPerSec >= M) {
    return Math.round(bytesPerSec / M) + 'M';
  }
  if (bytesPerSec >= K) {
    return Math.round(bytesPerSec / K) + 'K';
  }
  return Math.round(bytesPerSec) + 'B';
}

function buildDisplayElements(data, screen) {
  var elements = [];

  // 0. Solid black background with no border (border_width: 0)
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

  var rows = [];

  if (screen === 1) {
    // -----------------------------------------------------------------------
    // Screen 1: Temperatures (CPU & GPU)
    // -----------------------------------------------------------------------
    var cpuT = typeof data.cpuTemp === 'number' ? data.cpuTemp : (typeof data.temp === 'number' ? data.temp : null);
    var gpuT = typeof data.gpuTemp === 'number' ? data.gpuTemp : null;
    var ram = typeof data.ram === 'number' ? data.ram : 0;

    // Row 1: CPU Temp
    if (cpuT !== null) {
      rows.push({
        label: 'CPU',
        pct: Math.max(0, Math.min(100, cpuT)),
        val: cpuT + 'C',
        color: getColorForTemp(cpuT),
      });
    } else {
      var cpu = typeof data.cpu === 'number' ? data.cpu : 0;
      rows.push({ label: 'CPU', pct: cpu, val: cpu + '%', color: getColorForPct(cpu) });
    }

    // Row 2: GPU Temp
    if (gpuT !== null) {
      rows.push({
        label: 'GPU',
        pct: Math.max(0, Math.min(100, gpuT)),
        val: gpuT + 'C',
        color: getColorForTemp(gpuT),
      });
    } else if (data.hasGpu && typeof data.gpu === 'number') {
      rows.push({ label: 'GPU', pct: data.gpu, val: data.gpu + '%', color: getColorForPct(data.gpu) });
    } else {
      var netRate = typeof data.netRate === 'number' ? data.netRate : 0;
      var netFrac = Math.min(1.0, netRate / (10 * 1024 * 1024));
      var netPct = Math.round(netFrac * 100);
      rows.push({ label: 'NET', pct: netPct, val: formatNetRate(netRate), color: getColorForPct(netPct) });
    }

    // Row 3: RAM %
    rows.push({ label: 'RAM', pct: ram, val: ram + '%', color: getColorForPct(ram) });

  } else {
    // -----------------------------------------------------------------------
    // Screen 0: Utilization % (CPU, GPU, RAM)
    // -----------------------------------------------------------------------
    var cpu = typeof data.cpu === 'number' ? data.cpu : 0;
    var gpu = typeof data.gpu === 'number' ? data.gpu : null;
    var ram = typeof data.ram === 'number' ? data.ram : 0;
    var netRate = typeof data.netRate === 'number' ? data.netRate : 0;

    rows.push({ label: 'CPU', pct: cpu, val: cpu + '%', color: getColorForPct(cpu) });

    if (gpu !== null) {
      rows.push({ label: 'GPU', pct: gpu, val: gpu + '%', color: getColorForPct(gpu) });
      rows.push({ label: 'RAM', pct: ram, val: ram + '%', color: getColorForPct(ram) });
    } else {
      rows.push({ label: 'RAM', pct: ram, val: ram + '%', color: getColorForPct(ram) });
      var netFrac = Math.min(1.0, netRate / (10 * 1024 * 1024));
      var netPct = Math.round(netFrac * 100);
      rows.push({
        label: 'NET',
        pct: netPct,
        val: formatNetRate(netRate),
        color: getColorForPct(netPct),
      });
    }
  }

  var rowY = [0, 5, 10];

  for (var i = 0; i < 3; i++) {
    var item = rows[i];
    var y = rowY[i];
    var key = item.label.toLowerCase();
    var pct = Math.max(0, Math.min(100, item.pct));
    var color = item.color || getColorForPct(pct);

    // Label
    elements.push({
      id: key + '_l',
      type: 'text',
      text: item.label,
      x: 0,
      y: y,
      font: 'tiny',
      color: '#FFFFFFFF',
      display: 'front',
    });

    // Bar outline
    elements.push({
      id: key + '_o',
      type: 'rectangle',
      x: 17,
      y: y,
      width: 31,
      height: 5,
      border_width: 1,
      border_color: '#505050FF',
      display: 'front',
    });

    // Bar fill
    var fillW = Math.round(29 * (pct / 100));
    if (fillW >= 1) {
      elements.push({
        id: key + '_f',
        type: 'rectangle',
        x: 18,
        y: y + 1,
        width: fillW,
        height: 3,
        border_width: 0,
        fill: 'solid',
        fill_colors: [color],
        display: 'front',
      });
    }

    // Value
    elements.push({
      id: key + '_v',
      type: 'text',
      text: item.val,
      x: 71,
      y: y,
      font: 'tiny',
      align: 'top_right',
      color: color,
      display: 'front',
    });
  }

  return elements;
}

function renderOffline(host, port) {
  return [
    {
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
    },
    {
      id: 'off_title',
      type: 'text',
      text: 'SYS MON',
      x: 0,
      y: 0,
      font: 'tiny',
      color: '#22C55EFF',
      display: 'front',
    },
    {
      id: 'off_msg',
      type: 'text',
      text: 'WAITING HOST',
      x: 0,
      y: 5,
      font: 'tiny',
      color: '#F59E0BFF',
      display: 'front',
    },
    {
      id: 'off_host',
      type: 'text',
      text: host + ':' + port,
      x: 0,
      y: 11,
      font: 'tiny',
      color: '#888888FF',
      display: 'front',
    },
  ];
}

function main() {
  var host = '10.0.4.21';
  var port = 9100;
  var intervalMs = 2000;
  var timerId = null;
  var isRunning = true;
  var candidates = ['10.0.4.21', '10.0.4.2', '10.0.4.1'];
  var candIdx = 0;
  var isUsbMode = true;
  var wasOffline = true;

  // Screen state: 0 = Load %, 1 = Temperatures
  var currentScreen = 0;
  var NUM_SCREENS = 2;
  var lastMetrics = null;

  function clearDisplay() {
    return fetch('http://localhost/api/display/draw?application_name=' + APP_ID, {
      method: 'DELETE',
    });
  }

  function drawElements(elements) {
    return fetch('http://localhost/api/display/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_name: APP_ID,
        priority: 50,
        elements: elements,
      }),
    });
  }

  function fetchMetrics() {
    if (!isRunning) return;

    var curHost = host;
    var url = 'http://' + curHost + ':' + port + '/api/metrics';

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!isRunning) return;
        lastMetrics = data;
        var elements = buildDisplayElements(data, currentScreen);

        // When switching from offline to online, clear leftover offline text first
        if (wasOffline) {
          wasOffline = false;
          clearDisplay()
            .then(function () {
              drawElements(elements);
            })
            .catch(function () {
              drawElements(elements);
            });
          return;
        }

        drawElements(elements);
      })
      .catch(function () {
        if (!isRunning) return;

        // If in USB mode and connection failed, cycle to next USB candidate IP
        if (isUsbMode && candidates.length > 1) {
          candIdx = (candIdx + 1) % candidates.length;
          host = candidates[candIdx];
        }

        var offlineElements = renderOffline(host, port);

        if (!wasOffline) {
          wasOffline = true;
          clearDisplay()
            .then(function () {
              drawElements(offlineElements);
            })
            .catch(function () {
              drawElements(offlineElements);
            });
          return;
        }

        drawElements(offlineElements).catch(function () {});
      });
  }

  function loadSettingsAndStart() {
    fetch('http://localhost/api/apps/settings?app_id=' + APP_ID)
      .then(function (res) {
        if (!res.ok) throw new Error('No settings');
        return res.json();
      })
      .then(function (doc) {
        if (doc && doc.values) {
          if (doc.values.connection === 'WiFi' && doc.values.host_ip) {
            isUsbMode = false;
            host = String(doc.values.host_ip);
          } else if (doc.values.host_ip) {
            host = String(doc.values.host_ip);
            if (candidates.indexOf(host) === -1) {
              candidates.unshift(host);
            }
          }
          if (doc.values.host_port) port = Number(doc.values.host_port);
          if (doc.values.interval_sec) intervalMs = Math.max(500, Number(doc.values.interval_sec) * 1000);
        }
      })
      .catch(function () {})
      .finally(function () {
        clearDisplay().catch(function () {});
        drawElements(renderOffline(host, port)).catch(function () {});
        fetchMetrics();
        timerId = setInterval(fetchMetrics, intervalMs);
      });
  }

  loadSettingsAndStart();

  // Hardware input handling (encoder wheel & buttons)
  if (typeof listen === 'function') {
    listen('input', function (event) {
      if (!event) return;

      // Short press Back -> Exit app
      if (event.key === 'back' && event.action === 'short') {
        isRunning = false;
        if (timerId) clearInterval(timerId);
        return;
      }

      // Rotate encoder wheel (clockwise or counterclockwise) or click OK
      if (event.key === 'encoder' || event.key === 'ok') {
        if (event.key === 'encoder') {
          var d = event.delta || (event.action === 'clockwise' ? 1 : -1);
          currentScreen = (currentScreen + (d > 0 ? 1 : -1) + NUM_SCREENS) % NUM_SCREENS;
        } else if (event.action === 'short' || event.action === 'press') {
          currentScreen = (currentScreen + 1) % NUM_SCREENS;
        }

        // Instantly re-render with the new screen
        if (lastMetrics && !wasOffline) {
          var elements = buildDisplayElements(lastMetrics, currentScreen);
          drawElements(elements).catch(function () {});
        }
      }
    });
  }
}

main();
