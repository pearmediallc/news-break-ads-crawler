// Launch AdsPower with remote debugging enabled
const axios = require('axios');
const puppeteer = require('puppeteer-core');

// AdsPower Local API Configuration
const ADSPOWER_API = 'http://localhost:50325/api/v1';

async function launchAdsPowerWithDebug() {
    console.log('🚀 Launching AdsPower with remote debugging...\n');

    try {
        // Step 1: Get list of browser profiles
        console.log('📋 Getting AdsPower profiles...');
        const profilesResponse = await axios.get(`${ADSPOWER_API}/user/list`);

        if (!profilesResponse.data || !profilesResponse.data.data) {
            console.log('❌ Could not get profiles from AdsPower API');
            console.log('Make sure AdsPower application is running');
            return;
        }

        const profiles = profilesResponse.data.data.list;
        console.log(`Found ${profiles.length} profiles\n`);

        if (profiles.length === 0) {
            console.log('❌ No profiles found in AdsPower');
            return;
        }

        // Display profiles
        profiles.forEach((profile, index) => {
            console.log(`${index + 1}. ${profile.name || profile.user_id}`);
        });

        // Use first profile or you can modify to select specific one
        const profile = profiles[0];
        console.log(`\n✅ Using profile: ${profile.name || profile.user_id}`);

        // Step 2: Start browser with debugging enabled
        console.log('🌐 Starting browser with remote debugging...');

        const startResponse = await axios.get(`${ADSPOWER_API}/browser/start`, {
            params: {
                user_id: profile.user_id,
                open_tabs: 1,
                // Force remote debugging on port 9222
                launch_args: JSON.stringify(['--remote-debugging-port=9222']),
                headless: 0  // Ensure visible browser
            }
        });

        if (!startResponse.data || startResponse.data.code !== 0) {
            console.log('❌ Failed to start browser');
            console.log(startResponse.data);
            return;
        }

        const browserData = startResponse.data.data;
        console.log('✅ Browser started successfully!');
        console.log(`   Debug port: ${browserData.debug_port || 'Not available'}`);
        console.log(`   WebDriver: ${browserData.webdriver}`);
        console.log(`   WebSocket: ${browserData.ws?.puppeteer || 'Not available'}`);

        // Step 3: Connect with Puppeteer
        if (browserData.ws && browserData.ws.puppeteer) {
            console.log('\n🔗 Connecting with Puppeteer...');

            const browser = await puppeteer.connect({
                browserWSEndpoint: browserData.ws.puppeteer,
                defaultViewport: null
            });

            console.log('✅ Connected to AdsPower browser!');

            // Navigate to NewsBreak
            const pages = await browser.pages();
            let page;

            if (pages.length > 0) {
                page = pages[0];
            } else {
                page = await browser.newPage();
            }

            console.log('📍 Navigating to NewsBreak.com...');
            await page.goto('https://www.newsbreak.com', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            console.log('✅ NewsBreak loaded in AdsPower with USA IP!');
            console.log('\n🎉 Success! Now you can:');
            console.log('1. Go to http://localhost:3000');
            console.log('2. Select "AdsPower" in Browser dropdown');
            console.log('3. Click "Start Extraction"');

            // Keep connection for extraction
            await browser.disconnect();

        } else if (browserData.debug_port) {
            // Try connecting via debug port
            console.log(`\n🔗 Browser started on debug port ${browserData.debug_port}`);
            console.log('Extraction tool should now be able to connect!');
        }

        return browserData;

    } catch (error) {
        console.log('❌ Error:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n⚠️ AdsPower API not accessible on port 50325');
            console.log('Make sure AdsPower application is running');
        }
    }
}

// Check if axios is installed
const fs = require('fs');
const path = require('path');

if (!fs.existsSync(path.join(__dirname, 'node_modules', 'axios'))) {
    console.log('Installing axios...');
    require('child_process').execSync('npm install axios', { stdio: 'inherit' });
}

// Run the launcher
launchAdsPowerWithDebug();