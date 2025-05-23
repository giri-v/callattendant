const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const dbManager = require('./lib/database');
const CallRouter = require('./lib/callRouter');
// patternMatcher.js is used by CallRouter internally, so direct import isn't needed here.

// Mock Modem class
class MockModem extends EventEmitter {
  constructor(portName) {
    super();
    this.portName = portName;
    console.log(`MockModem initialized for port: ${portName}`);
  }

  // Methods that CallRouter might call, can be simple stubs if not core to routing logic
  sendCommand(command) {
    console.log(`MockModem: sendCommand called with: ${command}`);
  }

  open() {
    console.log(`MockModem: open called for ${this.portName}`);
    // Emit open event shortly after to simulate real modem behavior
    setTimeout(() => this.emit('open'), 10);
  }

  close() {
    console.log(`MockModem: close called for ${this.portName}`);
  }
}

// Define the path for the test database
const testDbPath = path.join('config', 'test_router.db');
const configDir = path.dirname(testDbPath);

async function setupTestDatabase() {
  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  // Delete old test database file if it exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log(`Deleted old test database: ${testDbPath}`);
  }

  dbManager.initDb(testDbPath);
  // Allow db init to complete - in a real test framework, might use a promise from initDb
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- Populating Test Database ---');
  // Permitted Numbers
  await dbManager.addPermittedNumber('1111111111', 'Mom');
  await dbManager.addPermittedNumber('2222222222', 'Best Friend');

  // Blocked Numbers
  await dbManager.addBlockedNumber('9999999999', 'Known Scammer');
  await dbManager.addBlockedNumber('8888888888', 'Telemarketer Inc.');

  // Permitted Patterns
  await dbManager.addPermittedPattern('^Friend', 'name', 'Permit names starting with Friend');
  await dbManager.addPermittedPattern('^(\\+1)?555\\d{7}$', 'number', 'Permit local 555 numbers');

  // Blocked Patterns
  await dbManager.addBlockedPattern('Bad Company', 'any', 'Block "Bad Company" in name or number');
  await dbManager.addBlockedPattern('^(\\+1)?400\\d{7}$', 'number', 'Block 400-prefix numbers');
  await dbManager.addBlockedPattern('SUSPICIOUS', 'name', 'Block names containing SUSPICIOUS');

  console.log('Test database populated.');
  console.log('Permitted numbers:', await dbManager.getPermittedNumbers());
  console.log('Blocked numbers:', await dbManager.getBlockedNumbers());
  console.log('Permitted patterns:', await dbManager.getPermittedPatterns(false));
  console.log('Blocked patterns:', await dbManager.getBlockedPatterns(false));
  console.log('--------------------------------\n');
}

