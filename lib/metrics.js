import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Cross-Platform Hardware Metrics Collector
 * Supports Windows, macOS, and Linux (SteamOS / Steam Machine)
 */
export class MetricsCollector {
  constructor() {
    this.platform = process.platform;
    this.isLinux = this.platform === 'linux';
    this.isMac = this.platform === 'darwin';
    this.isWin = this.platform === 'win32';

    // State for CPU % calculation
    this.prevCpuTotal = 0;
    this.prevCpuIdle = 0;

    // State for Network rate calculation
    this.prevNetBytes = 0;
    this.prevNetTime = 0;

    // Hardware detection flags
    this.hasNvidia = false;
    this.amdGpuPath = null;
    this.amdVramUsedPath = null;
    this.amdVramTotalPath = null;
    this.tempPath = null;

    this._detectHardware();
  }

  _detectHardware() {
    // 1. Check for NVIDIA (works on Linux, Windows, macOS)
    try {
      execSync(this.isWin ? 'where nvidia-smi' : 'which nvidia-smi', { stdio: 'ignore' });
      this.hasNvidia = true;
    } catch {
      this.hasNvidia = false;
    }

    // 2. Linux-specific AMD GPU and Sensors
    if (this.isLinux) {
      try {
        if (fs.existsSync('/sys/class/drm')) {
          const cards = fs.readdirSync('/sys/class/drm');
          for (const card of cards) {
            if (/^card\d+$/.test(card)) {
              const busy = `/sys/class/drm/${card}/device/gpu_busy_percent`;
              if (fs.existsSync(busy)) {
                this.amdGpuPath = busy;
                const vUsed = `/sys/class/drm/${card}/device/mem_info_vram_used`;
                const vTot = `/sys/class/drm/${card}/device/mem_info_vram_total`;
                if (fs.existsSync(vUsed) && fs.existsSync(vTot)) {
                  this.amdVramUsedPath = vUsed;
                  this.amdVramTotalPath = vTot;
                }
                break;
              }
            }
          }
        }
      } catch {
        // Ignore
      }

      // Detect thermal sensors
      try {
        if (fs.existsSync('/sys/class/hwmon')) {
          for (const hw of fs.readdirSync('/sys/class/hwmon')) {
            const dir = `/sys/class/hwmon/${hw}`;
            const temps = fs.readdirSync(dir).filter((f) => /^temp\d+_input$/.test(f));
            if (temps.length > 0) {
              this.tempPath = `${dir}/${temps[0]}`;
              break;
            }
          }
        }
        if (!this.tempPath && fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
          this.tempPath = '/sys/class/thermal/thermal_zone0/temp';
        }
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Get CPU utilization % (0-100) across all OSes
   */
  getCpu() {
    // Fast path for Linux (/proc/stat)
    if (this.isLinux && fs.existsSync('/proc/stat')) {
      try {
        const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0];
        const parts = line.trim().split(/\s+/).slice(1).map(Number);
        const idle = parts[3] + (parts[4] || 0);
        const total = parts.reduce((a, b) => a + b, 0);

        if (this.prevCpuTotal === 0) {
          this.prevCpuTotal = total;
          this.prevCpuIdle = idle;
          return 0;
        }

        const deltaTotal = total - this.prevCpuTotal;
        const deltaIdle = idle - this.prevCpuIdle;
        this.prevCpuTotal = total;
        this.prevCpuIdle = idle;

        if (deltaTotal <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)));
      } catch {
        // Fallback below
      }
    }

    // Windows & macOS & universal fallback: os.cpus() tick delta
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
      for (const type of Object.keys(cpu.times)) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    if (this.prevCpuTotal === 0) {
      this.prevCpuTotal = totalTick;
      this.prevCpuIdle = totalIdle;
      return 0;
    }

    const deltaTotal = totalTick - this.prevCpuTotal;
    const deltaIdle = totalIdle - this.prevCpuIdle;
    this.prevCpuTotal = totalTick;
    this.prevCpuIdle = totalIdle;

    if (deltaTotal <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)));
  }

  /**
   * Get RAM utilization % (0-100)
   */
  getRam() {
    // Linux / SteamOS: accurate MemAvailable
    if (this.isLinux && fs.existsSync('/proc/meminfo')) {
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        let total = 0;
        let available = 0;
        for (const line of meminfo.split('\n')) {
          if (line.startsWith('MemTotal:')) {
            total = parseInt(line.split(/\s+/)[1], 10);
          } else if (line.startsWith('MemAvailable:')) {
            available = parseInt(line.split(/\s+/)[1], 10);
          }
        }
        if (total > 0 && available > 0) {
          return Math.max(0, Math.min(100, Math.round(((total - available) / total) * 100)));
        }
      } catch {
        // Fallback below
      }
    }

    // macOS: parse vm_stat for accurate active/wired/compressed
    if (this.isMac) {
      try {
        const vm = execSync('vm_stat', { encoding: 'utf8', timeout: 1000 });
        let pageSize = 4096;
        for (const l of vm.split('\n')) {
          if (l.includes('page size of')) {
            const match = l.match(/page size of (\d+) bytes/);
            if (match) pageSize = parseInt(match[1], 10);
            break;
          }
        }
        const getPages = (key) => {
          const l = vm.split('\n').find((line) => line.startsWith(key));
          if (!l) return 0;
          return parseInt(l.split(':')[1].trim().replace('.', ''), 10) || 0;
        };
        const active = getPages('Pages active');
        const wired = getPages('Pages wired down');
        const comp = getPages('Pages occupied by compressor');
        const usedBytes = (active + wired + comp) * pageSize;
        const totalBytes = os.totalmem();
        if (totalBytes > 0) {
          return Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 100)));
        }
      } catch {
        // Fallback below
      }
    }

    // Windows and fallback
    const total = os.totalmem();
    const free = os.freemem();
    return Math.max(0, Math.min(100, Math.round(((total - free) / total) * 100)));
  }

  /**
   * Get GPU utilization % (0-100), or null if not detected
   */
  getGpu() {
    // 1. AMD GPU on Linux / SteamOS / Steam Deck
    if (this.amdGpuPath) {
      try {
        const val = parseInt(fs.readFileSync(this.amdGpuPath, 'utf8').trim(), 10);
        if (!isNaN(val)) return Math.max(0, Math.min(100, val));
      } catch {}
    }

    // 2. NVIDIA GPU (Linux / Windows / macOS)
    if (this.hasNvidia) {
      try {
        const out = execSync(
          'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits',
          { encoding: 'utf8', timeout: 1500 }
        ).trim();
        const val = parseInt(out, 10);
        if (!isNaN(val)) return Math.max(0, Math.min(100, val));
      } catch {}
    }

    // 3. Windows GPU Performance Counters (DirectX / 3D engine)
    if (this.isWin) {
      try {
        const cmd = `powershell -NoProfile -NonInteractive -Command "(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object -Property CookedValue -Sum | Select-Object -ExpandProperty Sum"`;
        const out = execSync(cmd, { encoding: 'utf8', timeout: 2000 }).trim();
        const val = parseFloat(out.replace(',', '.'));
        if (!isNaN(val)) return Math.max(0, Math.min(100, Math.round(val)));
      } catch {}
    }

    return null;
  }

  /**
   * Get VRAM utilization % (0-100), or null
   */
  getVram() {
    if (this.amdVramUsedPath && this.amdVramTotalPath) {
      try {
        const used = parseInt(fs.readFileSync(this.amdVramUsedPath, 'utf8').trim(), 10);
        const total = parseInt(fs.readFileSync(this.amdVramTotalPath, 'utf8').trim(), 10);
        if (total > 0) return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
      } catch {}
    }

    if (this.hasNvidia) {
      try {
        const out = execSync(
          'nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits',
          { encoding: 'utf8', timeout: 1500 }
        ).trim();
        const [u, t] = out.split(',').map((s) => parseInt(s.trim(), 10));
        if (t > 0) return Math.max(0, Math.min(100, Math.round((u / t) * 100)));
      } catch {}
    }

    return null;
  }

  /**
   * Get Network Transfer Rate in bytes/sec
   */
  getNetRate() {
    let currentBytes = 0;
    const now = Date.now();

    if (this.isLinux && fs.existsSync('/proc/net/dev')) {
      try {
        const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n');
        for (const line of lines) {
          if (!line.includes(':')) continue;
          const [iface, stats] = line.split(':');
          if (iface.trim() === 'lo') continue;
          const parts = stats.trim().split(/\s+/).map(Number);
          currentBytes += (parts[0] || 0) + (parts[8] || 0);
        }
      } catch {}
    } else if (this.isMac) {
      try {
        const out = execSync('netstat -ib', { encoding: 'utf8', timeout: 1500 });
        const seen = new Set();
        for (const line of out.split('\n')) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10 || parts[0] === 'Name' || parts[0] === 'lo0') continue;
          if (seen.has(parts[0])) continue;
          seen.add(parts[0]);
          currentBytes += (parseInt(parts[6], 10) || 0) + (parseInt(parts[9], 10) || 0);
        }
      } catch {}
    } else if (this.isWin) {
      try {
        const out = execSync('netstat -e', { encoding: 'utf8', timeout: 1500 });
        const lines = out.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes('bytes')) {
            const nums = line.match(/\d+/g);
            if (nums && nums.length >= 2) {
              currentBytes = parseInt(nums[0], 10) + parseInt(nums[1], 10);
              break;
            }
          }
        }
      } catch {}
    }

    if (this.prevNetTime === 0 || this.prevNetBytes === 0) {
      this.prevNetBytes = currentBytes;
      this.prevNetTime = now;
      return 0;
    }

    const elapsed = (now - this.prevNetTime) / 1000;
    const delta = Math.max(0, currentBytes - this.prevNetBytes);
    this.prevNetBytes = currentBytes;
    this.prevNetTime = now;

    return elapsed > 0 ? delta / elapsed : 0;
  }

  /**
   * Get Temperature in Celsius, or null
   */
  getTemp() {
    if (this.tempPath) {
      try {
        const val = parseInt(fs.readFileSync(this.tempPath, 'utf8').trim(), 10);
        if (!isNaN(val)) return Math.round(val > 1000 ? val / 1000 : val);
      } catch {}
    }

    if (this.hasNvidia) {
      try {
        const out = execSync(
          'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits',
          { encoding: 'utf8', timeout: 1500 }
        ).trim();
        const val = parseInt(out, 10);
        if (!isNaN(val)) return val;
      } catch {}
    }

    return null;
  }

  sample() {
    const gpu = this.getGpu();
    return {
      cpu: this.getCpu(),
      ram: this.getRam(),
      gpu,
      vram: this.getVram(),
      netRate: this.getNetRate(),
      temp: this.getTemp(),
      hasGpu: gpu !== null,
      platform: this.platform,
    };
  }
}
