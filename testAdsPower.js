// Test AdsPower connection
const puppeteer = require('puppeteer-core');

async function testAdsPower() {
    console.log('Testing AdsPower connection...\n');

    const ports = [9222, 9223, 9224, 9225, 9226];

    for (const port of ports) {
        console.log(`Testing port ${port}...`);
        try {
            const browser = await puppeteer.connect({
                browserURL: `http://localhost:${port}`,
                defaultViewport: null
            });

            console.log(`✅ SUCCESS! Connected to AdsPower on port ${port}`);

            const pages = await browser.pages();
            console.log(`   Found ${pages.length} open tabs`);

            if (pages.length > 0) {
                console.log(`   Current URL: ${await pages[0].url()}`);
            }

            await browser.disconnect();
            console.log('\n🎉 AdsPower is properly configured for remote debugging!');
            return;
        } catch (e) {
            console.log(`❌ Port ${port}: ${e.message.split('\n')[0]}`);
        }
    }

    console.log('\n⚠️ AdsPower is NOT accessible on any port!');
    console.log('\nTo enable remote debugging in AdsPower:');
    console.log('1. Open AdsPower application');
    console.log('2. Click on your browser profile settings (gear icon)');
    console.log('3. Look for "Browser kernel settings" or "Advanced settings"');
    console.log('4. Find "Remote debugging port" and set it to 9222');
    console.log('5. Enable remote debugging');
    console.log('6. Save and restart the browser profile');
}

testAdsPower();