import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const userAgent = req.headers['user-agent'] || '';
  if (!userAgent.toLowerCase().includes('roblox')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { Url: url, Method = 'GET', Headers = {}, Body } = req.body || {};

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Invalid or missing Url' });
    return;
  }

  // Normalize headers
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

  const axiosConfig = {
    method: Method.toLowerCase(),
    url,
    headers,
  };

  if (['post', 'put', 'patch'].includes(Method.toLowerCase()) && Body !== undefined) {
    axiosConfig.data = Body;
  }

  try {
    const response = await axios(axiosConfig);

    // Forward Content-Type header if exists
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    }

    res.status(response.status).send(response.data);

  } catch (error) {
    if (error.response) {
      if (error.response.headers['content-type']) {
        res.setHeader('Content-Type', error.response.headers['content-type']);
      }
      res.status(error.response.status).send(error.response.data);
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}
