const express = require('express');
const path = require('path');
const db = require('./lib/database'); // Import database module

// Initialize Database
(async () => {
  try {
    // Using a specific database file for the application
    await db.initDb(path.join('config', 'callattendant.db'));
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1); // Exit if DB fails to initialize
  }
})();

const fs = require('fs'); // Added for directory creation

// Create voicemails directory
const voicemailsDir = path.join(__dirname, '..', 'voicemails');
if (!fs.existsSync(voicemailsDir)) {
  fs.mkdirSync(voicemailsDir, { recursive: true });
  console.log('Created voicemails directory:', voicemailsDir);
}

// Initialize MQTT Client
const mqttClient = require('./lib/mqttClient');
// Configuration for MQTT (could be moved to a config file)
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || 'callAttendantNodeJsApp';

mqttClient.connect(MQTT_BROKER_URL, { clientId: MQTT_CLIENT_ID });

// Initialize Email Service
const nodemailer = require('nodemailer'); // Import nodemailer
const emailService = require('./lib/emailService');

(async () => {
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log('Ethereal test account created for email notifications.');
    console.log('Credentials obtained, User: %s, Pass: %s', testAccount.user, testAccount.pass);
    // For manual checking, you can log these or view the Ethereal inbox.
    // For automated tests, nodemailer.getTestMessageUrl(info) is better after sending.

    emailService.configureService({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
      tls: {
        rejectUnauthorized: false // Often necessary for Ethereal/self-signed
      }
    });
  } catch (err) {
    console.error('Failed to create a test email account or configure service. Email notifications might be disabled.', err);
    emailService.configureService(null); // Ensure it's set to null if setup fails
  }
})();


// Create an Express application instance
const app = express();

// Middleware
app.use(express.json()); // For parsing JSON request bodies
app.use(express.urlencoded({ extended: true })); // For parsing URL-encoded request bodies

// Serve static files from 'public' directory (e.g., for favicons, manifest.json)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Temporary endpoint for testing MQTT publishing
app.post('/api/test-mqtt', (req, res) => {
  const { topic, message } = req.body;
  if (!topic || !message) {
    return res.status(400).json({ error: 'Topic and message are required.' });
  }
  try {
    mqttClient.publish(topic, message);
    res.status(200).json({ success: true, message: `Attempted to publish to ${topic}` });
  } catch (err) {
    console.error('API Error (POST /api/test-mqtt):', err);
    res.status(500).json({ error: 'Failed to publish MQTT message.' });
  }
});

// Serve Preact frontend
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// Catch-all GET route to serve Preact's index.html for client-side routing
app.get('*', (req, res) => {
  const indexPath = path.join(clientDistPath, 'index.html');
  // Check if index.html exists before sending
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Fallback if index.html is not found (e.g., client not built yet)
    res.status(404).send('Client application not found. Please run the client build.');
  }
});

// Port Configuration
const PORT = process.env.PORT || 3000;

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app; // Export for potential testing or advanced use cases
