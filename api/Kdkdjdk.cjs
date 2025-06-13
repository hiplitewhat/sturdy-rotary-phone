import express from "express";
import axios from "axios";
import cheerio from "cheerio";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const GITHUB_REPO = process.env.GITHUB_REPO; // e.g. "your-username/your-repo"
const GITHUB_FILE_PATH = "reference_versions.json";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!GITHUB_REPO) {
  console.error("Error: GITHUB_REPO env var is not set");
  process.exit(1);
}

const [owner, repo] = GITHUB_REPO.split("/");

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const TARGET_URL = "https://executors.samrat.lol/";

async function fetchCurrentVersions() {
  const { data } = await axios.get(TARGET_URL);
  const $ = cheerio.load(data);

  const executors = {};
  $(".executor-card").each((_, el) => {
    const name = $(el).find("h3").text().trim();
    const versionText = $(el).find("span.version").text().trim();
    const version = versionText.replace("Version: ", "");
    if (name && version) {
      executors[name] = version;
    }
  });

  return executors;
}

async function getReferenceVersions() {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: GITHUB_FILE_PATH,
      ref: "main",
    });

    const content = Buffer.from(response.data.content, "base64").toString();
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
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: GITHUB_FILE_PATH,
      ref: "main",
    });
    sha = response.data.sha;
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  const content = Buffer.from(JSON.stringify(data, null, 4)).toString("base64");

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: GITHUB_FILE_PATH,
    message: `Update reference_versions.json at ${new Date().toISOString()}`,
    content,
    sha,
    branch: "main",
  });
}

async function notifyDiscord(changes) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("No Discord webhook URL set. Skipping notification.");
    return;
  }

  const content = changes.join("\n");
  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      username: "Version Monitor",
      content: `**Executor Version Changes Detected:**\n${content}`,
    });
  } catch (err) {
    console.error(
      "Failed to send Discord notification:",
      err.response?.status,
      err.response?.data || err.message
    );
  }
}

app.get("/check", async (req, res) => {
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
    } else {
      return res.json({ status: "no_changes" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Version monitor is running." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Version monitor listening on port ${PORT}`);
});
