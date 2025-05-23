const { initializeModem } = require('./lib/modem');

// Placeholder port name - this test script will simulate data, so actual port doesn't matter as much.
const portName = process.platform === 'win32' ? 'COM_SIMULATED' : '/dev/ttySIMULATED';

console.log(`Attempting to initialize modem on port: ${portName}`);
const modem = initializeModem(portName); // This now returns a Modem class instance

// Listen for the 'open' event
modem.on('open', () => {
  console.log('Test Script: Modem port reported as open.');
  // Now it's safe to send commands or simulate data
  console.log('Test Script: Attempting to send AT command...');
  modem.sendCommand('AT'); // Use the class method

  // Simulate receiving Caller ID data
  console.log('\nTest Script: Simulating incoming Caller ID data...');
  modem._parseData('RING'); // Simulate RING
  modem._parseData('DATE = 1225');
  modem._parseData('TIME = 1030');
  modem._parseData('NMBR = 1234567890');
  modem._parseData('NAME = Test Caller');
  modem._parseData('RING'); // Second RING often signifies end or new call
  
  // Simulate another call with slightly different format
  modem._parseData('RING');
  modem._parseData('CALLER NUMBER = 0987654321');
  modem._parseData('CALLER NAME = Another Caller');
  modem._parseData(''); // Empty line to signify end of block

  // Simulate a call with minimal info
  modem._parseData('RING');
  modem._parseData('NMBR = 5551212');
  modem._parseData('RING'); // This should emit a ring and also complete the "minimal info" Caller ID
});

// Listen for the 'callerId' event
modem.on('callerId', (callerIdInfo) => {
  console.log('\nTest Script: Received Caller ID ----');
  console.log('Date:', callerIdInfo.date || 'N/A');
  console.log('Time:', callerIdInfo.time || 'N/A');
  console.log('Number:', callerIdInfo.number || 'N/A');
  console.log('Name:', callerIdInfo.name || 'N/A');
  console.log('-------------------------------------\n');
});

// Listen for the 'ring' event
let ringCount = 0;
modem.on('ring', () => {
  ringCount++;
  console.log(`Test Script: RING event received! (Count: ${ringCount})`);
});

modem.on('error', (err) => {
  console.error('Test Script: Modem reported an error:', err.message);
  // For a simulated port, we might not get real errors unless the open itself fails.
  // In this test, initializeModem still tries to open the port,
  // which will likely fail for a non-existent port.
  // The simulation below will proceed regardless of this initial open failure for demonstration.
});

// To keep the script running to see incoming data/events.
// In a real app, the server/application lifecycle would keep it running.
// The 'open' event might not fire if the port is invalid.
// We'll add a timeout to close, and also to run simulation if open fails.

let openEventFired = false;
modem.once('open', () => { openEventFired = true; });

