import axios from "axios";

// Environment Variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const FILE_PATH = process.env.GITHUB_FILE_PATH || "data/whitelist.json";
const EXPIRATION_DAYS = 7; // Default if expiration is enabled

// GitHub API Config
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

// Fetch whitelist data
async function fetchList() {
  try {
    const res = await axios.get(GITHUB_API, { headers: HEADERS });
    const content = Buffer.from(res.data.content, "base64").toString("utf-8");
    return [JSON.parse(content), res.data.sha];
  } catch (error) {
    // If file doesn't exist, create empty array
    if (error.response?.status === 404) {
      return [[], null];
    }
    throw error;
  }
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
  const now = Date.now();

  // GET: Check if a user is whitelisted or get all data
  if (req.method === "GET") {
    const { name, type } = req.query;
    
    // Get all data (for /whitelists and /blacklists commands)
    if (type === "all") {
      try {
        const [data] = await fetchList();
        return res.status(200).json(data);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }
    
    // Check specific user
    if (!name) {
      return res.status(400).json({ error: "Missing 'name' query parameter" });
    }

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

      if (entry.status === "blacklisted") {
        return res.status(200).json({
          whitelisted: false,
          reason: "User is blacklisted",
          name: entry.name,
          status: "blacklisted",
        });
      }

      if (entry.status === "left") {
        return res.status(200).json({
          whitelisted: false,
          reason: "User has left",
          name: entry.name,
        });
      }

      // Check expiration only if expiresAt exists (for backward compatibility)
      if (entry.expiresAt && entry.expiresAt <= now) {
        return res.status(200).json({
          whitelisted: false,
          reason: "Whitelist expired",
          name: entry.name,
        });
      }

      return res.status(200).json({
        whitelisted: true,
        name: entry.name,
        discordId: entry.discordId,
        discordTag: entry.discordTag,
        status: entry.status,
        expiresAt: entry.expiresAt || null, // null means no expiration
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // POST: Add/Update user in whitelist (with expiration option)
  if (req.method === "POST") {
    const { discordId, discordTag, name, status = "active", expiresAt, noExpiration = false } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    try {
      let [data, sha] = await fetchList();
      
      // If SHA is null (new file), we need to create it
      if (sha === null) {
        const createRes = await axios.put(
          GITHUB_API,
          {
            message: "Create whitelist file",
            content: Buffer.from(JSON.stringify([], null, 2)).toString("base64")
          },
          { headers: HEADERS }
        );
        sha = createRes.data.sha;
        data = [];
      }

      const lowerName = name.toLowerCase();
      const existingIndex = data.findIndex(e => e.name.toLowerCase() === lowerName);
      
      let expirationTime;
      if (noExpiration) {
        expirationTime = null; // No expiration
      } else if (expiresAt) {
        expirationTime = expiresAt;
      } else {
        expirationTime = now + (EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
      }

      if (existingIndex >= 0) {
        // Update existing user
        data[existingIndex] = {
          ...data[existingIndex],
          discordId: discordId || data[existingIndex].discordId,
          discordTag: discordTag || data[existingIndex].discordTag,
          status: status,
          expiresAt: expirationTime,
          updatedAt: now
        };
      } else {
        // Add new user
        data.push({
          discordId,
          discordTag,
          name,
          status,
          expiresAt: expirationTime,
          createdAt: now,
          updatedAt: now
        });
      }

      await updateList(data, sha, `✅ Updated ${name} (${status})`);
      return res.status(200).json({ 
        success: true, 
        message: `User ${name} ${existingIndex >= 0 ? 'updated' : 'added'}`,
        expiresAt: expirationTime,
        noExpiration: expirationTime === null
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // PATCH: Update user status (for blacklist/unblacklist)
  if (req.method === "PATCH") {
    const { name, status, noExpiration = false } = req.body;

    if (!name || !status) {
      return res.status(400).json({ error: "Missing required fields: name, status" });
    }

    if (!["active", "blacklisted", "left"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: active, blacklisted, left" });
    }

    try {
      let [data, sha] = await fetchList();
      const lowerName = name.toLowerCase();
      const existingIndex = data.findIndex(e => e.name.toLowerCase() === lowerName);

      if (existingIndex < 0) {
        return res.status(404).json({ error: `User "${name}" not found` });
      }

      // Update status and handle expiration
      if (status === "active") {
        if (noExpiration) {
          data[existingIndex].expiresAt = null; // No expiration
        } else {
          data[existingIndex].expiresAt = now + (EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
        }
      } else if (status === "blacklisted") {
        data[existingIndex].expiresAt = now; // Immediate expiration
      }
      
      data[existingIndex].status = status;
      data[existingIndex].updatedAt = now;

      await updateList(data, sha, `🔄 Status updated: ${name} -> ${status}`);
      return res.status(200).json({ 
        success: true, 
        message: `User ${name} status updated to ${status}`,
        noExpiration: noExpiration
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // DELETE: Remove user from list
  if (req.method === "DELETE") {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    try {
      let [data, sha] = await fetchList();
      const lowerName = name.toLowerCase();
      const initialLength = data.length;
      
      data = data.filter(e => e.name.toLowerCase() !== lowerName);

      if (data.length === initialLength) {
        return res.status(404).json({ error: `User "${name}" not found` });
      }

      await updateList(data, sha, `🗑️ Removed ${name} from list`);
      return res.status(200).json({ 
        success: true, 
        message: `User ${name} removed` 
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: "Method Not Allowed" });
          }
