import fetch from 'node-fetch';
import { Octokit } from "@octokit/rest";

function compareVersions(v1, v2) {
  const a = v1.split('.').map(Number);
  const b = v2.split('.').map(Number);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0; // equal
}

export default async function handler(req, res) {
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_FILEPATH = "ios_version.txt";
  const GITHUB_BRANCH = "main";
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  if (!GITHUB_REPO || !GITHUB_TOKEN || !DISCORD_WEBHOOK_URL) {
    return res.status(500).json({ error: "Missing required environment variables." });
  }

  const app_id = "431946152";
  const response = await fetch(`https://itunes.apple.com/lookup?id=${app_id}`);
  const data = await response.json();
  const version = data.results?.[0]?.version;

  if (!version) {
    return res.status(500).json({ error: "Failed to fetch version from Apple API." });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  let stored_version = null;
  let sha = null;

  try {
    const { data: fileData } = await octokit.repos.getContent({
      owner: GITHUB_REPO.split('/')[0],
      repo: GITHUB_REPO.split('/')[1],
      path: GITHUB_FILEPATH,
      ref: GITHUB_BRANCH
    });

    stored_version = Buffer.from(fileData.content, 'base64').toString().trim();
    sha = fileData.sha;
  } catch (err) {
    if (err.status !== 404) {
      console.error("GitHub read error:", err);
      return res.status(500).json({ error: "GitHub read failed." });
    }
  }

  // ✅ Skip if same or older
  if (stored_version && compareVersions(version, stored_version) <= 0) {
    return res.json({ message: `No new version. Stored: ${stored_version}, Fetched: ${version}` });
  }

  // ✅ Send Discord notification
  await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `📱 Roblox iOS updated to: **${version}**` })
  });

  // ✅ Update GitHub file
  const newContent = Buffer.from(version).toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_REPO.split('/')[0],
    repo: GITHUB_REPO.split('/')[1],
    path: GITHUB_FILEPATH,
    message: `Update iOS version to ${version}`,
    content: newContent,
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {})
  });

  return res.json({ version, discord: "sent", updated: true });
}
