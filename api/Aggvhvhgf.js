import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const userAgent = req.headers['user-agent'] || '';
  if (!userAgent.includes('Roblox')) {
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

  // Optional: URL whitelist check
  // if (!url.startsWith('https://allowed-domain.com')) {
  //   res.status(403).json({ error: 'URL not allowed' });
  //   return;
  // }

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
    res.status(response.status).json({
      status_code: response.status,
      headers: response.headers,
      content: response.data,
    });
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json({
        status_code: error.response.status,
        headers: error.response.headers,
        content: error.response.data,
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
}
