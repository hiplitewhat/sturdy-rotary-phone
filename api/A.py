import json
import requests
import os

GITHUB_REPO = "yourusername/roblox-version-tracker"
GITHUB_FILEPATH = "ios_version.txt"
GITHUB_BRANCH = "main"

def handler(request):
    app_id = "431946152"
    url = f"https://itunes.apple.com/lookup?id={app_id}"
    response = requests.get(url)
    if response.status_code != 200:
        return {"statusCode": 500, "body": "Failed to fetch iOS version"}

    data = response.json()
    version = data['results'][0]['version']

    # Read version from GitHub
    github_api_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILEPATH}?ref={GITHUB_BRANCH}"
    headers = {
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github.v3+json"
    }

    github_response = requests.get(github_api_url, headers=headers)
    github_data = github_response.json()

    if github_response.status_code == 200:
        import base64
        stored_version = base64.b64decode(github_data['content']).decode().strip()
        sha = github_data['sha']
    else:
        stored_version = None
        sha = None

    if stored_version == version:
        return {"statusCode": 200, "body": json.dumps({"message": "Version unchanged."})}

    # Send Discord webhook
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL")
    discord_payload = {"content": f"📱 Roblox iOS version updated: **{version}**"}
    requests.post(webhook_url, json=discord_payload)

    # Update version file in GitHub
    new_content = base64.b64encode(version.encode()).decode()
    payload = {
        "message": f"Update iOS version to {version}",
        "content": new_content,
        "branch": GITHUB_BRANCH
    }
    if sha:
        payload["sha"] = sha

    github_update = requests.put(github_api_url, headers=headers, json=payload)

    if github_update.status_code not in [200, 201]:
        return {"statusCode": 500, "body": "Failed to update GitHub"}

    return {"statusCode": 200, "body": json.dumps({"version": version, "discord": "sent"})}
