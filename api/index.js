const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const serverless = require('serverless-http');
require('dotenv').config();

const app = express();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const POST_PASSWORD = process.env.POST_PASSWORD;
const REPO_OWNER = 'hiplitewhat';
const REPO_NAME = 'a';
const BRANCH = 'main';

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

let notes = [];

function isRobloxScript(content) {
  return content.includes('game') || content.includes('script');
}

async function obfuscate(content) {
  try {
    const res = await fetch('https://comfortable-starfish-46.deno.dev/api/obfuscate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: content })
    });

    if (!res.ok) {
      console.warn('Obfuscation API error:', await res.text());
      return content;
    }

    const data = await res.json();
    return data.obfuscated || content;
  } catch (err) {
    console.error('Obfuscation failed:', err);
    return content;
  }
}

async function storeNoteGithub(id, title, content) {
  const path = `notes/${id}.txt`;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const body = `Title: ${title}\n\n${content}`;
  const encoded = Buffer.from(body).toString('base64');

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      message: `Add note: ${id}`,
      content: encoded,
      branch: BRANCH
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error: ${text}`);
  }

  return await res.json();
}

async function loadNotesFromGithub() {
  notes = [];
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/notes?ref=${BRANCH}`;

  console.log('[loadNotesFromGithub] Fetching notes from GitHub...');

  const res = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });

  if (!res.ok) {
    console.error('Failed to load notes:', await res.text());
    return;
  }

  const files = await res.json();

  for (const file of files) {
    if (file.name.endsWith('.txt')) {
      const fileRes = await fetch(file.download_url);
      const raw = await fileRes.text();

      const [titleLine, , ...rest] = raw.split('\n');
      const title = titleLine.replace(/^Title:\s*/, '') || 'Untitled';
      const content = rest.join('\n');

      notes.push({
        id: file.name.replace('.txt', ''),
        title,
        content,
        createdAt: new Date().toISOString()
      });
    }
  }

  console.log(`[loadNotesFromGithub] Loaded ${notes.length} notes from GitHub.`);
}

function renderHTML(noteList, sortOrder = 'desc') {
  const sortedNotes = [...noteList].sort((a, b) => {
    return sortOrder === 'desc'
      ? new Date(b.createdAt) - new Date(a.createdAt)
      : new Date(a.createdAt) - new Date(b.createdAt);
  });

  const notesHtml = sortedNotes.map(note =>
    `<div class="note">
      <strong><a href="/notes/${note.id}" target="_blank">${note.title || 'Untitled'}</a></strong><br>
      ID: ${note.id}
    </div>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Notes App</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        .note { padding: 10px; background: #f0f0f0; margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>Notes</h1>
      <form method="POST" action="/notes">
        <input type="text" name="title" placeholder="Title" required><br><br>
        <textarea name="content" rows="4" cols="50" placeholder="Write your note..." required></textarea><br>
        <input type="password" name="password" placeholder="Password" required><br><br>
        <button type="submit">Save Note</button>
      </form>
      <p>Sort: 
        <a href="/?sort=desc">Newest First</a> | 
        <a href="/?sort=asc">Oldest First</a>
      </p>
      <div>${notesHtml}</div>
    </body>
    </html>`;
}

loadNotesFromGithub();

app.get('/', async (req, res) => {
  const sort = req.query.sort || 'desc';
  await loadNotesFromGithub();
  console.log('[GET /] Serving notes:', notes.length);
  res.send(renderHTML(notes, sort));
});

app.post('/notes', async (req, res) => {
  let { title, content, password } = req.body;
  console.log('[POST /notes] Received:', { title, content, password });

  if (password !== POST_PASSWORD) {
    console.warn('[POST /notes] Invalid password:', password);
    return res.status(403).send('Forbidden: Incorrect password');
  }

  if (!content) return res.status(400).send('Content is required');
  if (!title) title = 'Untitled';

  try {
    console.log('[POST /notes] Filtering title and content...');

    const filterText = async (text) => {
      const res = await fetch('https://jagged-chalk-feet.glitch.me/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (res.status === 404) {
        console.warn('[Filter] API 404 — skipping filter');
        return text;
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`[Filter] API error: ${errorText}`);
      }

      const data = await res.json();
      return data.filtered ? data.filtered.trim() : text;
    };

    title = await filterText(title);
    content = await filterText(content);

  } catch (err) {
    console.error('[POST /notes] Filtering error — continuing without changes:', err.message);
  }

  if (isRobloxScript(content)) {
    console.log('[POST /notes] Roblox script detected — obfuscating...');
    content = await obfuscate(content);
  }

  const note = {
    id: uuidv4(),
    title,
    content,
    createdAt: new Date().toISOString(),
  };

  notes.push(note);
  console.log('[POST /notes] Final note:', note);

  try {
    const ghRes = await storeNoteGithub(note.id, note.title, note.content);
    console.log('[POST /notes] GitHub success:', ghRes.content?.path);
    res.redirect('/');
  } catch (err) {
    console.error('[POST /notes] GitHub error:', err.message);
    res.status(500).send(`GitHub error: ${err.message}`);
  }
});

app.get('/notes/:id', (req, res) => {
  const userAgent = req.get('User-Agent') || '';
  if (!userAgent.includes('Roblox')) {
    return res.status(403).send('Access denied');
  }

  const note = notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).send('Not found');

  res.type('text/plain').send(note.content);
});

app.post('/filter', async (req, res) => {
  const { text } = req.body;

  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required and must be a string' });
  }

  try {
    const response = await fetch('https://jagged-chalk-feet.glitch.me/filter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `External API error: ${errText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
module.exports.handler = serverless(app);
