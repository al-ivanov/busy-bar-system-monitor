#!/usr/bin/env node

/**
 * System Monitor for BUSY Bar (Windows, macOS, Linux / SteamOS)
 *
 * Supports two workflows:
 * 1. Host Widget (default): Pushes live frames to Busy Bar via HTTP API (/api/display/draw).
 * 2. Metrics Server (--server): Exposes /api/metrics HTTP endpoint for the on-device
 *    BUSY Bar app built with busy-cli.
 */

import http from 'node:http';
import os from 'node:os';
import { BusyBarClient } from './lib/busybar.js';
import { MetricsCollector } from './lib/metrics.js';
import {
  renderFrontDisplay,
  renderBackDisplay,
  getColorForPct,
  getColorForTemp,
  formatNetRate,
} from './lib/renderer.js';

// CLI argument parser helper
function getArg(flag, defaultValue = null) {
  const index = process.argv.indexOf(flag);
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1];
  }
  return defaultValue;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// Help message
if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
System Monitor for BUSY Bar (Windows, macOS, Linux)

Usage:
  node index.js [options]

Modes:
  (default)           Push widget: samples metrics and draws directly to BUSY Bar
  --server, -s        Metrics server: exposes /api/metrics on port 9100 for the
                      on-device BUSY Bar app (installed via busy-cli)
  --both              Run both the HTTP metrics server and the direct push widget

Options:
  --host <ip>         Busy Bar host IP (default: 10.0.4.20 over USB)
  --port <number>     Busy Bar HTTP port (default: 80)
  --token <password>  Busy Bar Wi-Fi or API password
  --server-port <num> Port for metrics server (default: 9100)
  --interval <sec>    Refresh interval in seconds (default: 2.0)
  --mode <mode>       Metric layout preset:
                        - "auto"    : CPU, GPU (if present, else RAM), RAM/NET
                        - "classic" : CPU, RAM, NET
                        - "vram"    : CPU, GPU, VRAM
                        - "temp"    : CPU, GPU, TMP
  --rows <list>       Custom comma-separated rows, e.g. "CPU,GPU,RAM" or "CPU,RAM,NET"
  --back-display      Also update the 160x80 OLED back screen
  --dry-run           Print collected metrics to console without sending to Busy Bar
  -h, --help          Show this help message

busy-cli Commands:
  npm run build           Build on-device app into dist/app.system.monitor.tgz
  npm run app:install     Install built package onto connected Busy Bar
  npm run app:run         Launch the installed app on Busy Bar
  npm run app:stop        Quit the running app on Busy Bar
