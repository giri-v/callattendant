const path = require('path');
const fs = require('fs');
const dbManager = require('./lib/database');

// Define the path for the test database
const testDbPath = path.join('config', 'test_callattendant.db');
const configDir = path.dirname(testDbPath);

async function runTest() {
  console.log('Starting database test script...');

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`Created directory: ${configDir}`);
  }

  // Initialize the database
  // initDb itself is synchronous in its setup of the db object and table creation calls,
  // but table creation is asynchronous. We need to ensure tables are ready.
  // A simple way is to await a short delay, or better, have initDb return a promise
  // that resolves once tables are confirmed. For now, let's assume initDb's logging
  // means it's ready for operations for this test script.
  // For robustness, initDb should ideally return a promise.
  dbManager.initDb(testDbPath);

  // Short delay to allow DB initialization and table creation to complete.
  // This is a workaround. Ideally, initDb or createTables should return a promise.
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n--- Testing Permitted Numbers ---');
  await dbManager.addPermittedNumber('1112223333', 'Alice');
  await dbManager.addPermittedNumber('4445556666', 'Bob');
  await dbManager.addPermittedNumber('1112223333', 'Alice Updated'); // Test update

  let isAlicePermitted = await dbManager.isPermitted('1112223333');
  console.log('Is Alice (1112223333) permitted?', isAlicePermitted);
  let isCharliePermitted = await dbManager.isPermitted('7778889999');
  console.log('Is Charlie (7778889999) permitted?', isCharliePermitted);

  let permittedList = await dbManager.getPermittedNumbers();
  console.log('Current permitted numbers:', permittedList);

  await dbManager.removePermittedNumber('4445556666'); // Remove Bob
  console.log('Removed Bob (4445556666) from permitted list.');
  permittedList = await dbManager.getPermittedNumbers();
  console.log('Permitted numbers after removal:', permittedList);
  await dbManager.removePermittedNumber('0000000000'); // Try removing non-existent

  console.log('\n--- Testing Blocked Numbers ---');
  await dbManager.addBlockedNumber('9998887777', 'Spammer');
  await dbManager.addBlockedNumber('6665554444', 'Robocaller');
  await dbManager.addBlockedNumber('9998887777', 'Persistent Spammer'); // Test update

  let isSpammerBlocked = await dbManager.isBlocked('9998887777');
  console.log('Is Spammer (9998887777) blocked?', isSpammerBlocked);
  let isOtherBlocked = await dbManager.isBlocked('1231231234');
  console.log('Is Other (1231231234) blocked?', isOtherBlocked);

  let blockedList = await dbManager.getBlockedNumbers();
  console.log('Current blocked numbers:', blockedList);

  await dbManager.removeBlockedNumber('6665554444'); // Remove Robocaller
  console.log('Removed Robocaller (6665554444) from blocked list.');
  blockedList = await dbManager.getBlockedNumbers();
  console.log('Blocked numbers after removal:', blockedList);
  await dbManager.removeBlockedNumber('0000000000'); // Try removing non-existent


  console.log('\n--- Testing interactions ---');
  // Add a number that was permitted to blocked (should be fine, separate lists)
  await dbManager.addBlockedNumber('1112223333', 'Alice went rogue');
  isAlicePermitted = await dbManager.isPermitted('1112223333');
  let isAliceBlocked = await dbManager.isBlocked('1112223333');
  console.log('Is Alice (1112223333) still permitted?', isAlicePermitted);
  console.log('Is Alice (1112223333) now blocked?', isAliceBlocked);

  permittedList = await dbManager.getPermittedNumbers();
  console.log('Permitted numbers:', permittedList);
  blockedList = await dbManager.getBlockedNumbers();
  console.log('Blocked numbers:', blockedList);

  console.log('\n--- Testing Pattern Matching ---');
  const { checkPatterns } = require('./lib/patternMatcher');

  // Add some patterns
  await dbManager.addPermittedPattern('^Alice.*', 'name', 'Alice names');
  await dbManager.addPermittedPattern('^(\\+1)?111\\d{7}$', 'number', 'Alice numbers');
  await dbManager.addBlockedPattern('Telemarketer', 'any', 'Block telemarketers');
  await dbManager.addBlockedPattern('(^\\+1)?999\\d{7}$', 'number', '999 numbers');
  await dbManager.addBlockedPattern('[SPOOFED]', 'name', 'Spoofed caller names');
  await dbManager.addBlockedPattern('(^INVALID', 'any', 'Invalid regex test'); // Intentionally invalid

  console.log('\n--- Testing Permitted Patterns ---');
  let permittedPatterns = await dbManager.getPermittedPatterns();
  console.log('Initial permitted patterns:', permittedPatterns);

  console.log("Checking 'Alice Smith' against permitted name patterns:", checkPatterns('Alice Smith', permittedPatterns.filter(p => p.scope === 'name' || p.scope === 'any'), 'permitted name'));
  console.log("Checking 'Bob The Builder' against permitted name patterns:", checkPatterns('Bob The Builder', permittedPatterns.filter(p => p.scope === 'name' || p.scope === 'any'), 'permitted name'));
  console.log("Checking '+11112223333' against permitted number patterns:", checkPatterns('+11112223333', permittedPatterns.filter(p => p.scope === 'number' || p.scope === 'any'), 'permitted number'));
  console.log("Checking '1112223333' against permitted number patterns:", checkPatterns('1112223333', permittedPatterns.filter(p => p.scope === 'number' || p.scope === 'any'), 'permitted number'));
  console.log("Checking '2223334444' against permitted number patterns:", checkPatterns('2223334444', permittedPatterns.filter(p => p.scope === 'number' || p.scope === 'any'), 'permitted number'));


  await dbManager.setPermittedPatternStatus('^Alice.*', false); // Deactivate Alice name pattern
  console.log('Deactivated Alice name pattern.');
  permittedPatterns = await dbManager.getPermittedPatterns(); // onlyActive = true by default
  console.log('Active permitted patterns:', permittedPatterns);
  console.log("Checking 'Alice Smith' against active permitted name patterns (should be false):", checkPatterns('Alice Smith', permittedPatterns.filter(p => p.scope === 'name' || p.scope === 'any'), 'permitted name - after deactivation'));
  
  let allPermittedPatterns = await dbManager.getPermittedPatterns(false);
  console.log('All permitted patterns (including inactive):', allPermittedPatterns);

  await dbManager.removePermittedPattern('^(\\+1)?111\\d{7}$');
  console.log('Removed Alice number pattern.');
  allPermittedPatterns = await dbManager.getPermittedPatterns(false);
  console.log('All permitted patterns after removal:', allPermittedPatterns);

  console.log('\n--- Testing Blocked Patterns ---');
  let blockedPatterns = await dbManager.getBlockedPatterns();
  console.log('Initial blocked patterns:', blockedPatterns);

  console.log("Checking 'Telemarketer Inc' against blocked patterns:", checkPatterns('Telemarketer Inc', blockedPatterns, 'blocked any'));
  console.log("Checking 'ACME Corp' against blocked patterns:", checkPatterns('ACME Corp', blockedPatterns, 'blocked any'));
  console.log("Checking '+19991234567' against blocked number patterns:", checkPatterns('+19991234567', blockedPatterns.filter(p => p.scope === 'number' || p.scope === 'any'), 'blocked number'));
  console.log("Checking '9991234567' against blocked number patterns:", checkPatterns('9991234567', blockedPatterns.filter(p => p.scope === 'number' || p.scope === 'any'), 'blocked number'));
  console.log("Checking '[SPOOFED] Caller' against blocked name patterns:", checkPatterns('[SPOOFED] Caller', blockedPatterns.filter(p => p.scope === 'name' || p.scope === 'any'), 'blocked name'));
  // Test the invalid regex - error should be logged by checkPatterns
  console.log("Checking 'INVALID CALLER' against blocked patterns (testing invalid regex):", checkPatterns('INVALID CALLER', blockedPatterns, 'blocked any - with invalid'));


  await dbManager.setBlockedPatternStatus('Telemarketer', false);
  console.log('Deactivated Telemarketer pattern.');
  blockedPatterns = await dbManager.getBlockedPatterns(); // onlyActive = true by default
  console.log('Active blocked patterns:', blockedPatterns);
  console.log("Checking 'Telemarketer Inc' against active blocked patterns (should be false):", checkPatterns('Telemarketer Inc', blockedPatterns, 'blocked any - after deactivation'));

  let allBlockedPatterns = await dbManager.getBlockedPatterns(false);
  console.log('All blocked patterns (including inactive):', allBlockedPatterns);

  await dbManager.removeBlockedPattern('(^INVALID');
  console.log('Removed invalid pattern.');
  allBlockedPatterns = await dbManager.getBlockedPatterns(false);
  console.log('All blocked patterns after removal of invalid:', allBlockedPatterns);


  console.log('\nTest script finished.');
  // Note: The database connection is kept open by the sqlite3 module.
  // In a long-running app, this is fine. For a script, you might want db.close().
  // However, dbManager doesn't currently export a close function.
  // For test script, explicitly close the DB if a close function is added to dbManager.
}

runTest().catch(err => {
  console.error("Test script encountered an error:", err);
});
