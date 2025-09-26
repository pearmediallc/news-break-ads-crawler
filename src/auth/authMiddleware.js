const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userManager = require('./userManager');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Authenticate user using database
const authenticateUser = async (username, password) => {
    try {
        return await userManager.authenticateUser(username, password);
    } catch (error) {
        console.error('Authentication error:', error);
        return null;
    }
};

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token.' });
    }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};

// Check if user is authenticated (any role)
const requireAuth = (req, res, next) => {
    const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];

    if (!token) {
        // Redirect to login page for HTML requests
        if (req.accepts('html')) {
            return res.redirect('/login');
        }
        return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (req.accepts('html')) {
            return res.redirect('/login');
        }
        return res.status(403).json({ error: 'Invalid token.' });
    }
};

// Helper function to hash passwords (for creating new users)
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

module.exports = {
    authenticateUser,
    generateToken,
    verifyToken,
    requireAdmin,
    requireAuth,
    hashPassword
};