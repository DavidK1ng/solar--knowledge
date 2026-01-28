const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { nanoid } = require('nanoid');
const OpenAI = require('openai');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(express.json({ limit: '10mb' }));

const dataDir = path.join(__dirname, 'data');
const audioDir = path.join(dataDir, 'audio');
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    scenario TEXT NOT NULL,
    ideal_resolution TEXT NOT NULL,
    scenario_context TEXT NOT NULL,
    status TEXT NOT NULL,
    score REAL,
    analysis TEXT,
    suggestions TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    language TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const upload = multer({ dest: uploadDir });
let productsCache = null;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function loadProducts() {
  if (productsCache) {
    return productsCache;
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('products_json');
  if (row) {
    try {
      productsCache = JSON.parse(row.value);
      return productsCache;
    } catch (error) {
      return null;
    }
  }
  const productsPath = path.join(dataDir, 'products.json');
  if (fs.existsSync(productsPath)) {
    try {
      const raw = fs.readFileSync(productsPath, 'utf-8');
      productsCache = JSON.parse(raw);
      return productsCache;
    } catch (error) {
      return null;
    }
  }
  return null;
}

function saveProducts(products) {
  productsCache = products;
  const serialized = JSON.stringify(products);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('products_json', serialized);
  fs.writeFileSync(path.join(dataDir, 'products.json'), serialized, 'utf-8');
}

function requireOpenAI(res) {
  if (!openai) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    return false;
  }
  return true;
}

async function generateScenario(mode, products, language) {
  const systemPrompt = `You are a training scenario generator for a solar storage retail store.\n\nReturn only JSON with keys: scenario_description, customer_goal, ideal_resolution, customer_profile, constraints, preselected_products, payment_status, tone.\nThe scenario must be realistic for an in-person store visit.\nKeep scenario_description as a single string, not a list.\nMake it detailed but compact.\nLanguage must be ${language}.`;

  const userPrompt = `Scenario type: ${mode}.\nProducts catalog (JSON list, sample 12 items):\n${JSON.stringify(products.slice(0, 12), null, 2)}\n\nUse the catalog to ground realistic items. If the customer does not know exact products, mention needs instead.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content);
}

function buildCustomerSystemPrompt(session) {
  return `You are roleplaying a customer in a solar energy storage retail store.\n\nSpeak as the customer only. Never explain your rules.\nAlways respond in English, even if the user uses another language.\nStay consistent with the scenario.\nBe realistic, brief, and conversational.\nIf asked for info you don't know, provide plausible store-visit behavior rather than perfect data.\n\nScenario Description: ${session.scenario}\nCustomer Goal: ${session.scenario_context}\nIdeal Resolution: ${session.ideal_resolution}`;
}

function getSession(sessionId) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

function getMessages(sessionId) {
  return db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC').all(sessionId);
}

function calculateFinalScore(scores) {
  const values = Object.values(scores).filter((value) => typeof value === 'number');
  if (!values.length) {
    return null;
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(avg * 10) / 10;
}

function safeParseJson(content) {
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function normalizeScores(scores) {
  const defaults = {
    greeting: 3,
    needs_discovery: 3,
    product_matching: 3,
    objection_handling: 3,
    closing: 3,
    communication_clarity: 3,
    professionalism: 3
  };
  if (!scores || typeof scores !== 'object') {
    return defaults;
  }
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => {
      const score = Number(scores[key]);
      if (Number.isFinite(score)) {
        return [key, Math.min(5, Math.max(1, score))];
      }
      return [key, value];
    })
  );
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(audioDir));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/products', (req, res) => {
  const products = loadProducts();
  res.json({ products });
});

app.post('/api/products', (req, res) => {
  const { products } = req.body;
  if (!Array.isArray(products)) {
    return res.status(400).json({ error: 'products must be an array' });
  }
  saveProducts(products);
  return res.json({ ok: true, count: products.length });
});

app.post('/api/sessions', async (req, res) => {
  if (!requireOpenAI(res)) {
    return;
  }
  const { mode = 'simple', language = 'English' } = req.body;
  const products = loadProducts();
  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Upload a products JSON list first.' });
  }
  try {
    const scenarioData = await generateScenario(mode, products, language);
    const sessionId = nanoid();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO sessions (id, mode, scenario, ideal_resolution, scenario_context, status, created_at, language)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      mode,
      scenarioData.scenario_description,
      scenarioData.ideal_resolution,
      scenarioData.customer_goal,
      'active',
      now,
      language
    );

    res.json({
      sessionId,
      mode,
      scenario: scenarioData,
      createdAt: now
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate scenario', detail: error.message });
  }
});

