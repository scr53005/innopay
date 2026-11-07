/** Dev servers: this machine or the LAN (phones test the dev hub over http://192.168.x.x). */
export function isDevHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.includes('127.0.0.1') || hostname.startsWith('192.168.');
}
