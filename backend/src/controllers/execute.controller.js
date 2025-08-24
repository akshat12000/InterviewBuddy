// Using Node.js built-in fetch (Node 18+), no external HTTP client needed
const { z } = require('zod');
const fs = require('fs');
const path = require('path');

// Languages we treat as executable and map to Piston runtimes
const languageMap = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  cpp: 'c++', // Piston names the runtime 'c++'
  java: 'java',
  csharp: 'csharp',
  go: 'go',
  rust: 'rust',
  php: 'php',
  ruby: 'ruby',
  kotlin: 'kotlin',
  swift: 'swift',
  scala: 'scala',
  shell: 'bash',
};

// Preferred filename extensions by language to help compilers/linkers
const fileExt = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  cpp: 'cpp',
  java: 'java',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
  php: 'php',
  ruby: 'rb',
  kotlin: 'kt',
  swift: 'swift',
  scala: 'scala',
  shell: 'sh',
};

const execSchema = z.object({
  language: z.string(),
  code: z.string(),
  stdin: z.string().optional(),
});

exports.executeCode = async (req, res, next) => {
  try {
    const { language, code, stdin } = execSchema.parse(req.body || {});

    // Non-executable languages
    const nonExecutable = new Set(['sql', 'json', 'markdown', 'html', 'css', 'xml', 'yaml']);
    if (nonExecutable.has(language)) {
      return res.status(400).json({ message: `Run is not supported for language: ${language}` });
    }

    const mapped = languageMap[language];
    if (!mapped) {
      return res.status(400).json({ message: `Unsupported language: ${language}` });
    }

    const provider = process.env.EXECUTOR_PROVIDER || 'piston';
    if (provider !== 'piston') {
      return res.status(501).json({ message: 'Executor not configured' });
    }

    const baseUrl = process.env.PISTON_BASE_URL || 'https://emkc.org/api/v2/piston';
    // Query and cache runtimes for 5 minutes to obtain the required version string
    let runtime = await getRuntime(baseUrl, mapped);
    // Fallback to disk cache if network fails and memory has nothing
    if (!runtime) {
      runtime = getFallbackRuntime(mapped);
    }
    if (!runtime) {
      return res.status(502).json({ message: `No runtime available for language: ${mapped}` });
    }
    const ext = fileExt[language] || 'txt';
    const payload = {
      language: runtime.language,
      version: runtime.version,
      files: [{ name: `main.${ext}`, content: code }],
      stdin: stdin || '',
      args: [],
    };
  const resp = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Piston accepts files: [{ content }]; omit name to avoid extension mismatches
      body: JSON.stringify({ ...payload, files: [{ content: code }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      let details;
      try { details = await resp.json(); } catch { details = await resp.text(); }
      const message = typeof details === 'object' && details?.message ? details.message : 'Execution failed';
      return res.status(resp.status).json({ message, details });
    }
    const data = await resp.json();

    // Piston returns compile and run results; collect useful output
    const compileOut = data.compile ? `${data.compile.stdout || ''}${data.compile.stderr || ''}` : '';
    const runOut = data.run ? `${data.run.stdout || ''}${data.run.stderr || ''}` : '';
    const output = `${compileOut}${runOut}`.trim();

    res.json({ ok: true, output, raw: data });
  } catch (e) {
    // If Piston unavailable or blocked, return a clear message
    if (e?.name === 'TimeoutError') {
      return res.status(504).json({ message: 'Execution timed out' });
    }
    next(e);
  }
};

// Simple in-memory cache
let runtimeCache = { ts: 0, list: [] };
// Store cache inside backend/.cache to keep it scoped to the backend project
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const RUNTIME_CACHE_FILE = path.join(CACHE_DIR, 'piston_runtimes.json');
// Legacy location (repo root). Kept for backward-compat read during migration.
const LEGACY_RUNTIME_CACHE_FILE = path.join(__dirname, '..', '..', '..', '.cache', 'piston_runtimes.json');

function ensureCacheDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
}

function readDiskCache() {
  try {
    const raw = fs.readFileSync(RUNTIME_CACHE_FILE, 'utf8');
    const { ts, list } = JSON.parse(raw);
    if (Array.isArray(list)) return { ts: ts || 0, list };
  } catch {}
  // Try legacy root path if new path missing
  try {
    const raw = fs.readFileSync(LEGACY_RUNTIME_CACHE_FILE, 'utf8');
    const { ts, list } = JSON.parse(raw);
    if (Array.isArray(list)) {
      // Write back to new scoped location for future reads
      const data = { ts: ts || 0, list };
      try { writeDiskCache(data); } catch {}
      return data;
    }
  } catch {}
  return { ts: 0, list: [] };
}

function writeDiskCache(data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(RUNTIME_CACHE_FILE, JSON.stringify(data), 'utf8');
  } catch {}
}
async function getRuntime(baseUrl, language) {
  const now = Date.now();
  if (runtimeCache.list.length && now - runtimeCache.ts < 5 * 60 * 1000) {
    return pickRuntime(runtimeCache.list, language);
  }
  try {
    const resp = await fetch(`${baseUrl}/runtimes`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error('bad status');
    const list = await resp.json();
    runtimeCache = { ts: now, list: Array.isArray(list) ? list : [] };
    if (runtimeCache.list.length) writeDiskCache(runtimeCache);
  } catch (e) {
    // Try disk cache if fetch fails
    const disk = readDiskCache();
    if (disk.list.length) runtimeCache = disk;
    else return null;
  }
  return pickRuntime(runtimeCache.list, language);
}

function pickRuntime(list, language) {
  const candidates = list.filter(r => r.language === language);
  if (!candidates.length) return null;
  // Choose the highest semantic-like version; fallback to last item
  const sorted = candidates.slice().sort((a, b) => safeCmpVer(b.version, a.version));
  return sorted[0] || candidates[candidates.length - 1];
}

function safeCmpVer(a = '', b = '') {
  const pa = a.split(/\D+/).map(n => parseInt(n || '0', 10));
  const pb = b.split(/\D+/).map(n => parseInt(n || '0', 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// Fallback hardcoded versions in case Piston endpoint is unavailable and no cache exists
const FALLBACK_VERSIONS = {
  javascript: '18',
  typescript: '5',
  python: '3.10',
  'c++': '10',
  java: '17',
  csharp: '6',
  go: '1.20',
  rust: '1.70',
  php: '8',
  ruby: '3.1',
  kotlin: '1.8',
  swift: '5.7',
  scala: '2.13',
  bash: '5',
};

function getFallbackRuntime(language) {
  const version = FALLBACK_VERSIONS[language];
  if (!version) return null;
  return { language, version };
}

// Warm the in-memory cache at server start
async function warmRuntimeCache() {
  const baseUrl = process.env.PISTON_BASE_URL || 'https://emkc.org/api/v2/piston';
  const now = Date.now();
  try {
    const resp = await fetch(`${baseUrl}/runtimes`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error('bad status');
    const list = await resp.json();
    runtimeCache = { ts: now, list: Array.isArray(list) ? list : [] };
    if (runtimeCache.list.length) writeDiskCache(runtimeCache);
  } catch (e) {
    // If network fails, try disk; else leave cache empty and rely on FALLBACK_VERSIONS per request
    const disk = readDiskCache();
    if (disk.list.length) runtimeCache = disk;
  }
}

exports.warmRuntimeCache = warmRuntimeCache;
