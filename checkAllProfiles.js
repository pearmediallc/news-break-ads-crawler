// Check all AdsPower profiles and find which one is active
const axios = require('axios');

const ADSPOWER_API = 'http://localhost:50325/api/v1';

async function checkAllProfiles() {
    console.log('🔍 Checking all AdsPower profiles...\n');

    try {
        // Get all profiles
        const profilesResponse = await axios.get(`${ADSPOWER_API}/user/list`);
        if (!profilesResponse.data || !profilesResponse.data.data) {
            console.log('❌ Could not get profiles list');
            return;
        }

        const allProfiles = profilesResponse.data.data.list;
        console.log(`Found ${allProfiles.length} total profiles:\n`);

        // Display all profiles with their status
        for (const profile of allProfiles) {
            console.log(`Profile: ${profile.name || profile.user_id}`);
            console.log(`  ID: ${profile.user_id}`);
            console.log(`  Group: ${profile.group_name || 'None'}`);

            // Check if this specific profile is active
            try {
                const activeResponse = await axios.get(`${ADSPOWER_API}/browser/active`, {
                    params: {
                        user_id: profile.user_id
                    }
                });

                if (activeResponse.data && activeResponse.data.code === 0 && activeResponse.data.data) {
                    const browserData = activeResponse.data.data;

                    if (browserData.status === 'Active') {
                        console.log(`  ✅ STATUS: ACTIVE`);
                        console.log(`  WebSocket: ${browserData.ws?.puppeteer || 'N/A'}`);
                        console.log(`  Debug Port: ${browserData.debug_port || 'N/A'}`);
                    } else {
                        console.log(`  ❌ STATUS: NOT ACTIVE`);
                    }
                } else {
                    console.log(`  ❌ STATUS: NOT RUNNING`);
                }
            } catch (e) {
                console.log(`  ❌ STATUS: NOT RUNNING`);
            }

            console.log('');
        }

        // Try to get all active browsers at once
        console.log('Checking for any active browsers...');
        try {
            // Get list of all active browsers
            const allActiveResponse = await axios.get(`${ADSPOWER_API}/browser/active/list`);

            if (allActiveResponse.data && allActiveResponse.data.data) {
                console.log('\nActive browsers found:', allActiveResponse.data.data);
            }
        } catch (e) {
            console.log('No active browsers endpoint available');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

checkAllProfiles();