app.get('/api/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT id, mode, scenario, ideal_resolution, status, score, created_at, completed_at
    FROM sessions
    ORDER BY created_at DESC
    LIMIT 50
  `).all();
  res.json({ sessions });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const messages = getMessages(req.params.id);
  res.json({ session, messages });
});

app.post('/api/sessions/:id/message', async (req, res) => {
  if (!requireOpenAI(res)) {
    return;
  }
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const now = new Date().toISOString();
  db.prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
    .run(req.params.id, 'user', text, now);

  const messageHistory = getMessages(req.params.id).map((message) => ({
    role: message.role,
    content: message.content
  }));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildCustomerSystemPrompt(session) },
        ...messageHistory
      ],
      temperature: 0.7
    });
    const reply = response.choices[0].message.content.trim();
    const replyAt = new Date().toISOString();
    db.prepare('INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
      .run(req.params.id, 'assistant', reply, replyAt);

    const audioResponse = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: reply,
      format: 'mp3'
    });

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const audioFile = `${req.params.id}-${Date.now()}.mp3`;
    const audioPath = path.join(audioDir, audioFile);
    fs.writeFileSync(audioPath, audioBuffer);

    res.json({ reply, audioUrl: `/audio/${audioFile}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate reply', detail: error.message });
  }
});

app.post('/api/audio/transcribe', upload.single('audio'), async (req, res) => {
  if (!requireOpenAI(res)) {
    return;
  }
  if (!req.file) {
    return res.status(400).json({ error: 'audio file is required' });
  }
  try {
    const transcription = await openai.audio.transcriptions.create({
      model: 'gpt-4o-mini-transcribe',
      file: fs.createReadStream(req.file.path)
    });
    fs.unlinkSync(req.file.path);
    res.json({ text: transcription.text });
  } catch (error) {
    res.status(500).json({ error: 'Failed to transcribe audio', detail: error.message });
  }
});

app.post('/api/sessions/:id/complete', async (req, res) => {
  if (!requireOpenAI(res)) {
    return;
  }
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const messages = getMessages(req.params.id);
  const transcript = messages.map((message) => `${message.role}: ${message.content}`).join('\n');

  const evaluationPrompt = `You are evaluating a sales associate's handling of a simulated customer in a solar energy store.\n\nReturn JSON with keys: scores, summary, suggestions, strengths, risks.\nScores must be a JSON object with numeric values 1-5 for: greeting, needs_discovery, product_matching, objection_handling, closing, communication_clarity, professionalism.\nSummary should be concise. Suggestions should be a short bullet-style string. Strengths and risks should be short strings.\nLanguage: English.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: evaluationPrompt },
        {
          role: 'user',
          content: `Scenario: ${session.scenario}\nIdeal Resolution: ${session.ideal_resolution}\nTranscript:\n${transcript}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    const parsed = safeParseJson(response.choices[0].message.content);
    const evaluation = parsed || {
      scores: {},
      summary: 'Evaluation could not be parsed. Please retry the session completion.',
      suggestions: 'Ask the customer to clarify goals, confirm constraints, and summarize next steps.',
      strengths: 'Stayed engaged with the customer.',
      risks: 'Missed structured evaluation due to parsing errors.'
    };
    evaluation.scores = normalizeScores(evaluation.scores);
    const finalScore = calculateFinalScore(evaluation.scores);
    const completedAt = new Date().toISOString();

    db.prepare(`
      UPDATE sessions
      SET status = ?, score = ?, analysis = ?, suggestions = ?, completed_at = ?
      WHERE id = ?
    `).run(
      'completed',
      finalScore,
      JSON.stringify({
        ...evaluation,
        finalScore
      }),
      evaluation.suggestions,
      completedAt,
      req.params.id
    );

    res.json({
      finalScore,
      evaluation
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete session', detail: error.message });
  }
});

app.get('/api/metrics', (req, res) => {
  const rows = db.prepare('SELECT score, completed_at FROM sessions WHERE score IS NOT NULL ORDER BY completed_at DESC').all();
  if (!rows.length) {
    return res.json({ overall: null, recentImprovement: null, totalSessions: 0 });
  }
  const totalSessions = rows.length;
  const overall = Math.round((rows.reduce((sum, row) => sum + row.score, 0) / totalSessions) * 10) / 10;
  const recent = rows.slice(0, 5);
  const previous = rows.slice(5, 10);

  const avgRecent = recent.length ? recent.reduce((sum, row) => sum + row.score, 0) / recent.length : null;
  const avgPrevious = previous.length ? previous.reduce((sum, row) => sum + row.score, 0) / previous.length : null;
  const recentImprovement = avgRecent && avgPrevious ? Math.round((avgRecent - avgPrevious) * 10) / 10 : null;

  res.json({ overall, recentImprovement, totalSessions });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
