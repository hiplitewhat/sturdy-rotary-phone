export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { title, content } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: 'Missing title or content' });
  }

  try {
    const response = await fetch('https://workspace-chi-seven.vercel.app/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'First-Example': 'Test',
        'Second-Example': 'Test2',
        'Cookie': 'session=exampletoken; cookietwo=exampletwo',
      },
      body: JSON.stringify({
        title,
        content,
        password: 'X9f$2vLp!rT7#qBn',  // Password always sent
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}
