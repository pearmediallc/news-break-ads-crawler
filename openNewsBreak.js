// Script to open NewsBreak in AdsPower browser
const puppeteer = require('puppeteer-core');

async function openNewsBreakInAdsPower() {
    console.log('🔗 Connecting to AdsPower browser...');

    // Try common AdsPower debug ports
    const ports = [9222, 9223, 9224, 9225, 9226];
    let browser = null;
    let connectedPort = null;

    for (const port of ports) {
        try {
            console.log(`  Trying port ${port}...`);
            browser = await puppeteer.connect({
                browserURL: `http://localhost:${port}`,
                defaultViewport: null
            });
            connectedPort = port;
            console.log(`✅ Connected to AdsPower on port ${port}`);
            break;
        } catch (e) {
            // Continue trying other ports
        }
    }

    if (!browser) {
        console.error('❌ Could not connect to AdsPower browser');
        console.log('💡 Make sure AdsPower is running with remote debugging enabled');
        console.log('💡 In AdsPower: Settings → Browser Settings → Enable Remote Debug');
        process.exit(1);
    }

    try {
        // Get all pages
        const pages = await browser.pages();
        console.log(`📄 Found ${pages.length} open tabs`);

        let page;
        if (pages.length > 0) {
            // Use the first page
            page = pages[0];
            console.log('📍 Using existing tab');
        } else {
            // Create a new page if none exist
            page = await browser.newPage();
            console.log('📍 Created new tab');
        }

        // Navigate to NewsBreak
        console.log('🌐 Navigating to NewsBreak.com...');
        await page.goto('https://www.newsbreak.com', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        console.log('✅ Successfully opened NewsBreak.com in AdsPower browser!');
        console.log('📊 You can now use the extraction tool with AdsPower option selected');

        // Keep the connection alive but don't close the browser
        // The browser should stay open for extraction
        await browser.disconnect();

    } catch (error) {
        console.error('❌ Error:', error.message);
        await browser.disconnect();
        process.exit(1);
    }
}

// Run the script
openNewsBreakInAdsPower();