async function runCallRouterTests() {
  await setupTestDatabase();

  const mockModem = new MockModem('COM_TEST_ROUTER');
  // CallRouter subscribes to events upon instantiation
  const callRouter = new CallRouter(mockModem, dbManager);

  // --- Test Scenarios ---
  console.log('\n--- Scenario 1: Call from Permitted Number (Mom) ---');
  mockModem.emit('callerId', { number: '1111111111', name: 'Mom', date: '1201', time: '1000' });
  mockModem.emit('ring');
  mockModem.emit('ring');
  // Expected: Allowed (Permitted List)

  await new Promise(resolve => setTimeout(resolve, 100)); // Allow async operations to settle

  console.log('\n--- Scenario 2: Call from Blocked Number (Known Scammer) ---');
  mockModem.emit('callerId', { number: '9999999999', name: 'Known Scammer', date: '1201', time: '1005' });
  mockModem.emit('ring');
  // Expected: Blocked (Blocked List)

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 3: Call matching Permitted Name Pattern (Friend Alice) ---');
  mockModem.emit('callerId', { number: '3333333333', name: 'Friend Alice', date: '1201', time: '1010' });
  mockModem.emit('ring');
  // Expected: Allowed (Permitted Name Pattern)

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 4: Call matching Permitted Number Pattern (Local 555) ---');
  mockModem.emit('callerId', { number: '5551234567', name: 'Local Business', date: '1201', time: '1015' });
  mockModem.emit('ring');
  // Expected: Allowed (Permitted Number Pattern)

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 5: Call matching Blocked Name Pattern (SUSPICIOUS CALLER) ---');
  mockModem.emit('callerId', { number: '4444444444', name: 'SUSPICIOUS CALLER', date: '1201', time: '1020' });
  // Expected: Blocked (Blocked Name Pattern)

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 6: Call matching Blocked Number Pattern (400-prefix) ---');
  mockModem.emit('callerId', { number: '4001112222', name: 'Another Company', date: '1201', time: '1025' });
  mockModem.emit('ring');
  // Expected: Blocked (Blocked Number Pattern)

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 7: Call matching Blocked "any" Pattern (Bad Company in name) ---');
  mockModem.emit('callerId', { number: '7776665555', name: 'Watch out for Bad Company', date: '1201', time: '1030' });
  mockModem.emit('ring');
  // Expected: Blocked (Blocked Name Pattern - as checkPatterns is called for name first)

  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('\n--- Scenario 8: Unknown number, default action ---');
  mockModem.emit('callerId', { number: '1230009876', name: 'Mystery Caller', date: '1201', time: '1035' });
  mockModem.emit('ring');
  mockModem.emit('ring');
  mockModem.emit('ring');
  // Expected: Allowed (Default Action)

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 9: Ring events before Caller ID ---');
  // Call router will reset on the first CID if number changes.
  // Let's simulate a new call where rings come first, then CID.
  mockModem.emit('ring'); // Ring 1 for new call (no CID yet)
  mockModem.emit('ring'); // Ring 2 for new call (no CID yet)
  mockModem.emit('callerId', { number: '7654321098', name: 'Late Comer CID', date: '1201', time: '1040' }); // Default allow
  mockModem.emit('ring'); // Ring 3 (now with CID)
  // Expected: Allowed (Default Action), ring count should reflect pre-CID rings.

  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('\n--- Scenario 10: Caller ID updates for the same call (e.g. withheld then shown) ---');
  // First CID (e.g. "Withheld")
  mockModem.emit('callerId', { number: null, name: 'WITHHELD NUMBER', date: '1201', time: '1045' });
  mockModem.emit('ring');
  // Second CID for the same call (number now appears)
  mockModem.emit('callerId', { number: '2222222222', name: 'Best Friend Revealed', date: '1201', time: '1045' });
  // This should not reset the call state if the previous number was null and now we get a number.
  // OR if the router's logic for "new call" is strictly based on number change from non-null to different non-null.
  // Current CallRouter resets if currentCall.number is not null AND different.
  // So this scenario will update the existing currentCall.
  // Expected: Allowed (Permitted List for 2222222222)

  await new Promise(resolve => setTimeout(resolve, 500)); // Longer wait for all logs

  console.log('\n--- Call Router Tests Finished ---');
  // To properly check currentCall state, you might need to expose it from CallRouter or add specific getter methods.
  // For now, we rely on console logs.
}

