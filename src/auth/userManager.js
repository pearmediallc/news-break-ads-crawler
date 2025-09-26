const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs-extra');

class UserManager {
    constructor() {
        this.dbPath = process.env.USER_DATABASE_PATH || path.join(process.cwd(), 'data', 'users.db');
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            // Ensure data directory exists
            await fs.ensureDir(path.dirname(this.dbPath));

            return new Promise((resolve, reject) => {
                this.db = new sqlite3.Database(this.dbPath, async (err) => {
                    if (err) {
                        console.error('Error opening users database:', err);
                        reject(err);
                        return;
                    }

                    // Create users table if it doesn't exist
                    this.db.run(`
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
                            console.error('Error creating users table:', err);
                            reject(err);
                            return;
                        }

                        // Check if default admin exists
                        await this.ensureDefaultAdmin();
                        this.initialized = true;
                        console.log('User database initialized');
                        resolve();
                    });
                });
            });
        } catch (error) {
            console.error('Failed to initialize user database:', error);
            throw error;
        }
    }

    async ensureDefaultAdmin() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

                if (!row) {
                    // Create default admin user with fresh hash
                    console.log('Creating default admin user...');
                    const hashedPassword = await bcrypt.hash(adminPassword, 10);
                    console.log('Admin password hashed (first 30 chars):', hashedPassword.substring(0, 30));

                    this.db.run(
                        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                        ['admin', hashedPassword, 'admin'],
                        (err) => {
                            if (err) {
                                console.error('Error creating default admin:', err);
                                reject(err);
                            } else {
                                console.log('Default admin user created successfully');

                                // Also create sonusingh user if not exists
                                this.ensureUser('sonusingh', 'Sam8890@', 'admin').then(resolve).catch(reject);
                            }
                        }
                    );
                } else {
                    // Update admin password if environment variable is set and different
                    if (process.env.FORCE_RESET_PASSWORDS === 'true') {
                        console.log('Force resetting admin password...');
                        const hashedPassword = await bcrypt.hash(adminPassword, 10);
                        this.db.run(
                            'UPDATE users SET password = ? WHERE username = ?',
                            [hashedPassword, 'admin'],
                            (err) => {
                                if (err) {
                                    console.error('Error updating admin password:', err);
                                } else {
                                    console.log('Admin password reset successfully');
                                }
                            }
                        );
                    }

                    // Ensure sonusingh user exists
                    this.ensureUser('sonusingh', 'Sam8890@', 'admin').then(resolve).catch(reject);
                }
            });
        });
    }

    async ensureUser(username, password, role) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE username = ?', [username], async (err, row) => {
                if (err) {
                    console.error(`Error checking user ${username}:`, err);
                    reject(err);
                    return;
                }

                if (!row) {
                    // Create user
                    const hashedPassword = await bcrypt.hash(password, 10);
                    this.db.run(
                        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                        [username, hashedPassword, role],
                        (err) => {
                            if (err) {
                                console.error(`Error creating user ${username}:`, err);
                                reject(err);
                            } else {
                                console.log(`User ${username} created successfully`);
                                resolve();
                            }
                        }
                    );
                } else if (process.env.FORCE_RESET_PASSWORDS === 'true') {
                    // Update password if force reset is enabled
                    const hashedPassword = await bcrypt.hash(password, 10);
                    this.db.run(
                        'UPDATE users SET password = ? WHERE username = ?',
                        [hashedPassword, username],
                        (err) => {
                            if (err) {
                                console.error(`Error updating ${username} password:`, err);
                            } else {
                                console.log(`${username} password reset successfully`);
                            }
                            resolve();
                        }
                    );
                } else {
                    resolve();
                }
            });
        });
    }

    async getAllUsers() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT id, username, role, createdAt, updatedAt FROM users ORDER BY createdAt DESC',
                [],
                (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    async getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE username = ?',
                [username],
                (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }

    async createUser(username, password, role) {
        // Validate input
        if (!username || username.length < 3) {
            throw new Error('Username must be at least 3 characters');
        }
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }
        if (!['admin', 'viewer'].includes(role)) {
            throw new Error('Invalid role');
        }

        // Check if user already exists
        const existingUser = await this.getUserByUsername(username);
        if (existingUser) {
            throw new Error('Username already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [username, hashedPassword, role],
                function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            id: this.lastID,
                            username,
                            role,
                            createdAt: new Date().toISOString()
                        });
                    }
                }
            );
        });
    }

    async updateUserRole(username, newRole) {
        if (!['admin', 'viewer'].includes(newRole)) {
            throw new Error('Invalid role');
        }

        // Don't allow changing the default admin's role
        if (username === 'admin') {
            throw new Error('Cannot change default admin role');
        }

        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET role = ?, updatedAt = CURRENT_TIMESTAMP WHERE username = ?',
                [newRole, username],
                function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('User not found'));
                    } else {
                        resolve({ success: true });
                    }
                }
            );
        });
    }

    async updateUserPassword(username, newPassword) {
        if (!newPassword || newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE username = ?',
                [hashedPassword, username],
                function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('User not found'));
                    } else {
                        resolve({ success: true });
                    }
                }
            );
        });
    }

    async deleteUser(username) {
        // Don't allow deleting the default admin
        if (username === 'admin') {
            throw new Error('Cannot delete default admin user');
        }

        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM users WHERE username = ?',
                [username],
                function(err) {
                    if (err) {
                        reject(err);
                    } else if (this.changes === 0) {
                        reject(new Error('User not found'));
                    } else {
                        resolve({ success: true });
                    }
                }
            );
        });
    }

    async authenticateUser(username, password) {
        const user = await this.getUserByUsername(username);
        if (!user) {
            return null;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return null;
        }

        return {
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.createdAt
        };
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// Create singleton instance
const userManager = new UserManager();

module.exports = userManager;