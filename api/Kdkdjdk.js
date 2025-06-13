import axios from "axios";
import { load } from "cheerio";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const { GITHUB_REPO, DISCORD_WEBHOOK_URL, GITHUB_TOKEN } = process.env;

if (!GITHUB_REPO || !GITHUB_TOKEN) {
  throw new Error("GITHUB_REPO and GITHUB_TOKEN env vars must be set");
}

const [owner, repo] = GITHUB_REPO.split("/");
const GITHUB_FILE_PATH = "reference_versions.json";
const TARGET_URL = "https://executors.samrat.lol/";
const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function fetchCurrentVersions() {
  const { data } = await axios.get(TARGET_URL);
  const $ = load(data);
  const executors = {};
  $(".executor-card").each((_, el) => {
    const name = $(el).find("h3").text().trim();
    const versionText = $(el).find("span.version").text().trim();
    const version = versionText.replace("Version: ", "");
    if (name && version) executors[name] = version;
  });
  return executors;
}

async function getReferenceVersions() {
  try {
    const { data } = await octokit.repos.getContent({
      owner, repo, path: GITHUB_FILE_PATH, ref: "main",
    });

    const content = Buffer.from(data.content, "base64").toString();
    return JSON.parse(content);
  } catch (err) {
    if (err.status === 404) {
      return {};
    }
    throw err;
  }
}

async function saveReferenceVersions(data) {
  let sha;
  try {
    const { data: existing } = await octokit.repos.getContent({
      owner, repo, path: GITHUB_FILE_PATH, ref: "main",
    });
    sha = existing.sha;
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

  await octokit.repos.createOrUpdateFileContents({
    owner, repo, path: GITHUB_FILE_PATH,
    message: `Update reference_versions.json at ${new Date().toISOString()}`,
    content, sha, branch: "main",
  });
}

async function notifyDiscord(changes) {
  if (!DISCORD_WEBHOOK_URL) return;
  const content = changes.join("\n");
  await axios.post(DISCORD_WEBHOOK_URL, {
    username: "Version Monitor",
    content: `**Executor Version Changes Detected:**\n${content}`,
  });
}

export default async function handler(req, res) {
  try {
    const reference = await getReferenceVersions();
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

    if (changesDetected.length) {
      await notifyDiscord(changesDetected);
      await saveReferenceVersions(current);
      return res.json({ status: "changes_detected", changes: changesDetected });
    }

    res.json({ status: "no_changes" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: err.message });
  }
}
