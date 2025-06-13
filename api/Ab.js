
import fetch from 'node-fetch';
import { Octokit } from "@octokit/rest";

export default async function handler(req, res) {
  const GITHUB_REPO = process.env.GITHUB_REPO; // example: "hiplitewhat/roblox-version-checker"
  const GITHUB_FILEPATH = "ios_version.txt";
  const GITHUB_BRANCH = "main";
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

  // 1️⃣ Get Roblox version from Apple
  const app_id = "431946152";
  const response = await fetch(`https://itunes.apple.com/lookup?id=${app_id}`);
  const data = await response.json();
  const version = data.results[0].version;

  // 2️⃣ Initialize GitHub Octokit
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
    // If file doesn't exist yet
  }

  if (stored_version === version) {
    return res.json({ message: "Version unchanged." });
  }

  // 3️⃣ Send Discord webhook
  if (DISCORD_WEBHOOK_URL) {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `📱 Roblox iOS updated to: **${version}**` })
    });
  }

  // 4️⃣ Update GitHub file
  const newContent = Buffer.from(version).toString('base64');

  const payload = {
    owner: GITHUB_REPO.split('/')[0],
    repo: GITHUB_REPO.split('/')[1],
    path: GITHUB_FILEPATH,
    message: `Update iOS version to ${version}`,
    content: newContent,
    branch: GITHUB_BRANCH,
    sha: sha ?? undefined
  };

  await octokit.repos.createOrUpdateFileContents(payload);

  return res.json({ version, discord: "sent" });
}
