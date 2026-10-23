# Speak and listen together

The updated website keeps visitor audio playing while your computer/phone microphone sends your voice to the ESP32 speaker.

## Put it online

1. In your GitHub repository's `public` folder, replace `doorbell.js` and `doorbell.html` with the updated files in this folder.
2. Commit the two files and deploy that commit on Render. If automatic deployments are enabled, Render will deploy after the commit.
3. After deployment succeeds, reload the website (Ctrl+Shift+R on Windows).
4. Start Live View, choose **Enable microphone**, and allow microphone access. Both people can now speak and listen simultaneously.
5. **Mute microphone** pauses only your own microphone. **Unmute microphone** restores it. **End session** stops the microphone and audio session.

No ESP32 firmware upload or private-setting change is required for this update.

The production web build and all seven automated tests passed. Browser rendering was checked with a simulated device. Actual echo performance still needs a conversation test on your hardware. The ESP32 currently has no acoustic echo canceller; use headphones at the computer for the first test and start with modest doorbell speaker volume.
