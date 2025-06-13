require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const base64 = require('base-64');

const app = express();
const PORT = process.env.PORT || 3000;

const {
  GITHUB_TOKEN,
  DISCORD_WEBHOOK_URL,
  GITHUB_REPO,
  GITHUB_FILE_PATH
} = process.env;

const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
const TARGET_URL = 'https://executors.samrat.lol/';

const githubHeaders = {
  'Authorization': `token ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json'
};

async function fetchCurrentVersions() {
  const response = await axios.get(TARGET_URL);
  const $ = cheerio.load(response.data);

  const executors = {};
  $('.executor-card').each((i, elem) => {
    const name = $(elem).find('h3').text().trim();
    const versionText = $(elem).find('span.version').text().trim();
    const version = versionText.replace('Version: ', '').trim();
    executors[name] = version;
  });

  return executors;
}

async function getFileSha() {
  try {
    const response = await axios.get(GITHUB_API_URL, { headers: githubHeaders });
    return response.data.sha;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return null;
    }
    throw err;
  }
}

async function loadReferenceVersions() {
  try {
    const response = await axios.get(GITHUB_API_URL, { headers: githubHeaders });
    const content = base64.decode(response.data.content);
    return JSON.parse(content);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return {};
    }
    throw err;
  }
}

async function saveReferenceVersions(data) {
  const sha = await getFileSha();
  const content = base64.encode(JSON.stringify(data, null, 4));
  
  const payload = {
    message: `Update reference_versions.json at ${new Date().toISOString()}`,
    content: content,
    branch: 'main',
    ...(sha && { sha })
  };

  const response = await axios.put(GITHUB_API_URL, payload, { headers: githubHeaders });

  if (![200, 201].includes(response.status)) {
    throw new Error(`GitHub update failed: ${response.status} ${response.statusText}`);
  }
}

async function notifyDiscord(changes) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('No Discord webhook URL set. Skipping notification.');
    return;
  }

  const content = changes.join('\n');
  const payload = {
    username: 'Version Monitor',
    content: `**Executor Version Changes Detected:**\n${content}`
  };

  const response = await axios.post(DISCORD_WEBHOOK_URL, payload);

  if (response.status < 200 || response.status >= 300) {
    console.error(`Failed to send Discord notification: ${response.status} ${response.statusText}`);
  }
}

app.get('/', (req, res) => {
  res.json({ message: 'Version monitor is running.' });
});

app.get('/check', async (req, res) => {
  try {
    const reference = await loadReferenceVersions();
    const current = await fetchCurrentVersions();

    const changesDetected = [];

    for (const [name, currVersion] of Object.entries(current)) {
      const refVersion = reference[name];
      if (!refVersion) {
        changesDetected.push(`[NEW] ${name}: ${currVersion}`);
      } else if (refVersion !== currVersion) {
        changesDetected.push(`[UPDATED] ${name}: ${refVersion} → ${currVersion}`);
      }
    }

    if (changesDetected.length > 0) {
      await notifyDiscord(changesDetected);
      await saveReferenceVersions(current);
      res.json({ status: 'changes_detected', changes: changesDetected });
    } else {
      res.json({ status: 'no_changes' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
