const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/', async (req, res) => {
  if (req.headers['user-agent'] !== 'Roblox') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { Url: url, Method = 'GET', Headers = {} } = req.body;

  // Handle case if Headers is an array of objects
  let headers = {};
  if (Array.isArray(Headers)) {
    Headers.forEach(h => {
      if (typeof h === 'object') {
        headers = { ...headers, ...h };
      }
    });
  } else if (typeof Headers === 'object') {
    headers = Headers;
  }

  try {
    const response = await axios({
      method: Method.toLowerCase(),
      url,
      headers,
    });

    res.json({
      status_code: response.status,
      headers: response.headers,
      content: response.data,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
