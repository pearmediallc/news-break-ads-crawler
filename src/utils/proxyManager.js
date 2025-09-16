// src/utils/proxyManager.js
const axios = require('axios');
const logger = require('./logger');

class ProxyManager {
  constructor() {
    this.currentIp = null;
    this.proxyStatus = null;
  }

  async checkCurrentIP() {
    try {
      logger.info('Checking current IP address...');
      
      // Try multiple IP checking services for reliability
      const services = [
        'https://api.ipify.org?format=json',
        'https://ifconfig.me/ip',
        'https://ipapi.co/ip'
      ];

      for (const service of services) {
        try {
          const response = await axios.get(service, { 
            timeout: 5000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          const ip = typeof response.data === 'string' ? 
            response.data.trim() : 
            response.data.ip;
            
          this.currentIp = ip;
          logger.info(`Current IP: ${ip}`);
          return ip;
        } catch (error) {
          logger.warn(`Failed to get IP from ${service}: ${error.message}`);
          continue;
        }
      }
      
      throw new Error('All IP checking services failed');
    } catch (error) {
      logger.error('Failed to check current IP:', error);
      throw error;
    }
  }

  async getIPLocation(ip = null) {
    try {
      const targetIp = ip || this.currentIp || await this.checkCurrentIP();
      
      logger.info(`Getting location for IP: ${targetIp}`);
      
      const response = await axios.get(`https://ipapi.co/${targetIp}/json/`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const location = {
        ip: targetIp,
        country: response.data.country_name,
        countryCode: response.data.country_code,
        region: response.data.region,
        city: response.data.city,
        timezone: response.data.timezone,
        isUSA: response.data.country_code === 'US'
      };

      logger.info(`IP Location: ${location.city}, ${location.region}, ${location.country} (${location.countryCode})`);
      
      if (location.isUSA) {
        logger.info('✅ Using USA IP address');
      } else {
        logger.warn(`⚠️  Not using USA IP. Current location: ${location.country}`);
      }

      return location;
    } catch (error) {
      logger.error('Failed to get IP location:', error);
      return { ip: this.currentIp, isUSA: false, error: error.message };
    }
  }

  async testProxy(proxyConfig) {
    try {
      logger.info(`Testing proxy: ${proxyConfig.server}`);
      
      const axiosConfig = {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      // Configure proxy for axios
      if (proxyConfig.server) {
        const proxyUrl = new URL(proxyConfig.server);
        axiosConfig.proxy = {
          protocol: proxyUrl.protocol.replace(':', ''),
          host: proxyUrl.hostname,
          port: parseInt(proxyUrl.port),
          auth: proxyConfig.username && proxyConfig.password ? {
            username: proxyConfig.username,
            password: proxyConfig.password
          } : undefined
        };
      }

      // Test proxy by getting IP
      const response = await axios.get('https://api.ipify.org?format=json', axiosConfig);
      const proxyIP = response.data.ip;
      
      // Get location of proxy IP
      const location = await this.getIPLocation(proxyIP);
      
      this.proxyStatus = {
        working: true,
        ip: proxyIP,
        location: location,
        testedAt: new Date().toISOString()
      };

      logger.info(`✅ Proxy working. New IP: ${proxyIP} (${location.country})`);
      return this.proxyStatus;
      
    } catch (error) {
      this.proxyStatus = {
        working: false,
        error: error.message,
        testedAt: new Date().toISOString()
      };
      
      logger.error(`❌ Proxy test failed: ${error.message}`);
      throw error;
    }
  }

  getRecommendedProxyServices() {
    return {
      free: [
        {
          name: "ProxyList",
          url: "https://www.proxy-list.download/HTTPS",
          note: "Free proxies (unreliable, use for testing only)"
        }
      ],
      paid: [
        {
          name: "ProxyMesh",
          url: "https://proxymesh.com/",
          features: ["US IPs", "Residential IPs", "High uptime"],
          pricing: "~$10/month"
        },
        {
          name: "Bright Data (Luminati)",
          url: "https://brightdata.com/",
          features: ["Premium residential IPs", "City-level targeting", "99.9% uptime"],
          pricing: "~$500/month"
        },
        {
          name: "SmartProxy",
          url: "https://smartproxy.com/",
          features: ["40M+ residential IPs", "US city targeting", "Good for scraping"],
          pricing: "~$75/month"
        },
        {
          name: "IPRoyal",
          url: "https://iproyal.com/",
          features: ["Residential & datacenter IPs", "US locations", "Budget-friendly"],
          pricing: "~$7/month"
        }
      ],
      vpn: [
        {
          name: "NordVPN",
          setup: "Use SOCKS5 proxy feature",
          note: "Convert VPN to proxy for browser use"
        },
        {
          name: "ExpressVPN", 
          setup: "Use split tunneling or proxy feature",
          note: "Premium option with US servers"
        }
      ]
    };
  }

  logProxyRecommendations() {
    const services = this.getRecommendedProxyServices();
    
    console.log('\n🌐 USA IP Implementation Options:\n');
    
    console.log('💰 PAID PROXY SERVICES (Recommended):');
    services.paid.forEach(service => {
      console.log(`  • ${service.name} (${service.pricing})`);
      console.log(`    Features: ${service.features.join(', ')}`);
      console.log(`    URL: ${service.url}\n`);
    });
    
    console.log('🆓 FREE OPTIONS (Testing Only):');
    services.free.forEach(service => {
      console.log(`  • ${service.name}: ${service.url}`);
      console.log(`    ${service.note}\n`);
    });
    
    console.log('🔒 VPN OPTIONS:');
    services.vpn.forEach(service => {
      console.log(`  • ${service.name}: ${service.setup}`);
      console.log(`    ${service.note}\n`);
    });
  }
}

module.exports = ProxyManager;