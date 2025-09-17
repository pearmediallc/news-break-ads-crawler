// AdsPower API Integration - Alternative method to open NewsBreak
const axios = require('axios');
const { exec } = require('child_process');

// AdsPower Local API Configuration
const ADSPOWER_API = 'http://localhost:50325/api/v1';

async function openNewsBreakViaAPI() {
    console.log('🚀 Using AdsPower Local API...\n');

    try {
        // Method 1: Open browser profile and navigate
        console.log('Method 1: Using AdsPower Local API');
        console.log('----------------------------------------');

        // Get list of browser profiles
        const profilesResponse = await axios.get(`${ADSPOWER_API}/user/list`);

        if (profilesResponse.data && profilesResponse.data.data) {
            const profiles = profilesResponse.data.data.list;
            console.log(`Found ${profiles.length} profiles`);

            if (profiles.length > 0) {
                // Use first profile or you can select specific one
                const profileId = profiles[0].user_id;
                console.log(`Using profile: ${profiles[0].name || profileId}`);

                // Start/Open the browser profile
                const startResponse = await axios.get(`${ADSPOWER_API}/browser/start`, {
                    params: {
                        user_id: profileId,
                        open_tabs: 1,
                        launch_args: '--start-maximized'
                    }
                });

                if (startResponse.data && startResponse.data.data) {
                    console.log('✅ Browser profile opened');
                    console.log(`Debug port: ${startResponse.data.data.debug_port}`);
                    console.log(`WebDriver: ${startResponse.data.data.webdriver}`);

                    // The browser is now open, user needs to manually navigate
                    console.log('\n📌 Browser is open. Please navigate to https://www.newsbreak.com manually');
                }
            }
        }
    } catch (error) {
        console.log('AdsPower API not available on port 50325\n');
    }

    // Method 2: Direct command line
    console.log('\nMethod 2: Direct Command Line');
    console.log('----------------------------------------');
    console.log('You can manually open AdsPower and navigate to NewsBreak:');
    console.log('1. Open AdsPower application');
    console.log('2. Select your USA proxy profile');
    console.log('3. Click "Open" to start the browser');
    console.log('4. Navigate to https://www.newsbreak.com');

    // Method 3: Using Windows automation
    console.log('\nMethod 3: Windows URL Opener');
    console.log('----------------------------------------');
    console.log('Creating batch file to copy NewsBreak URL to clipboard...\n');

    const batchContent = `@echo off
echo https://www.newsbreak.com | clip
echo NewsBreak URL copied to clipboard!
echo.
echo Instructions:
echo 1. Open your AdsPower browser profile with USA proxy
echo 2. Press Ctrl+L to focus address bar
echo 3. Press Ctrl+V to paste the URL
echo 4. Press Enter to navigate
echo.
pause`;

    require('fs').writeFileSync('open-newsbreak.bat', batchContent);
    console.log('✅ Created open-newsbreak.bat');
    console.log('Run this batch file and follow the instructions\n');

    // Method 4: PowerShell automation
    console.log('Method 4: PowerShell Automation');
    console.log('----------------------------------------');

    const psScript = `
# Copy NewsBreak URL to clipboard
Set-Clipboard -Value "https://www.newsbreak.com"
Write-Host "✅ NewsBreak URL copied to clipboard!"
Write-Host ""
Write-Host "Now:"
Write-Host "1. Switch to your AdsPower browser"
Write-Host "2. Press Ctrl+L (focus address bar)"
Write-Host "3. Press Ctrl+V (paste URL)"
Write-Host "4. Press Enter"
`;

    require('fs').writeFileSync('open-newsbreak.ps1', psScript);
    console.log('✅ Created open-newsbreak.ps1');
    console.log('Run with: powershell -ExecutionPolicy Bypass -File open-newsbreak.ps1\n');

    // Try to copy to clipboard automatically
    exec('echo https://www.newsbreak.com | clip', (error) => {
        if (!error) {
            console.log('✅ NewsBreak URL copied to clipboard!');
            console.log('📋 Just paste it in your AdsPower browser: Ctrl+V');
        }
    });
}

// Check if axios is installed
try {
    require('axios');
    openNewsBreakViaAPI();
} catch (e) {
    console.log('Installing axios...');
    exec('npm install axios', (error) => {
        if (!error) {
            console.log('✅ Axios installed. Please run the script again.');
        } else {
            console.log('Please install axios manually: npm install axios');
        }
    });
}