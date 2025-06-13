import os
import json
import base64
import requests
from flask import Flask, request

app = Flask(__name__)

# Config variables
GITHUB_REPO = "yourusername/roblox-version-tracker"  # <-- change this
GITHUB_FILEPATH = "ios_version.txt"
GITHUB_BRANCH = "main"

@app.route("/a", methods=["GET"])
def check_version():
    # Fetch version from Apple Store
    app_id = "431946152"
    url = f"https://itunes.apple.com/lookup?id={app_id}"
    response = requests.get(url)
    data = response.json()
    version = data['results'][0]['version']

    # Fetch current version from GitHub
    github_api_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILEPATH}?ref={GITHUB_BRANCH}"
    headers = {
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github.v3+json"
    }

    github_response = requests.get(github_api_url, headers=headers)
    github_data = github_response.json()

    if github_response.status_code == 200:
        stored_version = base64.b64decode(github_data['content']).decode().strip()
        sha = github_data['sha']
    else:
        stored_version = None
        sha = None

    # Compare versions
    if stored_version == version:
        return {"message": "Version unchanged."}

    # Send Discord webhook
    discord_webhook = os.environ.get("DISCORD_WEBHOOK_URL")
    if discord_webhook:
        requests.post(discord_webhook, json={"content": f"📱 Roblox iOS updated to: **{version}**"})

    # Update GitHub file
    new_content = base64.b64encode(version.encode()).decode()
    payload = {
        "message": f"Update iOS version to {version}",
        "content": new_content,
        "branch": GITHUB_BRANCH
    }
    if sha:
        payload["sha"] = sha

    github_update = requests.put(github_api_url, headers=headers, json=payload)
    return {"version": version, "discord": "sent"}
