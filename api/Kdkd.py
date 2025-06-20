from flask import Flask, render_template_string, request, Response
import requests

app = Flask(__name__)

@app.route('/m/template/<int:template_id>')
def show_template(template_id):
    image_url = f'/api/image/{template_id}'
    html = f'''
    <h1>Roblox Template Viewer</h1>
    <p>Template ID: {template_id}</p>
    <img src="{image_url}" alt="Roblox Template" style="max-width:500px;"><br>
    <p><a href="/api/">Go back</a></p>
    '''
    return render_template_string(html)

@app.route('/m/image/<int:template_id>')
def proxy_image(template_id):
    robloxdex_url = f'https://robloxdex.com/template/{template_id}.png'
    try:
        response = requests.get(robloxdex_url, timeout=5)
        if response.status_code != 200:
            return f"Image not found for template ID {template_id}", 404
        return Response(
            response.content,
            mimetype='image/png',
            headers={'Cache-Control': 'public, max-age=3600'}
        )
    except requests.exceptions.RequestException as e:
        return f"Error retrieving image: {str(e)}", 502

@app.route('/m/')
def home():
    return '''
    <h1>Roblox Template Viewer</h1>
    <form action="/api/template/" method="get">
        <label>Enter Template ID:</label>
        <input type="number" name="id" required>
        <input type="submit" value="View Template">
    </form>
    '''

@app.route('/m/template/')
def redirect_to_template():
    template_id = request.args.get('id')
    if template_id and template_id.isdigit():
        return f'<script>window.location.href = "/api/template/{template_id}";</script>'
    return "Invalid template ID", 400
