
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (req.method === 'GET' && pathname === '/') {
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head><title>Create Paste</title></head>
      <body>
        <h1>Create a Paste</h1>
        <form method="POST" action="/api/paste">
          <textarea name="content" rows="10" cols="40" placeholder="Enter content here..."></textarea><br>
          <button type="submit">Create Paste</button>
        </form>
      </body>
      </html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (req.method === 'POST' && pathname === '/api/paste') {
    const form = await req.formData();
    const content = form.get('content')?.toString();

    const API_TOKEN = process.env.PASTECODE_API_TOKEN;
    if (!API_TOKEN || !content) {
      return new Response('Missing API token or content', { status: 400 });
    }

    const pasteData = {
      title: 'New Paste from Vercel Edge',
      exposure: 'public',
      expiration: 'never',
      pasteFiles: [{ syntax: 'plaintext', code: content }],
    };

    try {
      const response = await fetch('https://pastecode.dev/api/pastes', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json', // FIXED: Added Content-Type
          Authorization: `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify(pasteData),
      });

      const data = await response.json();

      if (response.ok) {
        return new Response(
          `<p>Paste created: <a href="${data.url}">${data.url}</a></p>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      } else {
        console.log('PasteCode API Error:', data); // DEBUG: Print API error details
        return new Response(`Error: ${data.message || 'Paste creation failed'}`, { status: 500 });
      }
    } catch (err: any) {
      console.log('Unexpected Error:', err); // DEBUG: Print unexpected errors
      return new Response(`Unexpected error: ${err.message || err}`, { status: 500 });
    }
  }

  return new Response('Not Found', { status: 404 });
}
