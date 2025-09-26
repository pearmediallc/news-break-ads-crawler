# 🚀 NewsBreak Ads Crawler v1.4 - Render Deployment Guide

## 📋 Prerequisites

1. A Render account (https://render.com)
2. GitHub repository with the source code
3. Basic understanding of environment variables

## 🎯 New Features in v1.4

- **Role-based Access Control**: Admin and Viewer roles
- **User Management System**: Create, edit, and delete users
- **Persistent User Database**: SQLite-based user storage
- **Enhanced Security**: JWT authentication with session management
- **Improved UI**: Separate dashboards for admins and viewers

## 📦 Quick Deployment Steps

### 1. Fork/Clone Repository
```bash
git clone https://github.com/yourusername/news-break-ads-crawler.git
cd news-break-ads-crawler
```

### 2. Push to Your GitHub
```bash
git remote set-url origin https://github.com/yourusername/news-break-ads-crawler.git
git push origin main
```

### 3. Deploy on Render

1. **Log in to Render Dashboard**
2. **Click "New +" → "Web Service"**
3. **Connect your GitHub repository**
4. **Configure the service:**
   - **Name**: `news-break-ads-crawler-v1-4`
   - **Environment**: Docker
   - **Branch**: main
   - **Build Command**: (Leave empty - uses Dockerfile)
   - **Start Command**: (Leave empty - uses Dockerfile)

### 4. Environment Variables

The following environment variables will be automatically configured from `render.yaml`:

```yaml
NODE_ENV: production
PORT: 10000
ENABLE_FILE_LOGGING: false
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: true
PUPPETEER_EXECUTABLE_PATH: /usr/bin/google-chrome-stable
JWT_SECRET: [auto-generated]
SESSION_SECRET: [auto-generated]
ENABLE_USER_MANAGEMENT: true
ENABLE_ROLE_BASED_ACCESS: true
```

### 5. Persistent Storage

The app requires persistent storage for:
- Extracted ads data
- Session information
- User database
- Application logs

Render will automatically create a 5GB disk mounted at `/usr/src/app/data`

## 🔐 Default Admin Credentials

After deployment, you can log in with:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change the default admin password immediately after first login!

## 👥 User Management

### Creating New Users

1. Log in as admin
2. Navigate to "Manage Users" from the admin dashboard
3. Create users with specific roles:
   - **Admin**: Full control over extractions and user management
   - **Viewer**: Read-only access to view ads

### Pre-configured Users:
- `admin` / `admin123` (Default Admin - change password after first login!)
- `sonusingh` / `Sam8890@` (Admin)

## 🔧 Configuration Files

### render.yaml
```yaml
services:
  - type: web
    name: news-break-ads-crawler-v1-4
    runtime: docker
    env: docker
    dockerfilePath: ./Dockerfile
    healthCheckPath: /health
    envVars:
      # ... (configured automatically)
    autoDeploy: true
    disk:
      name: data-storage
      mountPath: /usr/src/app/data
      sizeGB: 5
```

### Dockerfile
The Dockerfile is pre-configured with:
- Node.js 20 Alpine base image
- Google Chrome installation
- All required dependencies
- Automatic database initialization

## 📊 Health Monitoring

The app includes health check endpoints:
- `/health` - Basic health check
- `/api/health` - Detailed health status

Render will automatically monitor these endpoints.

## 🌐 Accessing Your App

After deployment:
1. Your app will be available at: `https://your-app-name.onrender.com`
2. Navigate to `/login` to access the login page
3. Use admin credentials to access full features

## 📝 Post-Deployment Checklist

- [ ] Change default admin password
- [ ] Create additional user accounts as needed
- [ ] Test extraction functionality
- [ ] Verify SSE real-time updates
- [ ] Check database persistence
- [ ] Configure custom domain (optional)

## 🔄 Updating the App

To deploy updates:
1. Push changes to your GitHub repository
2. Render will automatically redeploy (if autoDeploy is enabled)
3. Or manually trigger deployment from Render dashboard

## 🛠️ Troubleshooting

### Common Issues:

1. **Login fails with "Invalid credentials"**
   - **Solution**: The app now auto-initializes passwords on startup
   - Set `FORCE_RESET_PASSWORDS=true` in Render environment variables
   - The `prestart` script will recreate password hashes
   - Check logs for "User initialization complete" message

2. **Extraction fails**
   - Verify Chrome is installed (check logs)
   - Ensure NewsBreak URL is accessible

3. **Data not persisting**
   - Check disk storage is mounted correctly
   - Verify write permissions on /data directory

### Viewing Logs:
```bash
# In Render dashboard:
Services → Your Service → Logs
```

## 📞 Support

For issues specific to:
- **Deployment**: Check Render documentation
- **App functionality**: Create an issue on GitHub
- **User management**: Contact your admin

## 🔒 Security Considerations

1. **Always use HTTPS** in production
2. **Change default passwords** immediately
3. **Set strong JWT_SECRET and SESSION_SECRET**
4. **Regularly update dependencies**
5. **Monitor access logs**

## 📈 Performance Tips

- The app can handle 3 concurrent extractions
- Each extraction session can run up to 24 hours
- Database is optimized for up to 100,000 ads
- Use viewer accounts for read-only access to reduce load

## 🎉 Success!

Your NewsBreak Ads Crawler v1.4 should now be running on Render with:
- User authentication system
- Role-based access control
- Persistent data storage
- Real-time updates
- Production-ready configuration

---

**Version**: 1.4.0
**Last Updated**: 2025-09-26
**License**: ISC