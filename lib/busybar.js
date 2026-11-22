import http from 'node:http';

/**
 * Busy Bar HTTP API Client
 */
export class BusyBarClient {
  /**
   * @param {Object} options
   * @param {string} [options.host="10.0.4.20"] - BUSY Bar IP or hostname
   * @param {number} [options.port=80] - Port
   * @param {string} [options.token=""] - Wi-Fi auth password or Cloud API token
   * @param {string} [options.appName="system-monitor"] - Application identifier
   * @param {number} [options.priority=100] - Display priority (1-100)
   */
  constructor({
    host = '10.0.4.20',
    port = 80,
    token = '',
    appName = 'system-monitor',
    priority = 100,
  } = {}) {
    const cleaned = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (cleaned.includes(':')) {
      const parts = cleaned.split(':');
      this.host = parts[0];
      this.port = parseInt(parts[1], 10);
    } else {
      this.host = cleaned;
      this.port = port;
    }

    this.token = token;
    this.appName = appName;
    this.priority = priority;
  }

  /**
   * Internal HTTP request helper
   * @private
   */
  async _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const headers = {
        'Accept': 'application/json',
      };

      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path,
          method,
          headers,
          timeout: 4000,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            let parsed = null;
            try {
              parsed = data ? JSON.parse(data) : {};
            } catch {
              parsed = { raw: data };
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              const err = new Error(
                `Busy Bar API error HTTP ${res.statusCode}: ${parsed.error || data || res.statusMessage}`
              );
              err.statusCode = res.statusCode;
              err.data = parsed;
              reject(err);
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout connecting to Busy Bar at ${this.host}:${this.port}`));
      });

      req.on('error', (err) => {
        reject(new Error(`Failed to reach Busy Bar (${this.host}:${this.port}): ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async getFirmware() {
    return this._request('GET', '/api/status/firmware');
  }

  async draw(elements, priority = this.priority) {
    return this._request('POST', '/api/display/draw', {
      application_name: this.appName,
      priority,
      elements,
    });
  }

  async clear() {
    return this._request(
      'DELETE',
      `/api/display/draw?application_name=${encodeURIComponent(this.appName)}`
    );
  }

  /**
   * Get app settings document
   */
  async getAppSettings(appId = this.appName) {
    return this._request('GET', `/api/apps/settings?app_id=${encodeURIComponent(appId)}`);
  }

  /**
   * Update app settings document
   */
  async setAppSettings(appId, settingsDoc) {
    return this._request('PUT', `/api/apps/settings?app_id=${encodeURIComponent(appId)}`, settingsDoc);
  }
}