async function runVoicemailTest() {
  console.log('\n\n--- Starting Voicemail Test Scenario ---');
  await setupTestDatabase(); // Re-setup DB for a clean state

  const mockModem = new MockModem('COM_VOICEMAIL_TEST');
  // Mock modemAudioFormat for the test
  mockModem.modemAudioFormat = { format: 'u8', sampleRate: 8000, channels: 1 };
  const callRouter = new CallRouter(mockModem, dbManager);

  // Spy on methods
  let playAudioFileCalled = false;
  let playAudioFileArgs = null;
  mockModem.playAudioFile = (filePath, callback) => {
    playAudioFileCalled = true;
    playAudioFileArgs = { filePath };
    console.log(`MockModem.playAudioFile CALLED with: ${filePath}`);
    // Simulate successful playback
    setTimeout(() => callback(null), 20);
  };
  
  let recordAudioCalled = false;
  let recordAudioArgs = null;
  mockModem.recordAudio = (filePath, duration, callback) => {
    recordAudioCalled = true;
    recordAudioArgs = { filePath, duration };
    console.log(`MockModem.recordAudio CALLED with: ${filePath}, duration: ${duration}`);
    // Simulate successful recording and conversion after a short delay
    setTimeout(() => {
      const dummyWavPath = filePath.replace(/\.raw$/, '.wav');
      callback(null, { filePath: dummyWavPath, duration, converted: true });
    }, 50); 
  };

  let addVoicemailCalled = false;
  let addVoicemailArgs = null;
  dbManager.addVoicemail = async (callerNumber, callerName, filePath, duration) => {
    addVoicemailCalled = true;
    addVoicemailArgs = { callerNumber, callerName, filePath, duration };
    console.log(`MockDB.addVoicemail CALLED with: ${callerNumber}, ${callerName}, ${filePath}, ${duration}`);
    return { lastID: 1, changes: 1 }; // Simulate DB success
  };
  
  let mqttPublishCalled = false;
  let mqttPublishArgs = null;
  const originalMqttPublish = require('../lib/mqttClient').publish; // Save original
  require('../lib/mqttClient').publish = (topic, message) => { // Mock
      if (topic === 'callattendant/voicemail/new') {
        mqttPublishCalled = true;
        mqttPublishArgs = { topic, message };
        console.log(`MockMQTT.publish CALLED for voicemail/new:`, message);
      } else {
        originalMqttPublish(topic, message); // Call original for other topics
      }
  };
  
  let hangUpCalled = false;
  mockModem.hangUpCall = (callback) => {
      hangUpCalled = true;
      console.log('MockModem.hangUpCall CALLED.');
      if (callback) callback(null, 'OK');
  };
  
  mockModem.answerCall = (callback) => {
      console.log('MockModem.answerCall CALLED.');
      if (callback) callback(null, 'OK');
  };


  console.log('\n--- Scenario VM: Call from allowed number, rings to voicemail ---');
  const callerInfo = { number: '5551234567', name: 'Voicemail User', date: '1202', time: '1100' };
  mockModem.emit('callerId', callerInfo);
  
  for (let i = 0; i < 4; i++) { // VOICEMAIL_MAX_RINGS is 4
    mockModem.emit('ring');
    await new Promise(resolve => setTimeout(resolve, 10)); // Short delay between rings
  }
  
  // At this point, _initiateVoicemailRecording should have been triggered
  await new Promise(resolve => setTimeout(resolve, 200)); // Allow async operations in CallRouter

  // Assertions
  console.log('\n--- Voicemail Test Assertions ---');
  if (recordAudioCalled) {
    console.log('SUCCESS: modem.recordAudio was called.');
    if (recordAudioArgs.filePath.includes('voicemails') && recordAudioArgs.filePath.includes(callerInfo.number)) {
        console.log('SUCCESS: recordAudio filePath seems correct:', recordAudioArgs.filePath);
    } else {
        console.error('FAILURE: recordAudio filePath is INCORRECT:', recordAudioArgs.filePath);
    }
  } else {
    console.error('FAILURE: modem.recordAudio was NOT called.');
  }

  if (addVoicemailCalled) {
    console.log('SUCCESS: db.addVoicemail was called.');
    if (addVoicemailArgs.callerNumber === callerInfo.number && addVoicemailArgs.filePath.endsWith('.wav')) {
        console.log('SUCCESS: addVoicemail called with correct arguments.');
    } else {
        console.error('FAILURE: addVoicemail called with INCORRECT arguments:', addVoicemailArgs);
    }
  } else {
    console.error('FAILURE: db.addVoicemail was NOT called.');
  }
  
  if (mqttPublishCalled) {
    console.log('SUCCESS: MQTT voicemail/new was published.');
    if (mqttPublishArgs.message.caller_number === callerInfo.number && mqttPublishArgs.message.filePath.endsWith('.wav')) {
        console.log('SUCCESS: MQTT voicemail/new payload seems correct.');
    } else {
        console.error('FAILURE: MQTT voicemail/new payload is INCORRECT:', mqttPublishArgs.message);
    }
  } else {
    console.error('FAILURE: MQTT voicemail/new was NOT published.');
  }

  if (hangUpCalled) {
    console.log('SUCCESS: modem.hangUpCall was called.');
  } else {
    console.error('FAILURE: modem.hangUpCall was NOT called.');
  }
  
  // Restore original publish if other tests might run after this
  require('../lib/mqttClient').publish = originalMqttPublish; 
  console.log('\n--- Voicemail Test Scenario Finished ---');
  
  // Final assertions for playAudioFile
  if (playAudioFileCalled) {
    console.log('SUCCESS: modem.playAudioFile was called for greeting.');
    if (playAudioFileArgs.filePath.includes('greeting_raw_') && playAudioFileArgs.filePath.endsWith('.raw')) {
        console.log('SUCCESS: modem.playAudioFile filePath for greeting seems correct.');
    } else {
        console.error('FAILURE: modem.playAudioFile filePath for greeting is INCORRECT:', playAudioFileArgs.filePath);
    }
  } else {
    console.error('FAILURE: modem.playAudioFile was NOT called for greeting.');
  }
}

