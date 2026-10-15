/* Shared by the protected homepage editor and the public, click-to-load player. */
export function packingVideoSource(value) {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Packing video URL must be text, up to 500 characters.');
  const raw = value.trim();
  if (!raw) return null;
  if (/^\/videos\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp4$/i.test(raw)) return {type:'mp4',src:raw};
  let u;try { u = new URL(raw); } catch { throw new Error('Use an HTTPS MP4 or a valid YouTube video link.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Use an HTTPS video URL without credentials or a custom port.');
  const host=u.hostname.toLowerCase();
  if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com','youtu.be'].includes(host)) {
    const id=host==='youtu.be'?u.pathname.slice(1):u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id||'')) throw new Error('Use a link to one YouTube video.');
    return {type:'youtube',src:'https://www.youtube-nocookie.com/embed/'+id};
  }
  if (host==='chaskabox.online' && /\.mp4$/i.test(u.pathname)) return {type:'mp4',src:u.href};
  throw new Error('Use a ChaskaBox-hosted MP4 or a valid YouTube video link.');
}