`);
  process.exit(0);
}

const host = getArg('--host', '10.0.4.20');
const port = parseInt(getArg('--port', '80'), 10);
const token = getArg('--token', '');
const serverPort = parseInt(getArg('--server-port', '9100'), 10);
const intervalSec = parseFloat(getArg('--interval', '2.0'));
const mode = (getArg('--mode', 'auto')).toLowerCase();
const customRows = getArg('--rows', null);
const enableBackDisplay = hasFlag('--back-display');
const isDryRun = hasFlag('--dry-run');
const isServerOnly = hasFlag('--server') || hasFlag('-s');
const isBoth = hasFlag('--both');

const client = new BusyBarClient({ host, port, token, appName: 'app.system.monitor' });
const collector = new MetricsCollector();
let isStopping = false;

/**
 * Detect host machine IP on USB (10.0.4.x) or LAN
 */
function detectHostIp() {
  const ifaces = os.networkInterfaces();
  // 1. Check for 10.0.4.x interface (USB connection to Busy Bar)
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('10.0.4.')) {
        return iface.address;
      }
    }
  }
  // 2. Check for local LAN interface (Wi-Fi/Ethernet)
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        return iface.address;
      }
    }
  }
  return '10.0.4.21';
}

// ---------------------------------------------------------------------------
// 1. Metrics Server Mode (for on-device busy-cli app)
// ---------------------------------------------------------------------------
async function startServer() {
  const detectedIp = detectHostIp();

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = req.url ? req.url.split('?')[0] : '/';

    if (url === '/api/metrics' || url === '/metrics') {
      const sample = collector.sample();
      res.writeHead(200);
      res.end(JSON.stringify(sample));
      return;
    }

    if (url === '/api/health' || url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', platform: process.platform, uptime: os.uptime() }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(serverPort, '0.0.0.0', async () => {
    console.log(`Metrics Server listening on http://0.0.0.0:${serverPort}/api/metrics`);
    console.log(`Detected Host IP: ${detectedIp}`);

    // Auto-register host IP in BUSY Bar app settings if reachable
    try {
      await client.setAppSettings('app.system.monitor', {
        version: 1,
        values: {
          connection: 'USB',
          host_ip: detectedIp,
          host_port: serverPort,
          interval_sec: Math.round(intervalSec),
        },
      });
      console.log(`Auto-registered host IP (${detectedIp}) in BUSY Bar settings!`);
    } catch (e) {
      // Busy Bar might not be connected or settings not writable
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// 2. Direct Push Widget Mode
// ---------------------------------------------------------------------------
async function cleanup() {
  if (isStopping) return;
  isStopping = true;
  console.log('\nStopping System Monitor...');

  if (!isDryRun && !isServerOnly) {
    try {
      await client.clear();
      console.log('Cleared Busy Bar display.');
    } catch {
      // Ignore network errors on shutdown
    }
  }

  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function resolveRows(sample) {
  let rowKeys = [];

  if (customRows) {
    rowKeys = customRows.split(',').map((s) => s.trim().toUpperCase());
  } else if (mode === 'classic') {
    rowKeys = ['CPU', 'RAM', 'NET'];
  } else if (mode === 'temp') {
    rowKeys = ['CPU', sample.hasGpu ? 'GPU' : 'RAM', 'TMP'];
  } else if (mode === 'vram') {
    rowKeys = ['CPU', sample.hasGpu ? 'GPU' : 'RAM', 'VRAM'];
  } else {
    // default "auto"
    if (sample.hasGpu) {
      rowKeys = ['CPU', 'GPU', 'RAM'];
    } else {
      rowKeys = ['CPU', 'RAM', 'NET'];
    }
  }

  const rows = [];

  for (const key of rowKeys) {
    switch (key) {
      case 'CPU': {
        const val = sample.cpu;
        rows.push({
          label: 'CPU',
          pct: val,
          valueStr: `${val}%`,
          color: getColorForPct(val),
        });
        break;
      }

      case 'GPU': {
        const val = sample.gpu !== null ? sample.gpu : 0;
        rows.push({
          label: 'GPU',
          pct: val,
          valueStr: sample.gpu !== null ? `${val}%` : 'N/A',
          color: sample.gpu !== null ? getColorForPct(val) : '#888888FF',
        });
        break;
      }

      case 'RAM':
      case 'MEM': {
        const val = sample.ram;
        rows.push({
          label: key === 'MEM' ? 'MEM' : 'RAM',
          pct: val,
          valueStr: `${val}%`,
          color: getColorForPct(val),
        });
        break;
      }

      case 'VRAM': {
        const val = sample.vram !== null ? sample.vram : 0;
        rows.push({
          label: 'VRM',
          pct: val,
          valueStr: sample.vram !== null ? `${val}%` : 'N/A',
          color: sample.vram !== null ? getColorForPct(val) : '#888888FF',
        });
        break;
      }

      case 'NET': {
        const rate = sample.netRate;
        const netFrac = Math.min(1.0, rate / (10 * 1024 * 1024));
        const netPct = Math.round(netFrac * 100);
        rows.push({
          label: 'NET',
          pct: netPct,
          valueStr: formatNetRate(rate),
          color: getColorForPct(netPct),
        });
        break;
      }

      case 'TMP':
      case 'TEMP': {
        const val = sample.temp !== null ? sample.temp : 0;
        const pct = Math.max(0, Math.min(100, val));
        rows.push({
          label: 'TMP',
          pct,
          valueStr: sample.temp !== null ? `${val}C` : 'N/A',
          color: sample.temp !== null ? getColorForTemp(val) : '#888888FF',
        });
        break;
      }

      default: {
        rows.push({
          label: key.slice(0, 3),
          pct: 0,
          valueStr: '0%',
          color: '#22C55EFF',
        });
      }
    }
  }

  return rows;
}

async function tick() {
  if (isStopping) return;

  try {
    const sample = collector.sample();
    const rows = resolveRows(sample);

    if (isDryRun) {
      const summary = rows.map((r) => `${r.label}: ${r.valueStr} (${r.pct}%)`).join(' | ');
      console.log(`[DRY-RUN] ${summary}`);
      return;
    }

    const elements = renderFrontDisplay(rows);

    if (enableBackDisplay) {
      const backElements = renderBackDisplay({
        hostName: os.hostname(),
        osName: `${os.type()} ${os.arch()}`,
        uptimeSec: os.uptime(),
        details: [
          { label: 'CPU', valueStr: `${sample.cpu}%` },
          { label: sample.hasGpu ? 'GPU' : 'RAM', valueStr: sample.hasGpu ? `${sample.gpu || 0}%` : `${sample.ram}%` },
          { label: 'Net', valueStr: formatNetRate(sample.netRate) },
        ],
      });
      elements.push(...backElements);
    }

    await client.draw(elements);
  } catch (err) {
    if (!isStopping) {
      console.error(`Tick error: ${err.message}`);
    }
  }
}

async function start() {
  console.log('====================================');
  console.log(` System Monitor for BUSY Bar (${os.type()})`);
  console.log('====================================');

  if (isServerOnly) {
    await startServer();
    return;
  }

  if (isBoth) {
    await startServer();
  }

  console.log(`Target: http://${host}:${port}`);
  console.log(`Mode: ${mode} (Refresh: ${intervalSec}s)`);

  if (!isDryRun) {
    try {
      const fw = await client.getFirmware();
      console.log(`Connected to Busy Bar (Firmware v${fw.version || 'unknown'})`);
    } catch (err) {
      console.warn(`Warning: Could not fetch firmware (${err.message}). Will retry on draw.`);
    }
  } else {
    console.log('Running in DRY-RUN mode (no HTTP requests)');
  }

  collector.sample();

  setTimeout(() => {
    tick();
    setInterval(tick, Math.max(500, intervalSec * 1000));
  }, 500);
}

start();