// --- Mocks ---
// Mock audioConverter to avoid actual ffmpeg dependency in test runs
jest.mock('../lib/audioConverter', () => ({
  rawToWav: jest.fn((rawFilePath, wavFilePath, rawAudioDetails, callback) => {
    console.log(`Mocked audioConverter.rawToWav called for ${rawFilePath} to ${wavFilePath}`);
    // Simulate successful conversion
    setTimeout(() => callback(null, wavFilePath), 10);
  }),
  wavToRaw: jest.fn((wavFilePath, rawFilePath, rawAudioDetails, callback) => {
    console.log(`Mocked audioConverter.wavToRaw called for ${wavFilePath} to ${rawFilePath}`);
    // Simulate successful conversion
    setTimeout(() => callback(null, rawFilePath), 10);
  }),
}));

// Mock emailService
jest.mock('../lib/emailService', () => ({
  configureService: jest.fn(), // Mock configureService as it's called in server.js
  sendVoicemailNotification: jest.fn((mailOptions, voicemailDetails, callback) => {
    console.log('Mocked emailService.sendVoicemailNotification CALLED with:', mailOptions, voicemailDetails);
    // Simulate successful email sending
    setTimeout(() => callback(null, { messageId: 'mock-message-id', response: 'mock-response (ethereal.email)' }), 10);
  }),
}));


// --- Test Execution ---

// Before running tests, ensure the mocked emailService is imported so Jest can track its functions.
const { sendVoicemailNotification } = require('../lib/emailService');


// runCallRouterTests().catch(console.error); // Run original tests (commented out to focus on voicemail)
runVoicemailTest().then(async () => {
  // Add assertions for email notification after runVoicemailTest completes
  console.log('\n--- Email Notification Assertions (Post-Test) ---');
  if (sendVoicemailNotification.mock.calls.length > 0) {
    expect(sendVoicemailNotification).toHaveBeenCalled();
    console.log('SUCCESS: emailService.sendVoicemailNotification was called.');

    const lastCallArgs = sendVoicemailNotification.mock.calls[sendVoicemailNotification.mock.calls.length - 1];
    const mailOptions = lastCallArgs[0];
    const voicemailDetails = lastCallArgs[1];

    // Example: Check if 'to' address matches expected (using placeholder from CallRouter)
    expect(mailOptions.to).toBe(process.env.VOICEMAIL_EMAIL_TO || 'testuser@example.com');
    console.log(`SUCCESS: Email 'to' address matches expected ('${mailOptions.to}').`);
    
    expect(voicemailDetails.filePath).toBeDefined();
    expect(voicemailDetails.filePath.endsWith('.wav')).toBe(true);
    console.log(`SUCCESS: Voicemail details for email contain a .wav filePath ('${voicemailDetails.filePath}').`);

  } else {
    console.error('FAILURE: emailService.sendVoicemailNotification was NOT called.');
    // This will cause an explicit Jest failure if using expect()
    expect(sendVoicemailNotification).toHaveBeenCalled(); 
  }
}).catch(console.error);
