const express = require('express');
const app = express();

// In-memory command store with basic locking logic
const commands = {};
const lock = {
  acquire: (fn) => fn()  // Simple lock simulation for this case (single-threaded)
};

// /set endpoint
app.get('/set', (req, res) => {
  const target = req.query.target;
  const command = req.query.command;

  if (!target || !command) {
    return res.status(400).json({ status: 'error', message: 'Missing target or command' });
  }

  lock.acquire(() => {
    commands[target] = command;
  });

  console.log(`✅ Set command for ${target}: ${command}`);
  return res.json({ status: 'success', target, command });
});

// /get endpoint
app.get('/get', (req, res) => {
  const target = req.query.target;

  if (!target) {
    return res.status(400).json({ status: 'error', message: 'Missing target' });
  }

  let command = null;
  lock.acquire(() => {
    command = commands[target];
    delete commands[target];
  });

  if (command) {
    console.log(`📤 Sent command to ${target}: ${command}`);
    return res.json({ command });
  } else {
    return res.json({});
  }
});

// Export for Vercel
module.exports = app;
