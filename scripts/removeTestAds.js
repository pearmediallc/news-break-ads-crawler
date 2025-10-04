const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'ads_crawler.db');

console.log('🗑️  Removing test ads from database...');
console.log('Database:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to connect to database:', err);
        process.exit(1);
    }
});

// First, show the test ads that will be deleted
db.all(`
    SELECT id, heading, session_id, timestamp
    FROM ads
    WHERE session_id IN ('test-session-1758391301315', 'sync-test-1758391301391')
    OR heading LIKE '%Test Ad%'
    OR heading LIKE '%Sync Test%'
`, [], (err, rows) => {
    if (err) {
        console.error('Error querying test ads:', err);
        db.close();
        process.exit(1);
    }

    console.log(`\n📋 Found ${rows.length} test ads to delete:\n`);
    rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.heading || 'No heading'} - Session: ${row.session_id}`);
    });

    if (rows.length === 0) {
        console.log('\n✅ No test ads found in database');
        db.close();
        process.exit(0);
    }

    // Delete the test ads
    db.run(`
        DELETE FROM ads
        WHERE session_id IN ('test-session-1758391301315', 'sync-test-1758391301391')
        OR heading LIKE '%Test Ad%'
        OR heading LIKE '%Sync Test%'
    `, function(err) {
        if (err) {
            console.error('\n❌ Error deleting test ads:', err);
            db.close();
            process.exit(1);
        }

        console.log(`\n✅ Successfully deleted ${this.changes} test ads from database`);

        // Verify deletion
        db.get('SELECT COUNT(*) as count FROM ads', [], (err, row) => {
            if (err) {
                console.error('Error verifying deletion:', err);
            } else {
                console.log(`📊 Total ads remaining in database: ${row.count}`);
            }

            db.close();
            console.log('\n✨ Cleanup complete!');
        });
    });
});