setTimeout(() => {
  if (!openEventFired) {
    console.warn("Test Script: Modem 'open' event did not fire. This is expected if the port is simulated/invalid.");
    console.warn("Test Script: Proceeding with data simulation for demonstration purposes.");
    // Simulate receiving Caller ID data even if open failed (for testing _parseData)
    console.log('\nTest Script: Simulating incoming Caller ID data (post-timeout)...');
    ringCount = 0; // Reset ring count for this simulation block
    modem._parseData('RING'); // Expect ring event
    modem._parseData('RING'); // Expect ring event
    modem._parseData('DATE = 0115');
    modem._parseData('TIME = 1130');
    modem._parseData('NMBR = 1112223333');
    modem._parseData('NAME = Late Caller');
    modem._parseData('RING'); // Expect ring event and callerId event
  }

  // --- Voice Mode Tests (Simulated) ---
  // These tests assume the modem port is not actually connected to a real modem,
  // so command responses will be simulated via _parseData or timeout.
  // This is to test the command sequence logic in Modem.js.
  console.log('\n--- Voice Mode Tests ---');

  // Helper to chain async operations for readability
  const runAsyncSequence = async () => {
    try {
      console.log('Test: Answering call...');
      await new Promise((resolve, reject) => {
        modem.answerCall((err, res) => {
          if (err) { console.error('Answer call error:', err); reject(err); }
          else { console.log('Answer call success:', res); resolve(res); }
          // Simulate modem responding 'OK'
          if (!openEventFired) modem._parseData('OK');
        });
      });

      console.log('Test: Switching to voice mode...');
      await new Promise((resolve, reject) => {
        modem.switchToVoiceMode((err, res) => {
          if (err) { console.error('Switch to voice mode error:', err); reject(err); }
          else { console.log('Switch to voice mode success:', res); resolve(res); }
          // Simulate modem responding 'OK' twice for AT+FCLASS=8 and AT+VSM
          if (!openEventFired) { modem._parseData('OK'); modem._parseData('OK');}
        });
      });
      
      console.log('Test: Enabling Caller ID (after voice mode)...');
      await new Promise((resolve, reject) => {
        modem.enableCallerId((err, res) => {
          if (err) { console.error('Enable Caller ID error:', err); reject(err); }
          else { console.log('Enable Caller ID success:', res); resolve(res); }
          if (!openEventFired) modem._parseData('OK');
        });
      });

      console.log('Test: Playing audio file...');
      // Ensure the dummy file exists for the test logic in playAudioFile
      const audioFilePath = 'resources/audio/greeting.raw';
      try {
        require('fs').statSync(audioFilePath);
      } catch (e) {
        console.error(`Audio file ${audioFilePath} not found. Make sure it's created.`);
        // For testing, we'll skip if not found rather than failing hard here.
        // The modem.playAudioFile will error out internally if fs.readFile fails.
      }
      
      await new Promise((resolve, reject) => {
        modem.playAudioFile(audioFilePath, (err) => {
          if (err) { console.error('Play audio file error:', err); reject(err); }
          else { console.log('Play audio file success (DLE+! sent).'); resolve(); }
          // Simulate modem responding 'CONNECT' then 'OK' (for DLE!)
          if (!openEventFired) { modem._parseData('CONNECT'); modem._parseData('OK'); }
        });
      });

      console.log('Test: Hanging up call...');
      await new Promise((resolve, reject) => {
        modem.hangUpCall((err, res) => {
          if (err) { console.error('Hang up call error:', err); reject(err); }
          else { console.log('Hang up call success:', res); resolve(res); }
          if (!openEventFired) modem._parseData('OK');
        });
      });

    } catch (error) {
      console.error('Voice mode test sequence failed:', error);
    } finally {
      console.log(`\nTest script finishing. Total rings detected: ${ringCount}. Closing modem.`);
      modem.close((err) => {
        if (err) console.error('Error closing modem in test script:', err);
        else console.log('Modem closed by test script.');
      });
    }
  };
  
  const runAsyncSequenceWithRecording = async () => {
    const recordingFilePath = 'resources/audio/test_recording.raw';
    const recordingDuration = 3; // seconds
    try {
      console.log('Test (Rec): Answering call...');
      await new Promise((resolve, reject) => {
        modem.answerCall((err, res) => {
          if (err) { console.error('Answer call error (Rec):', err); return reject(err); }
          console.log('Answer call success (Rec):', res); resolve(res);
          if (!openEventFired) modem._parseData('OK');
        });
      });

      console.log('Test (Rec): Switching to voice mode...');
      await new Promise((resolve, reject) => {
        modem.switchToVoiceMode((err, res) => {
          if (err) { console.error('Switch to voice mode error (Rec):', err); return reject(err); }
          console.log('Switch to voice mode success (Rec):', res); resolve(res);
          if (!openEventFired) { modem._parseData('OK'); modem._parseData('OK');}
        });
      });
      
      console.log(`Test (Rec): Recording audio to ${recordingFilePath} for ${recordingDuration}s...`);
      await new Promise((resolve, reject) => {
        modem.recordAudio(recordingFilePath, recordingDuration, (err, info) => {
          if (err) { console.error('Record audio error:', err); return reject(err); }
          console.log('Record audio success:', info);
          // In a real test, you might check fs.statSync(info.filePath).size
          try {
            const stats = require('fs').statSync(info.filePath);
            console.log(`Recorded file ${info.filePath} size: ${stats.size} bytes.`);
            if (stats.size === 0 && !openEventFired) { // If simulated and no data pushed, it might be 0
                console.warn(`Warning: Recorded file size is 0. This might be expected in a fully simulated environment if no mock audio data was pushed to serialPort.on('data').`);
            }
          } catch (statErr) {
            console.error(`Error checking recorded file stats:`, statErr);
          }
          resolve(info);
          // Simulate VRX 'CONNECT' then DLE+! 'OK'
          if (!openEventFired) { modem._parseData('CONNECT'); modem._parseData('OK'); }
        });
        // Simulate some raw audio data being received if not a real modem
        // Using a buffer of zeros, as this is more representative of silence/actual audio data
        // than random text, and less likely to cause ffmpeg to fail outright.
        if (!openEventFired) {
            const simulatedAudioChunk = Buffer.alloc(800, 0); // 0.1 seconds of 8kHz 8-bit audio
            setTimeout(() => modem.serialPort.emit('data', simulatedAudioChunk), 500);
            setTimeout(() => modem.serialPort.emit('data', simulatedAudioChunk), 1000);
            setTimeout(() => modem.serialPort.emit('data', simulatedAudioChunk), 1500);
        }
      });

      console.log('Test (Rec): Hanging up call...');
      await new Promise((resolve, reject) => {
        modem.hangUpCall((err, res) => {
          if (err) { console.error('Hang up call error (Rec):', err); return reject(err); }
          console.log('Hang up call success (Rec):', res); resolve(res);
          if (!openEventFired) modem._parseData('OK');
        });
      });

    } catch (error) {
      console.error('Voice mode test sequence with recording failed:', error);
    } finally {
      console.log(`\nTest script with recording finished. Total rings detected: ${ringCount}.`);
      modem.close((err) => {
        if (err) console.error('Error closing modem in test script (Rec):', err);
        else console.log('Modem closed by test script (Rec).');
        
        // Verify WAV file existence after modem is closed (and all async ops should be done)
        const expectedWavPath = recordingFilePath.replace(/\.[^/.]+$/, "") + ".wav";
        try {
            require('fs').statSync(expectedWavPath);
            console.log(`SUCCESS: WAV file ${expectedWavPath} exists.`);
        } catch (e) {
            console.error(`FAILURE: WAV file ${expectedWavPath} does not exist or is not accessible.`);
        }
      });
    }
  };


  if (openEventFired) { // If modem port actually opened (e.g. mock serial port)
    // Decide which sequence to run or run both sequentially
    // For now, let's run the one with recording for this test.
    runAsyncSequenceWithRecording();
    // runAsyncSequence(); // Can be run if needed
  } else {
    // If open event didn't fire (likely /dev/ttySIMULATED), run sequence with simulated responses
    console.warn("Test Script: Running voice tests with simulated modem responses as 'open' did not fire.");
    runAsyncSequenceWithRecording();
  }

}, 8000); // Increased timeout to allow for more test steps including recording time
