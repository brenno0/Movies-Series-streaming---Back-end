import { fetchPage } from '../flaresolverr.js';

export async function resolveStreamtape(embedUrl) {
  // Normalize: /v/ and /f/ paths → /e/
  const url = embedUrl.replace(/\/(v|f)\//, '/e/');

  // FlareSolverr runs a real browser, so JS executes and the DOM is rendered.
  // After execution, the page should contain the resolved get_video link.
  const html = await fetchPage(url);

  // Strategy 1: look for the resolved href in the rendered DOM
  // <div id="robotlink"><a href="//streamtape.com/get_video?id=...&stream=1">
  const hrefMatch = html.match(/href=["'](\/{0,2}(?:www\.)?streamtape\.(?:com|net)\/get_video[^"']+)["']/);
  if (hrefMatch) {
    const href = hrefMatch[1];
    return href.startsWith('//') ? 'https:' + href : href;
  }

  // Strategy 2: JS variable containing get_video URL (pre-render fallback)
  // var robotlink = '/get_video?id=XXX&expires=YYY&ip=ZZZ&token=AAA'
  const varMatch = html.match(/(?:robotlink|videolink|dllink)\s*=\s*["']([^"']*get_video[^"']*)["']/);
  if (varMatch) {
    const path = varMatch[1];
    return path.startsWith('http') ? path : `https://streamtape.com${path}`;
  }

  // Strategy 3: two-part token concatenation
  // var r = "https://streamtape.com/get_video?...&token=" + b.substr(1)
  const tokenBaseMatch = html.match(/["'](https?:\/\/(?:www\.)?streamtape[^"']*get_video[^"']*token=)["']/);
  if (tokenBaseMatch) {
    const tokenPartMatch = html.match(/\.substr\s*\(\s*[01]\s*\)\s*;?\s*["']([A-Za-z0-9_\-]{4,})["']|["']([A-Za-z0-9_\-]{4,})["']\s*\+\s*(?:\w+)\.substr/);
    if (tokenPartMatch) {
      const tok = tokenPartMatch[1] ?? tokenPartMatch[2];
      return tokenBaseMatch[1] + tok;
    }
  }

  return null;
}
