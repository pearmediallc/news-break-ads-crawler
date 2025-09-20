// src/extractors/simpleAdExtractor.js
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

class SimpleAdExtractor {
  constructor() {
    this.extractedAds = [];
    this.processedAdIds = new Set();
  }

  async extractAdsFromPage(page) {
    try {
      const ads = await page.evaluate(() => {
        const extractedAds = [];

        // Target for-you sections first
        const forYouSections = document.querySelectorAll('[class*="for-you"], [data-testid*="for-you"]');

        forYouSections.forEach(section => {
          // Find ad banners within for-you sections
          const adBanners = section.querySelectorAll('.ad-banner, [class*="ad-banner"], [class*="sponsored"]');

          adBanners.forEach(banner => {
            const adData = {
              id: '',
              image: '',
              heading: '',
              description: '',
              link: '',
              timestamp: new Date().toISOString()
            };

            // Extract image from creative-container
            const creativeContainer = banner.querySelector('.creative-container, [class*="creative-container"], [class*="creative"]');
            if (creativeContainer) {
              const img = creativeContainer.querySelector('img');
              if (img) {
                adData.image = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
              }
            }

            // Fallback image extraction
            if (!adData.image) {
              const anyImg = banner.querySelector('img');
              if (anyImg) {
                adData.image = anyImg.src || anyImg.getAttribute('data-src') || '';
              }
            }

            // Extract heading from ad-heading
            const adHeading = banner.querySelector('.ad-heading, [class*="ad-heading"], [class*="title"], h2, h3, h4');
            if (adHeading) {
              adData.heading = adHeading.textContent.trim();
            }

            // Extract description
            const adDescription = banner.querySelector('.ad-description, [class*="ad-description"], [class*="ad-text"], [class*="description"], p');
            if (adDescription) {
              adData.description = adDescription.textContent.trim();
            }

            // Extract link from ad-button or learn more links
            const adButton = banner.querySelector('.ad-button, [class*="ad-button"], a[href*="learn"], a[href*="more"], a[href*="visit"], button[onclick]');
            if (adButton) {
              if (adButton.href) {
                adData.link = adButton.href;
              } else if (adButton.getAttribute('data-href')) {
                adData.link = adButton.getAttribute('data-href');
              } else if (adButton.onclick) {
                // Try to extract URL from onclick
                const onclickStr = adButton.onclick.toString();
                const urlMatch = onclickStr.match(/https?:\/\/[^\s'"]+/);
                if (urlMatch) {
                  adData.link = urlMatch[0];
                }
              }
            }

            // Generate unique ID
            adData.id = `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Only add if we have meaningful content
            if (adData.heading || adData.image || adData.link) {
              extractedAds.push(adData);
            }
          });
        });

        // Fallback: look for any sponsored content
        if (extractedAds.length === 0) {
          const fallbackAds = document.querySelectorAll('[class*="sponsored"], [class*="promotion"], [data-ad], [id*="ad-"], [class*="advertisement"]');

          fallbackAds.forEach(element => {
            const adData = {
              id: `ad_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              image: '',
              heading: '',
              description: '',
              link: '',
              timestamp: new Date().toISOString()
            };

            const img = element.querySelector('img');
            if (img) {
              adData.image = img.src || img.getAttribute('data-src') || '';
            }

            const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]');
            if (headings.length > 0) {
              adData.heading = headings[0].textContent.trim();
            }

            const descriptions = element.querySelectorAll('p, [class*="description"], [class*="text"]:not([class*="heading"])');
            if (descriptions.length > 0) {
              adData.description = descriptions[0].textContent.trim().substring(0, 200);
            }

            const links = element.querySelectorAll('a[href]');
            if (links.length > 0) {
              // Find the most relevant link (prefer "learn more" style links)
              const learnMoreLink = Array.from(links).find(link =>
                link.textContent.toLowerCase().includes('learn') ||
                link.textContent.toLowerCase().includes('more') ||
                link.textContent.toLowerCase().includes('visit')
              );
              adData.link = learnMoreLink ? learnMoreLink.href : links[0].href;
            }

            if (adData.heading || adData.image) {
              extractedAds.push(adData);
            }
          });
        }

        return extractedAds;
      });

      // Filter out duplicates
      const newAds = [];
      ads.forEach(ad => {
        const adKey = `${ad.heading}_${ad.image}`;
        if (!this.processedAdIds.has(adKey)) {
          this.processedAdIds.add(adKey);
          this.extractedAds.push(ad);
          newAds.push(ad);
          logger.info(`✓ Extracted ad: ${ad.heading || 'No title'} (${ad.id})`);
        }
      });

      return newAds;

    } catch (error) {
      logger.error('Error extracting ads:', error);
      return [];
    }
  }

  async saveToJSON(outputDir = './output') {
    await fs.mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const jsonPath = path.join(outputDir, `newsbreak_ads_${timestamp}.json`);

    await fs.writeFile(jsonPath, JSON.stringify(this.extractedAds, null, 2));
    logger.info(`📁 JSON saved: ${jsonPath}`);
    return jsonPath;
  }

  async saveToExcel(outputDir = './output') {
    await fs.mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ads');

    // Define columns
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 20 },
      { header: 'Heading', key: 'heading', width: 40 },
      { header: 'Description', key: 'description', width: 60 },
      { header: 'Image URL', key: 'image', width: 50 },
      { header: 'Link', key: 'link', width: 50 },
      { header: 'Extracted At', key: 'timestamp', width: 25 }
    ];

