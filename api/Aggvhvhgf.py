
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/m', methods=['POST'])
def proxy_request():
    if request.headers.get('User-Agent') != 'Roblox':
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json()

    url = data.get('Url')
    method = data.get('Method', 'GET').upper()
    headers = data.get('Headers', {})

    if isinstance(headers, list):
        headers_dict = {}
        for header in headers:
            if isinstance(header, dict):
                headers_dict.update(header)
        headers = headers_dict

    try:
        resp = requests.request(method, url, headers=headers)
        return jsonify({
            'status_code': resp.status_code,
            'headers': dict(resp.headers),
            'content': resp.text
        }), 200
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)
