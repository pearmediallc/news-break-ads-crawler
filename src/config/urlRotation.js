// URL rotation configuration for unlimited ad extraction
// Rotates through different NewsBreak locations to find fresh ads

const NEWSBREAK_LOCATIONS = [
  // Major US Cities - High traffic
  'https://www.newsbreak.com/new-york-ny',
  'https://www.newsbreak.com/los-angeles-ca',
  'https://www.newsbreak.com/chicago-il',
  'https://www.newsbreak.com/houston-tx',
  'https://www.newsbreak.com/philadelphia-pa',
  'https://www.newsbreak.com/phoenix-az',
  'https://www.newsbreak.com/san-antonio-tx',
  'https://www.newsbreak.com/san-diego-ca',
  'https://www.newsbreak.com/dallas-tx',
  'https://www.newsbreak.com/san-jose-ca',

  // Mid-size Cities - Good ad diversity
  'https://www.newsbreak.com/austin-tx',
  'https://www.newsbreak.com/jacksonville-fl',
  'https://www.newsbreak.com/san-francisco-ca',
  'https://www.newsbreak.com/columbus-oh',
  'https://www.newsbreak.com/indianapolis-in',
  'https://www.newsbreak.com/fort-worth-tx',
  'https://www.newsbreak.com/charlotte-nc',
  'https://www.newsbreak.com/seattle-wa',
  'https://www.newsbreak.com/denver-co',
  'https://www.newsbreak.com/washington-dc',

  // Additional Cities
  'https://www.newsbreak.com/boston-ma',
  'https://www.newsbreak.com/el-paso-tx',
  'https://www.newsbreak.com/detroit-mi',
  'https://www.newsbreak.com/nashville-tn',
  'https://www.newsbreak.com/memphis-tn',
  'https://www.newsbreak.com/portland-or',
  'https://www.newsbreak.com/oklahoma-city-ok',
  'https://www.newsbreak.com/las-vegas-nv',
  'https://www.newsbreak.com/louisville-ky',
  'https://www.newsbreak.com/baltimore-md',
  'https://www.newsbreak.com/milwaukee-wi',
  'https://www.newsbreak.com/albuquerque-nm',
  'https://www.newsbreak.com/tucson-az',
  'https://www.newsbreak.com/fresno-ca',
  'https://www.newsbreak.com/sacramento-ca',
  'https://www.newsbreak.com/mesa-az',
  'https://www.newsbreak.com/kansas-city-mo',
  'https://www.newsbreak.com/atlanta-ga',
  'https://www.newsbreak.com/miami-fl',
  'https://www.newsbreak.com/tampa-fl'
];

class URLRotationManager {
  constructor(startingUrl = null) {
    this.urls = [...NEWSBREAK_LOCATIONS];
    this.currentIndex = 0;

    // If starting URL is provided and exists in list, start from there
    if (startingUrl) {
      const index = this.urls.findIndex(url => url === startingUrl);
      if (index !== -1) {
        this.currentIndex = index;
      }
    }

    this.rotationHistory = [];
    this.lastRotationTime = Date.now();
  }

  getCurrentUrl() {
    return this.urls[this.currentIndex];
  }

  getNextUrl() {
    this.currentIndex = (this.currentIndex + 1) % this.urls.length;
    const url = this.urls[this.currentIndex];

    this.rotationHistory.push({
      url,
      timestamp: new Date().toISOString(),
      index: this.currentIndex
    });

    this.lastRotationTime = Date.now();

    // Keep only last 50 rotations in history
    if (this.rotationHistory.length > 50) {
      this.rotationHistory = this.rotationHistory.slice(-50);
    }

    return url;
  }

  getRandomUrl() {
    // Get a random URL different from current
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * this.urls.length);
    } while (newIndex === this.currentIndex && this.urls.length > 1);

    this.currentIndex = newIndex;
    const url = this.urls[this.currentIndex];

    this.rotationHistory.push({
      url,
      timestamp: new Date().toISOString(),
      index: this.currentIndex,
      random: true
    });

    this.lastRotationTime = Date.now();

    return url;
  }

  getRotationStats() {
    return {
      totalUrls: this.urls.length,
      currentIndex: this.currentIndex,
      currentUrl: this.getCurrentUrl(),
      totalRotations: this.rotationHistory.length,
      lastRotation: this.lastRotationTime,
      timeSinceLastRotation: Date.now() - this.lastRotationTime,
      recentRotations: this.rotationHistory.slice(-10)
    };
  }
}

module.exports = {
  NEWSBREAK_LOCATIONS,
  URLRotationManager
};