    // Add data rows
    this.extractedAds.forEach(ad => {
      worksheet.addRow({
        id: ad.id,
        heading: ad.heading || '',
        description: ad.description || '',
        image: ad.image || '',
        link: ad.link || '',
        timestamp: ad.timestamp
      });
    });

    // Style the header row
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    const excelPath = path.join(outputDir, `newsbreak_ads_${timestamp}.xlsx`);
    await workbook.xlsx.writeFile(excelPath);
    logger.info(`📊 Excel saved: ${excelPath}`);
    return excelPath;
  }

  async generateHTMLDisplay(outputDir = './output') {
    await fs.mkdir(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const htmlPath = path.join(outputDir, `newsbreak_ads_display_${timestamp}.html`);

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>News Break Ads - ${new Date().toLocaleDateString()}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #0f0f0f;
            color: #fff;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
        }

        .stat {
            text-align: center;
        }

        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #ffd700;
        }

        .stat-label {
            font-size: 0.9rem;
            opacity: 0.9;
        }

        .ads-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }

        .ad-card {
            background: #1a1a1a;
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid #333;
            transition: transform 0.3s, box-shadow 0.3s;
            display: flex;
            flex-direction: column;
        }

        .ad-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }

        .ad-header {
            background: #252525;
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #333;
        }

        .ad-id {
            font-size: 0.75rem;
            color: #888;
            font-family: monospace;
        }

        .ad-badge {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: bold;
        }

        .ad-image-container {
            width: 100%;
            height: 200px;
            background: #0a0a0a;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
        }

        .ad-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .no-image {
            color: #555;
            font-size: 3rem;
        }

        .ad-content {
            padding: 20px;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
        }

        .ad-heading {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 10px;
            color: #fff;
            line-height: 1.4;
        }

        .ad-description {
            color: #aaa;
            font-size: 0.9rem;
            line-height: 1.6;
            margin-bottom: 15px;
            flex-grow: 1;
        }

        .ad-footer {
            padding: 15px 20px;
            background: #252525;
            border-top: 1px solid #333;
        }

        .ad-link {
            display: inline-block;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            transition: all 0.3s;
            width: 100%;
            text-align: center;
        }

        .ad-link:hover {
            background: linear-gradient(135deg, #764ba2, #667eea);
            transform: scale(1.02);
        }

        .ad-link.disabled {
            background: #444;
            cursor: not-allowed;
            opacity: 0.6;
        }

        .ad-timestamp {
            font-size: 0.75rem;
            color: #666;
            margin-top: 10px;
            text-align: right;
        }

        .filter-bar {
            background: #1a1a1a;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .search-input {
            width: 100%;
            padding: 12px;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 6px;
            color: white;
            font-size: 1rem;
        }

        .search-input:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }

        .no-results {
            text-align: center;
            padding: 60px 20px;
            color: #666;
        }

        .export-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 20px;
        }

        .export-btn {
            padding: 10px 20px;
            background: #333;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background 0.3s;
        }

        .export-btn:hover {
            background: #444;
        }

        @media (max-width: 768px) {
            .ads-grid {
                grid-template-columns: 1fr;
            }

            .header h1 {
                font-size: 1.8rem;
            }

            .stats {
                flex-direction: column;
                gap: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📰 News Break Ads Collection</h1>
        <p>Scraped on ${new Date().toLocaleString()}</p>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${this.extractedAds.length}</div>
                <div class="stat-label">Total Ads</div>
            </div>
            <div class="stat">
                <div class="stat-value">${this.extractedAds.filter(ad => ad.image).length}</div>
                <div class="stat-label">With Images</div>
            </div>
            <div class="stat">
                <div class="stat-value">${this.extractedAds.filter(ad => ad.link).length}</div>
                <div class="stat-label">With Links</div>
            </div>
        </div>
    </div>

    <div class="filter-bar">
        <input type="text" class="search-input" id="searchInput" placeholder="🔍 Search ads by heading or description...">
    </div>

    <div class="ads-grid" id="adsGrid">
        ${this.extractedAds.map(ad => `
            <div class="ad-card" data-search="${(ad.heading + ' ' + ad.description).toLowerCase()}">
                <div class="ad-header">
                    <span class="ad-id">ID: ${ad.id.substring(0, 15)}...</span>
                    <span class="ad-badge">GENERATED</span>
                </div>

                <div class="ad-image-container">
                    ${ad.image
                        ? `<img src="${ad.image}" alt="${ad.heading}" class="ad-image" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'no-image\\'>📷</div>'">`
                        : '<div class="no-image">📷</div>'}
                </div>

                <div class="ad-content">
                    <h3 class="ad-heading">${ad.heading || 'Untitled Ad'}</h3>
                    <p class="ad-description">${ad.description || 'No description available'}</p>
                </div>

                <div class="ad-footer">
                    ${ad.link
                        ? `<a href="${ad.link}" target="_blank" class="ad-link" rel="noopener noreferrer">Visit Page →</a>`
                        : '<span class="ad-link disabled">No Link Available</span>'}
                    <div class="ad-timestamp">Extracted: ${new Date(ad.timestamp).toLocaleTimeString()}</div>
                </div>
            </div>
        `).join('')}
    </div>

    ${this.extractedAds.length === 0 ? '<div class="no-results">No ads found. Please run the scraper.</div>' : ''}

    <script>
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('.ad-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const searchText = card.getAttribute('data-search');
                if (searchText.includes(searchTerm)) {
                    card.style.display = 'flex';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            const grid = document.getElementById('adsGrid');
            if (visibleCount === 0 && searchTerm !== '') {
                if (!document.querySelector('.no-search-results')) {
                    const noResults = document.createElement('div');
                    noResults.className = 'no-results no-search-results';
                    noResults.textContent = 'No ads match your search.';
                    grid.after(noResults);
                }
            } else {
                const noResults = document.querySelector('.no-search-results');
                if (noResults) {
                    noResults.remove();
                }
            }
        });

        // Export ads data as JSON
        const adsData = ${JSON.stringify(this.extractedAds, null, 2)};

        // Log to console for debugging
        console.log('Extracted Ads Data:', adsData);
    </script>
</body>
</html>`;

    await fs.writeFile(htmlPath, htmlContent);
    logger.info(`🌐 HTML display saved: ${htmlPath}`);
    return htmlPath;
  }

  getStats() {
    return {
      total: this.extractedAds.length,
      withImages: this.extractedAds.filter(ad => ad.image).length,
      withLinks: this.extractedAds.filter(ad => ad.link).length,
      withDescriptions: this.extractedAds.filter(ad => ad.description).length
    };
  }
}

module.exports = SimpleAdExtractor;