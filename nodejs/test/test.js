const { decrypt, decryptUserInfo } = require('../dist/index');

// Test data from the original test file
const privateKey = 'db74790b43894599e85944ad948474219218baf224d52a5b94d65b200445e1cb';

const testData = {
  encryptedData: "ENDikFqwoD7kEpv4SZRU+1nYyv2Wa38AZ1CTKM2UFUSlId4JbuIW8KV5ithRxj+HVM1/6hNK7DgPqiSByEyLDriu6SmHeKObEy1Pjxl4W334907QLlVC4JofjEY+9GTZVDkbjO8veulMvhKr6Iu63rqvyT0mo8N0xg0dLWz/4R0g6y5GU0KF5D/I4ykrjzL986jrGw9VDpDRpKbFsldUug4RGBHRXXD0FBgey1Nrn2aUD75AKZnbGtGMWI/cTX3KY+f6Or+5XcdAW3FvfOf4ve5BBjTf4uvqTjHXZeAg0zm2",
  encryptedKey: "A8UNZPTCbKgBo73gvm5IvTfss5h/A8iyTXksERp4jNGIL0zBmz2cj2vDLsjpgT9rPWS3OgSrE2j1clUTmyVJfFYVeXiwG+Qcvp+n19qMqzfHO/Z/ezFF5QO1t18r2N80lQ==",
  iv: "cCUSbfdSxcrklNaA",
  authTag: "IL3uHifOYdpMJocY4U3ERQ=="
};

console.log('🧪 Running @eazo/node-sdk tests...\n');

// Test 1: decryptUserInfo function
console.log('Test 1: Decrypt user info');
try {
  const userInfo = decryptUserInfo({
    ...testData,
    privateKey
  });
  
  console.log('✅ Decryption successful!');
  console.log('User Info:', JSON.stringify(userInfo, null, 2));
  
  // Validate structure
  if (userInfo.userId && userInfo.email) {
    console.log('✅ User info structure is valid\n');
  } else {
    console.error('❌ User info structure is invalid\n');
  }
} catch (error) {
  console.error('❌ Decryption failed:', error.message, '\n');
}

// Test 2: Generic decrypt function
console.log('Test 2: Generic decrypt function');
try {
  const result = decrypt({
    ...testData,
    privateKey
  });
  
  console.log('✅ Decryption successful!');
  console.log('Data type:', typeof result.data);
  console.log('Has raw property:', !!result.raw);
  console.log('✅ Result structure is valid\n');
} catch (error) {
  console.error('❌ Decryption failed:', error.message, '\n');
}

// Test 3: Error handling - Invalid private key
console.log('Test 3: Error handling - Invalid private key');
try {
  decryptUserInfo({
    ...testData,
    privateKey: 'invalid_key'
  });
  console.error('❌ Should have thrown an error\n');
} catch (error) {
  console.log('✅ Correctly caught error:', error.message, '\n');
}

// Test 4: Error handling - Missing parameters
console.log('Test 4: Error handling - Missing parameters');
try {
  decryptUserInfo({
    encryptedData: testData.encryptedData,
    encryptedKey: testData.encryptedKey,
    iv: testData.iv,
    authTag: '',  // Missing authTag
    privateKey
  });
  console.error('❌ Should have thrown an error\n');
} catch (error) {
  console.log('✅ Correctly caught error:', error.message, '\n');
}

console.log('🎉 All tests completed!');
