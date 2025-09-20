const path = require('path');
const DatabaseConnection = require('./src/database/connection');

(async () => {
  try {
    const db = new DatabaseConnection(path.join(__dirname, 'data', 'ads_crawler.db'));
    await db.initialize();

    console.log('🗄️ COMPLETE DATABASE CONTENT\n');

    // Load all sessions
    console.log('📋 SESSIONS TABLE:');
    console.log('==================');
    const sessions = await db.all('SELECT * FROM sessions ORDER BY created_at DESC');
    sessions.forEach((session, i) => {
      console.log(`${i+1}. Session: ${session.session_id}`);
      console.log(`   URL: ${session.url}`);
      console.log(`   Device: ${session.device_mode}`);
      console.log(`   Created: ${session.created_at}`);
      console.log(`   Duration: ${session.duration || 'Unlimited'} minutes`);
      console.log();
    });

    // Load all ads
    console.log('\n🎯 ADS TABLE:');
    console.log('==============');
    const ads = await db.all('SELECT * FROM ads ORDER BY timestamp DESC');
    ads.forEach((ad, i) => {
      console.log(`${i+1}. Ad ID: ${ad.ad_id}`);
      console.log(`   Advertiser: ${ad.ad_network || 'Unknown'}`);
      console.log(`   Headline: ${ad.heading ? ad.heading.substring(0, 50) + '...' : 'No headline'}`);
      console.log(`   Link: ${ad.link_url ? 'Yes' : 'No'}`);
      console.log(`   Extracted: ${ad.timestamp}`);
      console.log(`   Session: ${ad.session_id}`);
      console.log();
    });

    // Summary stats
    const sessionCount = await db.all('SELECT COUNT(*) as count FROM sessions');
    const adCount = await db.all('SELECT COUNT(*) as count FROM ads');
    const advertisers = await db.all('SELECT COUNT(DISTINCT ad_network) as count FROM ads WHERE ad_network IS NOT NULL AND ad_network != ""');

    console.log('\n📈 DATABASE SUMMARY:');
    console.log('====================');
    console.log(`Total Sessions: ${sessionCount[0].count}`);
    console.log(`Total Ads: ${adCount[0].count}`);
    console.log(`Unique Advertisers: ${advertisers[0].count}`);

    await db.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
})();