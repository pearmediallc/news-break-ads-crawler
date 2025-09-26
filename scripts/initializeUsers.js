#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs-extra');

// Production user initialization script
class UserInitializer {
    constructor() {
        this.dbPath = process.env.USER_DATABASE_PATH || path.join(process.cwd(), 'data', 'users.db');
    }

    async initialize() {
        console.log('🔧 Initializing user database...');
        console.log('Database path:', this.dbPath);

        // Ensure data directory exists
        await fs.ensureDir(path.dirname(this.dbPath));

        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, async (err) => {
                if (err) {
                    console.error('❌ Error opening database:', err);
                    reject(err);
                    return;
                }

                console.log('✅ Connected to database');

                // Create users table
                db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('admin', 'viewer')),
                        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, async (err) => {
                    if (err) {
                        console.error('❌ Error creating table:', err);
                        reject(err);
                        return;
                    }

                    console.log('✅ Users table ready');

                    // Initialize default users
                    await this.createDefaultUsers(db);

                    db.close();
                    resolve();
                });
            });
        });
    }

    async createDefaultUsers(db) {
        const defaultUsers = [
            {
                username: 'admin',
                password: process.env.ADMIN_PASSWORD || 'admin123',
                role: 'admin'
            },
            {
                username: 'sonusingh',
                password: 'Sam8890@',
                role: 'admin'
            }
        ];

        for (const user of defaultUsers) {
            await this.createOrUpdateUser(db, user);
        }
    }

    async createOrUpdateUser(db, userData) {
        return new Promise(async (resolve, reject) => {
            // Check if user exists
            db.get('SELECT * FROM users WHERE username = ?', [userData.username], async (err, existingUser) => {
                if (err) {
                    console.error(`❌ Error checking user ${userData.username}:`, err);
                    reject(err);
                    return;
                }

                // Hash password with salt rounds of 10
                const hashedPassword = await bcrypt.hash(userData.password, 10);
                console.log(`🔐 Hashing password for ${userData.username}`);
                console.log(`   Salt rounds: 10`);
                console.log(`   Hash preview: ${hashedPassword.substring(0, 20)}...`);

                if (existingUser) {
                    // Update existing user's password
                    db.run(
                        'UPDATE users SET password = ?, role = ?, updatedAt = CURRENT_TIMESTAMP WHERE username = ?',
                        [hashedPassword, userData.role, userData.username],
                        (err) => {
                            if (err) {
                                console.error(`❌ Error updating user ${userData.username}:`, err);
                                reject(err);
                            } else {
                                console.log(`✅ Updated user: ${userData.username} (${userData.role})`);
                                resolve();
                            }
                        }
                    );
                } else {
                    // Create new user
                    db.run(
                        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                        [userData.username, hashedPassword, userData.role],
                        (err) => {
                            if (err) {
                                console.error(`❌ Error creating user ${userData.username}:`, err);
                                reject(err);
                            } else {
                                console.log(`✅ Created user: ${userData.username} (${userData.role})`);
                                resolve();
                            }
                        }
                    );
                }
            });
        });
    }

    async verifyUsers() {
        console.log('\n🔍 Verifying users...');

        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error opening database for verification:', err);
                    reject(err);
                    return;
                }

                db.all('SELECT id, username, role, createdAt FROM users', [], (err, users) => {
                    if (err) {
                        console.error('❌ Error fetching users:', err);
                        reject(err);
                        return;
                    }

                    console.log('\n📋 Current users in database:');
                    users.forEach(user => {
                        console.log(`   - ${user.username} (${user.role}) - Created: ${user.createdAt}`);
                    });

                    // Test password for admin
                    db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, adminUser) => {
                        if (adminUser) {
                            const testPassword = process.env.ADMIN_PASSWORD || 'admin123';
                            const isValid = await bcrypt.compare(testPassword, adminUser.password);
                            console.log(`\n🔐 Admin password test: ${isValid ? '✅ PASS' : '❌ FAIL'}`);

                            if (!isValid) {
                                console.log('   Debugging: Hash starts with:', adminUser.password.substring(0, 30));
                            }
                        }

                        db.close();
                        resolve();
                    });
                });
            });
        });
    }
}

// Run initialization
async function main() {
    console.log('========================================');
    console.log('  NewsBreak Ads Crawler v1.4');
    console.log('  User Database Initialization');
    console.log('========================================\n');

    const initializer = new UserInitializer();

    try {
        await initializer.initialize();
        await initializer.verifyUsers();

        console.log('\n✅ User initialization complete!');
        console.log('\nYou can now login with:');
        console.log('  Username: admin');
        console.log('  Password: ' + (process.env.ADMIN_PASSWORD || 'admin123'));
        console.log('\n  Username: sonusingh');
        console.log('  Password: Sam8890@');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Initialization failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = UserInitializer;