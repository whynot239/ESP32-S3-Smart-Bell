const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'node_modules', 'expo-notifications', 'build', 'warnOfExpoGoPushUsage.js');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  if (content.includes("throw new Error(message);")) {
    content = content.replace(
      /if \(Platform\.OS === 'android'\) \{\s*throw new Error\(message\);\s*\}\s*else if \(__DEV__\) \{\s*didWarn = true;\s*console\.warn\(message\);\s*\}/,
      "didWarn = true;\n        console.warn(message);"
    );
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('✅ Patched expo-notifications warnOfExpoGoPushUsage for Android Expo Go');
  }
}
