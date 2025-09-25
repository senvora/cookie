const https = require('https');
const fs = require('fs');
const zlib = require('zlib');
const url = require('url');

const JS_URL = process.env.JS; // JS M3U
const ZF_URL = process.env.ZF; // ZF M3U

const folderPath = 'cookie';
fs.mkdirSync(folderPath, { recursive: true });

// ---------- FETCH WITH REDIRECT SUPPORT ----------
function fetchUrl(targetUrl) {
  return new Promise((resolve, reject) => {
    const options = url.parse(targetUrl);
    options.headers = { 'User-Agent': 'Mozilla/5.0' };

    https.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return resolve(fetchUrl(res.headers.location));
      }

      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        let buffer = Buffer.concat(chunks);

        // Handle gzip if present
        if (res.headers['content-encoding'] === 'gzip') {
          zlib.gunzip(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve(decoded.toString('utf-8'));
          });
        } else {
          resolve(buffer.toString('utf-8'));
        }
      });
    }).on('error', err => reject(err));
  });
}

// ---------- EXTRACT __hdnea__ (JS M3U) ----------
function extractHdnea(content) {
  // Case 1: JSON cookie line (#EXTHTTP)
  let match = content.match(/"cookie":"(__hdnea__=[^"]+)/);
  if (match) return match[1];

  // Case 2: query string in URL
  match = content.match(/[?&](__hdnea__=[^&\s]+)/);
  if (match) return match[1];

  return null;
}

// ---------- EXTRACT hdntl (ZF M3U) ----------
function extractHdntl(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/[?&](hdntl=[^\s&]+)/);
    if (match) {
      return match[1]; // keeps hdntl= and URL-encoded value
    }
  }
  return null;
}

// ---------- SAVE COOKIE ----------
function saveCookie(fileName, value) {
  const filePath = `${folderPath}/${fileName}`;
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8').trim() : '';
  if (prev !== value) {
    fs.writeFileSync(filePath, value);
    console.log(`✅ ${fileName} updated`);
  } else {
    console.log(`${fileName} unchanged`);
  }
}

// ---------- MAIN ----------
(async () => {
  try {
    // JS M3U
    if (JS_URL) {
      const jsContent = await fetchUrl(JS_URL);
      const hdnea = extractHdnea(jsContent);
      if (hdnea) saveCookie('js-hdnea-cookie.txt', hdnea);
      else console.log('No __hdnea__ cookie found in JS M3U');
    } else {
      console.error('❌ JS URL not set');
    }

    // ZF M3U
    if (ZF_URL) {
      const zfContent = await fetchUrl(ZF_URL);
      const hdntl = extractHdntl(zfContent);
      if (hdntl) saveCookie('zf-hdntl-cookie.txt', hdntl);
      else console.log('No hdntl cookie found in ZF M3U');
    } else {
      console.error('❌ ZF URL not set');
    }

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
