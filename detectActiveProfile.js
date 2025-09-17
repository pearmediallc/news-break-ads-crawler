// Detect which AdsPower profile is currently active/running
const axios = require('axios');
const puppeteer = require('puppeteer-core');

const ADSPOWER_API = 'http://localhost:50325/api/v1';

async function detectActiveProfile() {
    console.log('🔍 Detecting active AdsPower profiles...\n');

    try {
        // Get all profiles
        const profilesResponse = await axios.get(`${ADSPOWER_API}/user/list`);
        if (!profilesResponse.data || !profilesResponse.data.data) {
            console.log('❌ Could not get profiles list');
            return null;
        }

        const allProfiles = profilesResponse.data.data.list;
        console.log(`Found ${allProfiles.length} total profiles:\n`);

        // Display all profiles
        allProfiles.forEach((profile, index) => {
            console.log(`${index + 1}. ${profile.name || profile.user_id}`);
            console.log(`   ID: ${profile.user_id}`);
            console.log(`   Group: ${profile.group_name || 'None'}`);
        });

        console.log('\n📊 Checking which profiles are active...\n');

        const activeProfiles = [];

        // Check each profile's status
        for (const profile of allProfiles) {
            try {
                // Check if profile is active
                const statusResponse = await axios.get(`${ADSPOWER_API}/browser/active`, {
                    params: { user_id: profile.user_id }
                });

                if (statusResponse.data && statusResponse.data.data) {
                    const browserInfo = statusResponse.data.data;

                    if (browserInfo.status === 'Active') {
                        console.log(`✅ ACTIVE: ${profile.name || profile.user_id}`);
                        console.log(`   WebSocket: ${browserInfo.ws?.puppeteer || 'N/A'}`);
                        console.log(`   Debug Port: ${browserInfo.debug_port || 'N/A'}\n`);

                        activeProfiles.push({
                            ...profile,
                            browserInfo: browserInfo
                        });
                    }
                }
            } catch (e) {
                // Profile not active, continue
            }
        }

        if (activeProfiles.length === 0) {
            console.log('❌ No active profiles found');
            console.log('\n💡 Please open an AdsPower browser profile first');
            return null;
        }

        // Return the first active profile
        const activeProfile = activeProfiles[0];
        console.log(`\n🎯 Using active profile: ${activeProfile.name || activeProfile.user_id}`);

        return activeProfile;

    } catch (error) {
        console.error('❌ Error:', error.message);
        return null;
    }
}

async function openNewsBreakInActiveProfile() {
    const activeProfile = await detectActiveProfile();

    if (!activeProfile) {
        console.log('\n📌 To use this feature:');
        console.log('1. Open AdsPower application');
        console.log('2. Start any browser profile');
        console.log('3. Run this script again');
        return;
    }

    try {
        // Connect to the active browser
        if (activeProfile.browserInfo?.ws?.puppeteer) {
            console.log('\n🔗 Connecting to active browser...');

            const browser = await puppeteer.connect({
                browserWSEndpoint: activeProfile.browserInfo.ws.puppeteer,
                defaultViewport: null
            });

            console.log('✅ Connected!');

            // Get pages
            const pages = await browser.pages();
            let page;

            if (pages.length > 0) {
                page = pages[0];
                console.log('📄 Using existing tab');
            } else {
                page = await browser.newPage();
                console.log('📄 Created new tab');
            }

            // Navigate to NewsBreak
            console.log('🌐 Navigating to NewsBreak.com...');
            await page.goto('https://www.newsbreak.com', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            console.log('✅ NewsBreak opened in active profile!');
            console.log(`\n✨ Profile "${activeProfile.name}" is ready for extraction with USA IP!`);

            await browser.disconnect();
        }
    } catch (error) {
        console.error('❌ Error connecting:', error.message);
    }
}

// Export functions
module.exports = { detectActiveProfile, openNewsBreakInActiveProfile };

// Run if called directly
if (require.main === module) {
    openNewsBreakInActiveProfile();
}