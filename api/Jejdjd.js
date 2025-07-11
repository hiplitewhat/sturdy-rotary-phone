import axios from "axios";

// Environment Variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const FILE_PATH = process.env.GITHUB_FILE_PATH;
const EXPIRATION_DAYS = 7;

// GitHub API Config
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

// Fetch whitelist data
async function fetchList() {
  const res = await axios.get(GITHUB_API, { headers: HEADERS });
  const content = Buffer.from(res.data.content, "base64").toString("utf-8");
  return [JSON.parse(content), res.data.sha];
}

// Update whitelist on GitHub
async function updateList(listData, sha, message) {
  const contentB64 = Buffer.from(JSON.stringify(listData, null, 2)).toString("base64");
  const payload = {
    message,
    content: contentB64,
    sha,
  };
  const res = await axios.put(GITHUB_API, payload, { headers: HEADERS });
  return res.data;
}

// API Route Handler
export default async function handler(req, res) {
  const now = new Date();

  // GET: Check if a user is whitelisted
  if (req.method === "GET") {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: "Missing 'name' query parameter" });

    try {
      const [data] = await fetchList();
      const lowerName = name.toLowerCase();

      const entry = data.find(e => e.name.toLowerCase() === lowerName);

      if (!entry) {
        return res.status(404).json({
          whitelisted: false,
          reason: "Not found",
        });
      }

      const isExpired = new Date(entry.expiresAt) <= now;

      if (entry.status === "left") {
        return res.status(200).json({
          whitelisted: false,
          reason: "User has left",
          name: entry.name,
          expired: isExpired,
        });
      }

      if (isExpired) {
        return res.status(200).json({
          whitelisted: false,
          reason: "Whitelist expired",
          name: entry.name,
        });
      }

      return res.status(200).json({
        whitelisted: true,
        name: entry.name,
        expiresAt: entry.expiresAt,
      });

    } catch (err) {
      console.error(err.response?.data || err.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // POST: Add a new user to the whitelist
  if (req.method === "POST") {
    const { discordId, discordTag, name } = req.body;

    if (!discordId || !discordTag || !name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      let [data, sha] = await fetchList();

      // Clean up: remove expired "left" users
      data = data.filter(entry => {
        if (entry.status !== "left") return true;
        return new Date(entry.expiresAt) > now;
      });

      const alreadyExists = data.some(
        entry => entry.name.toLowerCase() === name.toLowerCase()
      );

      if (alreadyExists) {
        return res.status(409).json({ error: `Roblox user "${name}" is already whitelisted.` });
      }

      const expiresAt = new Date(now.getTime() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

      data.push({
        discordId,
        discordTag,
        name,
        status: "active",
        expiresAt,
      });

      await updateList(data, sha, `✅ Whitelist added for ${name}`);
      return res.status(200).json({ message: `Whitelisted ${name}`, expiresAt });
    } catch (err) {
      console.error(err.response?.data || err.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: "Method Not Allowed" });
}
