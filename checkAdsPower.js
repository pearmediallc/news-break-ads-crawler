// Check AdsPower status
const axios = require('axios');

const ADSPOWER_API = 'http://localhost:50325/api/v1';

async function checkStatus() {
    console.log('Checking AdsPower status...\n');

    try {
        // Check active browsers
        console.log('1. Checking active browsers...');
        const activeResponse = await axios.get(`${ADSPOWER_API}/browser/active`);

        if (activeResponse.data && activeResponse.data.data) {
            const active = activeResponse.data.data;
            console.log(`   Found ${active.length} active browser(s)`);

            active.forEach(browser => {
                console.log(`   - Profile: ${browser.user_id}`);
                if (browser.ws) {
                    console.log(`     WebSocket: ${browser.ws.puppeteer || 'N/A'}`);
                }
            });

            // If browser is already open, try to close it first
            if (active.length > 0) {
                console.log('\n2. Closing existing browser...');
                for (const browser of active) {
                    try {
                        await axios.get(`${ADSPOWER_API}/browser/stop`, {
                            params: { user_id: browser.user_id }
                        });
                        console.log(`   Closed: ${browser.user_id}`);
                    } catch (e) {
                        console.log(`   Could not close: ${browser.user_id}`);
                    }
                }
            }
        } else {
            console.log('   No active browsers');
        }

        // Get profiles
        console.log('\n3. Getting profiles...');
        const profilesResponse = await axios.get(`${ADSPOWER_API}/user/list`);

        if (profilesResponse.data && profilesResponse.data.data) {
            const profiles = profilesResponse.data.data.list;
            console.log(`   Found ${profiles.length} profile(s)`);

            if (profiles.length > 0) {
                const profile = profiles[0];
                console.log(`\n4. Starting fresh browser for: ${profile.name || profile.user_id}`);

                // Start browser
                const startResponse = await axios.get(`${ADSPOWER_API}/browser/start`, {
                    params: {
                        user_id: profile.user_id,
                        open_tabs: 1
                    }
                });

                if (startResponse.data && startResponse.data.code === 0) {
                    const data = startResponse.data.data;
                    console.log('   ✅ Browser started successfully!');
                    console.log(`   WebSocket: ${data.ws?.puppeteer || 'N/A'}`);
                    console.log(`   Debug Port: ${data.debug_port || 'N/A'}`);
                    console.log('\n✅ AdsPower is ready for extraction!');
                } else {
                    console.log('   ❌ Failed to start browser');
                    console.log('   Response:', startResponse.data);
                }
            }
        }

    } catch (error) {
        console.log('❌ Error:', error.message);
        if (error.response) {
            console.log('Response:', error.response.data);
        }
    }
}

checkStatus();