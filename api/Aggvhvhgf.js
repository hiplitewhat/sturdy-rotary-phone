import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  // Check User-Agent header
  if (req.headers['user-agent'] !== 'Roblox') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { Url: url, Method = 'GET', Headers = {} } = req.body || {};

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Invalid or missing Url' });
    return;
  }

  // Normalize headers if array
  let headers = {};
  if (Array.isArray(Headers)) {
    Headers.forEach(h => {
      if (typeof h === 'object' && h !== null) {
        headers = { ...headers, ...h };
      }
    });
  } else if (typeof Headers === 'object' && Headers !== null) {
    headers = Headers;
  }

  try {
    const response = await axios({
      method: Method.toLowerCase(),
      url,
      headers,
    });

    res.status(200).json({
      status_code: response.status,
      headers: response.headers,
      content: response.data,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
