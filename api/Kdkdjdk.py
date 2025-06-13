import requests
from bs4 import BeautifulSoup
import json
import os
import base64
from datetime import datetime
from flask import Flask, jsonify

app = Flask(__name__)

# Configs — replace with your repo and set GITHUB_TOKEN env var
GITHUB_REPO = "your-username/your-repo"
GITHUB_FILE_PATH = "reference_versions.json"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE_PATH}"

headers = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json"
}

TARGET_URL = "https://executors.samrat.lol/"

def fetch_current_versions():
    resp = requests.get(TARGET_URL)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    executors = {}
    for card in soup.find_all("div", class_="executor-card"):
        name_tag = card.find("h3")
        version_tag = card.find("span", class_="version")
        if name_tag and version_tag:
            name = name_tag.text.strip()
            version = version_tag.text.replace("Version: ", "").strip()
            executors[name] = version
    return executors

def get_file_sha():
    response = requests.get(GITHUB_API_URL, headers=headers)
    if response.status_code == 200:
        return response.json()['sha']
    elif response.status_code == 404:
        return None
    else:
        response.raise_for_status()

def load_reference_versions():
    response = requests.get(GITHUB_API_URL, headers=headers)
    if response.status_code == 200:
        file_content = response.json()['content']
        decoded = base64.b64decode(file_content).decode()
        return json.loads(decoded)
    elif response.status_code == 404:
        return {}
    else:
        response.raise_for_status()

def save_reference_versions(data):
    sha = get_file_sha()
    content = base64.b64encode(json.dumps(data, indent=4).encode()).decode()

    payload = {
        "message": f"Update reference_versions.json at {datetime.utcnow().isoformat()}",
        "content": content,
        "branch": "main",
    }
    if sha:
        payload["sha"] = sha

    response = requests.put(GITHUB_API_URL, headers=headers, json=payload)
    if response.status_code not in [200, 201]:
        raise Exception(f"GitHub update failed: {response.status_code} {response.text}")

def notify_discord(changes):
    if not DISCORD_WEBHOOK_URL:
        print("No Discord webhook URL set. Skipping notification.")
        return
    content = "\n".join(changes)
    payload = {
        "username": "Version Monitor",
        "content": f"**Executor Version Changes Detected:**\n{content}"
    }
    response = requests.post(DISCORD_WEBHOOK_URL, json=payload)
    if not response.ok:
        print(f"Failed to send Discord notification: {response.status_code} {response.text}")

@app.route("/check", methods=["GET"])
def check_versions():
    try:
        reference = load_reference_versions()
        current = fetch_current_versions()

        changes_detected = []

        for name, curr_version in current.items():
            ref_version = reference.get(name)
            if ref_version is None:
                changes_detected.append(f"[NEW] {name}: {curr_version}")
            elif ref_version != curr_version:
                changes_detected.append(f"[UPDATED] {name}: {ref_version} → {curr_version}")

        if changes_detected:
            notify_discord(changes_detected)
            save_reference_versions(current)
            return jsonify({"status": "changes_detected", "changes": changes_detected})
        else:
            return jsonify({"status": "no_changes"})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/", methods=["GET"])
def health():
    return jsonify({"message": "Version monitor is running."})

if __name__ == "__main__":
    app.run(debug=True)
