
# api/index.py

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import aiohttp
import base64
import json
import os

from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

# --- Constants
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
REPO = os.getenv("GITHUB_REPO")
FILE_PATH = os.getenv("GITHUB_FILE_PATH")
EXPIRATION_DAYS = 7

GITHUB_API = f"https://api.github.com/repos/{REPO}/contents/{FILE_PATH}"
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

# --- Models
class WhitelistRequest(BaseModel):
    discordId: str
    discordTag: Optional[str] = None
    name: str

# --- GitHub Helpers
async def fetch_list():
    async with aiohttp.ClientSession() as session:
        async with session.get(GITHUB_API, headers=HEADERS) as resp:
            data = await resp.json()
            content = base64.b64decode(data['content']).decode('utf-8')
            return json.loads(content), data['sha']

async def update_list(list_data, sha, message):
    content_b64 = base64.b64encode(json.dumps(list_data, indent=2).encode()).decode()
    payload = {
        "message": message,
        "content": content_b64,
        "sha": sha
    }
    async with aiohttp.ClientSession() as session:
        async with session.put(GITHUB_API, headers=HEADERS, json=payload) as resp:
            return await resp.json()

# --- Routes
@app.post("/whitelist")
async def whitelist_user(req: WhitelistRequest):
    now = datetime.utcnow()
    data, sha = await fetch_list()

    data = [
        entry for entry in data
        if entry.get("status") != "left" or datetime.fromtimestamp(entry["expiresAt"] / 1000) > now
    ]

    if any(entry["discordId"] == req.discordId and entry["status"] == "active" for entry in data):
        return {"error": "Already whitelisted"}

    expires_at = int((now + timedelta(days=EXPIRATION_DAYS)).timestamp() * 1000)
    data.append({
        "discordId": req.discordId,
        "discordTag": req.discordTag,
        "name": req.name,
        "status": "active",
        "expiresAt": expires_at
    })

    await update_list(data, sha, f"✅ Whitelist added for {req.name}")
    return {"message": f"Whitelisted {req.name}", "expiresAt": expires_at}


# Export ASGI handler
handler = app
