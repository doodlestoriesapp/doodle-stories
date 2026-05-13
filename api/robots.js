export default function handler(req, res) {
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(200).send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://doodlestories.app/sitemap.xml

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /`);
}
