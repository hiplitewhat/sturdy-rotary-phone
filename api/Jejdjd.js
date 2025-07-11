import axios from "axios";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const FILE_PATH = process.env.GITHUB_FILE_PATH;
const EXPIRATION_DAYS = 7;

const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
const HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
};

async function fetchList() {
  const res = await axios.get(GITHUB_API, { headers: HEADERS });
  const content = Buffer.from(res.data.content, "base64").toString("utf-8");
  return [JSON.parse(content), res.data.sha];
}

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { discordId, discordTag, name } = req.body;
  const now = new Date();

  try {
    let [data, sha] = await fetchList();

    data = data.filter((entry) => {
      if (entry.status !== "left") return true;
      return new Date(entry.expiresAt) > now;
    });



    const expiresAt = new Date(now.getTime() + EXPIRATION_DAYS * 24 * 60 * 60 * 1000).getTime();

    const alreadyExists = data.some(entry => entry.name.toLowerCase() === name.toLowerCase());

if (alreadyExists) {
  return res.status(409).json({ error: `Roblox user "${name}" is already whitelisted.` });
}

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
