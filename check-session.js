const fs = require('fs');
const path = require('path');

// Find a good session file with real ads
const sessionsDir = path.join(__dirname, 'data', 'sessions');
const files = fs.readdirSync(sessionsDir).filter(f => f.startsWith('worker_') && f.endsWith('.json'));

let bestSession = null;
let maxRealAds = 0;

files.forEach(file => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionsDir, file)));
        if (data.ads && Array.isArray(data.ads)) {
            const realAds = data.ads.filter(ad =>
                ad.advertiser &&
                ad.advertiser !== 'Protected Ad' &&
                ad.advertiser !== '' &&
                ad.headline &&
                ad.headline !== 'Local'
            );

            if (realAds.length > maxRealAds) {
                maxRealAds = realAds.length;
                bestSession = { file, data, realAds };
            }
        }
    } catch (e) {
        // Skip invalid files
    }
});

if (bestSession) {
    console.log('Best session found:', bestSession.file);
    console.log('Total ads:', bestSession.data.ads.length);
    console.log('Real ads:', bestSession.realAds.length);
    console.log('\nSample ads:');
    bestSession.realAds.slice(0, 5).forEach(ad => {
        console.log(`- ${ad.advertiser}: ${ad.headline}`);
    });

    // Update current_session.json to point to this session
    const currentSession = {
        sessionFile: bestSession.file,
        timestamp: bestSession.data.startTime || new Date().toISOString(),
        sessionId: bestSession.data.sessionId || bestSession.file.replace('worker_', '').replace('.json', ''),
        status: 'completed'
    };

    fs.writeFileSync(path.join(__dirname, 'data', 'current_session.json'), JSON.stringify(currentSession, null, 2));
    console.log('\n✅ Updated current_session.json to point to this session');
} else {
    console.log('No sessions with real ads found');
}