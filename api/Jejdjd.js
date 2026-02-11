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

// ========================
// SERVER-SPECIFIC WHITELIST FUNCTIONS
// ========================

/**
 * Get whitelist for a specific server
 * Each server has its OWN separate whitelist!
 */
function getServerWhitelist(data, guildId) {
  if (!guildId) return [];
  
  // Filter entries for this specific server
  return data.filter(entry => entry.guild_id === guildId);
}

/**
 * Find user in a specific server's whitelist
 */
function findUserInServer(data, guildId, username) {
  if (!guildId) return null;
  
  const lowerName = username.toLowerCase();
  return data.find(e => 
    e.guild_id === guildId && 
    e.name.toLowerCase() === lowerName
  );
}

// API Route Handler
export default async function handler(req, res) {
  const now = Date.now();

  // ========================
  // GET: Check user or get all data for a server
  // ========================
  if (req.method === "GET") {
    const { name, type, guild_id } = req.query;
    
    // CRITICAL: Must have guild_id for server isolation!
    if (!guild_id) {
      return res.status(400).json({ 
        error: "Missing 'guild_id' query parameter - required for server isolation" 
      });
    }
    
    // Get all data for a SPECIFIC SERVER
    if (type === "all") {
      try {
        const [data] = await fetchList();
        // Filter data for this server only!
        const serverData = getServerWhitelist(data, guild_id);
        return res.status(200).json(serverData);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
      }
    }
    
    // Check specific user in a SPECIFIC SERVER
    if (!name) {
      return res.status(400).json({ error: "Missing 'name' query parameter" });
    }

    try {
      const [data] = await fetchList();
      
      // Find user in THIS SPECIFIC SERVER only!
      const entry = findUserInServer(data, guild_id, name);

      if (!entry) {
        return res.status(404).json({
          whitelisted: false,
          reason: "Not found in this server",
          guild_id: guild_id
        });
      }

      if (entry.status === "blacklisted") {
        return res.status(200).json({
          whitelisted: false,
          reason: "User is blacklisted in this server",
          name: entry.name,
          status: "blacklisted",
          guild_id: entry.guild_id,
          guild_name: entry.guild_name
        });
      }

      if (entry.status === "left") {
        return res.status(200).json({
          whitelisted: false,
          reason: "User has left this server",
          name: entry.name,
          guild_id: entry.guild_id
        });
      }

      // Check expiration
      if (entry.expiresAt && entry.expiresAt <= now) {
        return res.status(200).json({
          whitelisted: false,
          reason: "Whitelist expired in this server",
          name: entry.name,
          guild_id: entry.guild_id
        });
      }

      return res.status(200).json({
        whitelisted: true,
        name: entry.name,
        discordId: entry.discordId,
        discordTag: entry.discordTag,
        status: entry.status,
        expiresAt: entry.expiresAt || null,
        guild_id: entry.guild_id,
        guild_name: entry.guild_name
      });

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // ========================
  // POST: Add user to SPECIFIC SERVER'S whitelist
  // ========================
  if (req.method === "POST") {
    const { 
      discordId, 
      discordTag, 
      name, 
      status = "active", 
      expiresAt, 
      noExpiration = false,
      guild_id,        // ← CRITICAL: Must have guild_id!
      guild_name       // ← Store server name for display
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    if (!guild_id) {
      return res.status(400).json({ 
        error: "Missing required field: guild_id - each server needs its own whitelist!" 
      });
    }

    try {
      let [data, sha] = await fetchList();
      
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
      
      // Find user in THIS SPECIFIC SERVER only!
      const existingIndex = data.findIndex(e => 
        e.guild_id === guild_id && 
        e.name.toLowerCase() === lowerName
      );
      
      let expirationTime;
      if (noExpiration) {
        expirationTime = null;
      } else if (expiresAt) {
        expirationTime = expiresAt;
      } else {
        expirationTime = now + (EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
      }

      if (existingIndex >= 0) {
        // Update existing user in this server
        data[existingIndex] = {
          ...data[existingIndex],
          discordId: discordId || data[existingIndex].discordId,
          discordTag: discordTag || data[existingIndex].discordTag,
          status: status,
          expiresAt: expirationTime,
          guild_name: guild_name || data[existingIndex].guild_name,
          updatedAt: now
        };
      } else {
        // Add new user to this server's whitelist
        data.push({
          discordId,
          discordTag,
          name,
          status,
          expiresAt: expirationTime,
          guild_id,        // ← CRITICAL: Store which server this belongs to!
          guild_name,      // ← Store server name for display
          createdAt: now,
          updatedAt: now
        });
      }

      await updateList(data, sha, `✅ [Server ${guild_id}] ${name} ${existingIndex >= 0 ? 'updated' : 'added'} (${status})`);
      return res.status(200).json({ 
        success: true, 
        message: `User ${name} ${existingIndex >= 0 ? 'updated' : 'added'} in server ${guild_id}`,
        expiresAt: expirationTime,
        noExpiration: expirationTime === null,
        guild_id: guild_id,
        guild_name: guild_name
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // ========================
  // PATCH: Update user status in SPECIFIC SERVER
  // ========================
  if (req.method === "PATCH") {
    const { name, status, noExpiration = false, guild_id } = req.body;

    if (!name || !status) {
      return res.status(400).json({ error: "Missing required fields: name, status" });
    }

    if (!guild_id) {
      return res.status(400).json({ 
        error: "Missing required field: guild_id - each server has its own whitelist!" 
      });
    }

    if (!["active", "blacklisted", "left"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: active, blacklisted, left" });
    }

    try {
      let [data, sha] = await fetchList();
      const lowerName = name.toLowerCase();
      
      // Find user in THIS SPECIFIC SERVER only!
      const existingIndex = data.findIndex(e => 
        e.guild_id === guild_id && 
        e.name.toLowerCase() === lowerName
      );

      if (existingIndex < 0) {
        return res.status(404).json({ 
          error: `User "${name}" not found in server ${guild_id}` 
        });
      }

      // Update status and handle expiration
      if (status === "active") {
        if (noExpiration) {
          data[existingIndex].expiresAt = null;
        } else {
          data[existingIndex].expiresAt = now + (EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
        }
      } else if (status === "blacklisted") {
        data[existingIndex].expiresAt = now;
      }
      
      data[existingIndex].status = status;
      data[existingIndex].updatedAt = now;

      await updateList(data, sha, `🔄 [Server ${guild_id}] ${name} -> ${status}`);
      return res.status(200).json({ 
        success: true, 
        message: `User ${name} status updated to ${status} in server ${guild_id}`,
        noExpiration: noExpiration,
        guild_id: guild_id
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // ========================
  // DELETE: Remove user from SPECIFIC SERVER
  // ========================
  if (req.method === "DELETE") {
    const { name, guild_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    if (!guild_id) {
      return res.status(400).json({ 
        error: "Missing required field: guild_id - each server has its own whitelist!" 
      });
    }

    try {
      let [data, sha] = await fetchList();
      const lowerName = name.toLowerCase();
      const initialLength = data.length;
      
      // Remove user from THIS SPECIFIC SERVER only!
      data = data.filter(e => 
        !(e.guild_id === guild_id && e.name.toLowerCase() === lowerName)
      );

      if (data.length === initialLength) {
        return res.status(404).json({ 
          error: `User "${name}" not found in server ${guild_id}` 
        });
      }

      await updateList(data, sha, `🗑️ [Server ${guild_id}] Removed ${name}`);
      return res.status(200).json({ 
        success: true, 
        message: `User ${name} removed from server ${guild_id}` 
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Method not allowed
  return res.status(405).json({ error: "Method Not Allowed" });
    }
