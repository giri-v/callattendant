const express = require('express');
const path = require('path');
const fs = require('fs'); // fs is used for directory creation

// Load Configuration
const { getConfig } = require('./lib/configLoader');
const appConfig = getConfig(); // Load config at the very beginning

// Initialize Database
const db = require('./lib/database');
(async () => {
  try {
    await db.initDb(appConfig.database.filePath); // Use path from config
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
})();

// Create voicemails directory (using path from config if available, or default)
const voicemailsDir = path.join(__dirname, '..', appConfig.voicemail.directory || 'voicemails');
if (!fs.existsSync(voicemailsDir)) {
  fs.mkdirSync(voicemailsDir, { recursive: true });
  console.log('Created voicemails directory:', voicemailsDir);
}

// Initialize MQTT Client
const mqttClient = require('./lib/mqttClient');
const mqttClientId = `${appConfig.mqtt.clientIdPrefix}_${Date.now()}`;
mqttClient.connect(appConfig.mqtt.brokerUrl, { clientId: mqttClientId });

// Initialize Email Service
const nodemailer = require('nodemailer');
const emailService = require('./lib/emailService');

(async () => {
  try {
    // Use Ethereal for testing by default, but allow overriding via config.json in a real setup
    // For this exercise, we'll stick to Ethereal via createTestAccount.
    // In a production scenario, appConfig.email.transportOptions would be used.
    if (process.env.NODE_ENV === 'test_email_with_real_config_DONT_COMMIT') { // Example guard
        // emailService.configureService(appConfig.email.transportOptions);
        console.warn("Using real email config - this should not be in committed code for testing purposes unless properly guarded!");
    } else {
        const testAccount = await nodemailer.createTestAccount();
        console.log('Ethereal test account created for email notifications.');
        console.log('Credentials obtained, User: %s, Pass: %s', testAccount.user, testAccount.pass);
        emailService.configureService({
          host: testAccount.smtp.host,
          port: testAccount.smtp.port,
          secure: testAccount.smtp.secure,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
          tls: {
            rejectUnauthorized: false // Often necessary for Ethereal
          }
        });
    }
  } catch (err) {
    console.error('Failed to configure email service. Email notifications might be disabled.', err);
    emailService.configureService(null);
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
const PORT = process.env.PORT || appConfig.server.port || 3000;

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app; // Export for potential testing or advanced use cases
