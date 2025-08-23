// Using Node.js built-in fetch (Node 18+), no external HTTP client needed
const { z } = require('zod');

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
    const runtime = await getRuntime(baseUrl, mapped);
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
async function getRuntime(baseUrl, language) {
  const now = Date.now();
  if (runtimeCache.list.length && now - runtimeCache.ts < 5 * 60 * 1000) {
    return pickRuntime(runtimeCache.list, language);
  }
  const resp = await fetch(`${baseUrl}/runtimes`, { headers: { 'accept': 'application/json' } });
  if (!resp.ok) return null;
  const list = await resp.json();
  runtimeCache = { ts: now, list: Array.isArray(list) ? list : [] };
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
