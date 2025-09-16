// dashboardConnector.js - Connects extracted ads to the dashboard
const fs = require('fs').promises;
const path = require('path');

class DashboardConnector {
    constructor() {
        this.outputDir = path.join(__dirname, '../../output');
        this.dashboardDataFile = path.join(this.outputDir, 'ads-data.json');
    }

    async saveAdsForDashboard(ads) {
        try {
            // Ensure output directory exists
            await fs.mkdir(this.outputDir, { recursive: true });

            // Transform ads data for dashboard display
            const dashboardData = {
                timestamp: new Date().toISOString(),
                extractionDate: new Date().toLocaleDateString(),
                extractionTime: new Date().toLocaleTimeString(),
                total: ads.length,
                stats: this.calculateStats(ads),
                ads: ads.map(ad => this.transformAdForDashboard(ad))
            };

            // Save to JSON file
            await fs.writeFile(
                this.dashboardDataFile,
                JSON.stringify(dashboardData, null, 2)
            );

            console.log(`\n✅ Dashboard data saved: ${this.dashboardDataFile}`);
            console.log(`   Total ads: ${dashboardData.total}`);
            console.log(`   Display ads: ${dashboardData.stats.displayAds}`);
            console.log(`   Google ads: ${dashboardData.stats.googleAds}`);
            console.log(`   Visible ads: ${dashboardData.stats.visibleAds}`);

            return dashboardData;
        } catch (error) {
            console.error('Error saving dashboard data:', error);
            throw error;
        }
    }

    calculateStats(ads) {
        return {
            displayAds: ads.filter(ad =>
                ad.type && ad.type.includes('display')
            ).length,
            googleAds: ads.filter(ad =>
                ad.type && (ad.type.includes('google') || ad.id?.includes('google'))
            ).length,
            visibleAds: ads.filter(ad =>
                ad.position && ad.position.visible
            ).length,
            nativeAds: ads.filter(ad =>
                ad.type && ad.type.includes('native')
            ).length,
            adsByType: this.groupByType(ads)
        };
    }

    groupByType(ads) {
        const grouped = {};
        ads.forEach(ad => {
            const type = ad.type || 'unknown';
            grouped[type] = (grouped[type] || 0) + 1;
        });
        return grouped;
    }

    transformAdForDashboard(ad) {
        // Generate title and description if not present
        let title = ad.title || ad.heading || '';
        let description = ad.description || '';

        if (!title) {
            if (ad.type === 'google_display_ad') {
                title = 'Google Display Ad';
            } else if (ad.type === 'native_ad_widget') {
                title = `${ad.platform || 'Native'} Sponsored Content`;
            } else if (ad.type === 'display_ad_container') {
                title = 'Display Advertisement';
            } else {
                title = `Ad ${ad.id}`;
            }
        }

        if (!description) {
            if (ad.size) {
                description = `${ad.type} - Size: ${ad.size}`;
            } else {
                description = `Advertisement ID: ${ad.id}`;
            }
        }

        return {
            ...ad,
            title,
            description,
            displaySize: ad.size || 'Dynamic',
            isVisible: ad.position?.visible || false,
            extractedAt: new Date().toISOString()
        };
    }

    async exportToExcel(ads) {
        try {
            const csvContent = this.convertToCSV(ads);
            const csvFile = path.join(
                this.outputDir,
                `newsbreak_ads_${Date.now()}.csv`
            );

            await fs.writeFile(csvFile, csvContent);
            console.log(`\n📊 Excel/CSV exported: ${csvFile}`);
            return csvFile;
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            throw error;
        }
    }

    convertToCSV(ads) {
        const headers = [
            'ID',
            'Type',
            'Title',
            'Description',
            'Size',
            'Platform',
            'Visible',
            'Position Top',
            'Position Left',
            'Container ID',
            'Google Query ID',
            'Source URL',
            'Extracted At'
        ];

        const rows = ads.map(ad => {
            const transformedAd = this.transformAdForDashboard(ad);
            return [
                ad.id || '',
                ad.type || '',
                transformedAd.title || '',
                `"${(transformedAd.description || '').replace(/"/g, '""')}"`,
                ad.size || '',
                ad.platform || '',
                ad.position?.visible ? 'Yes' : 'No',
                ad.position?.top || '',
                ad.position?.left || '',
                ad.container?.id || '',
                ad.googleQueryId || '',
                ad.src || '',
                new Date().toISOString()
            ];
        });

        return [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
    }

    async loadLatestAds() {
        try {
            const data = await fs.readFile(this.dashboardDataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.log('No existing ads data found');
            return null;
        }
    }

    async appendAds(newAds) {
        try {
            const existingData = await this.loadLatestAds();

            if (existingData && existingData.ads) {
                // Merge new ads with existing, avoiding duplicates
                const existingIds = new Set(existingData.ads.map(ad => ad.id));
                const uniqueNewAds = newAds.filter(ad => !existingIds.has(ad.id));

                const mergedAds = [...existingData.ads, ...uniqueNewAds];
                await this.saveAdsForDashboard(mergedAds);

                console.log(`\n📝 Appended ${uniqueNewAds.length} new ads`);
                return mergedAds;
            } else {
                await this.saveAdsForDashboard(newAds);
                return newAds;
            }
        } catch (error) {
            console.error('Error appending ads:', error);
            throw error;
        }
    }
}

module.exports = DashboardConnector;