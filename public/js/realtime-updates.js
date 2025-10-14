// Real-time updates for dashboard data
class RealTimeUpdates {
    constructor() {
        this.updateInterval = 30000; // 30 seconds
        this.isActive = false;
    }

    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.updateData();
        
        // Set up periodic updates
        this.intervalId = setInterval(() => {
            this.updateData();
        }, this.updateInterval);
        
        console.log('Real-time updates started');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.isActive = false;
            console.log('Real-time updates stopped');
        }
    }

    async updateData() {
        try {
            await this.updateLatestBids();
            await this.updateLatestNotices();
            
            // Update project stats if on customer dashboard
            if (window.location.pathname.includes('/customer/dashboard')) {
                await this.updateProjectStats();
            }
            
            // Update bid stats if on seller dashboard
            if (window.location.pathname.includes('/seller/dashboard')) {
                await this.updateBidStats();
            }
        } catch (error) {
            console.error('Real-time update error:', error);
        }
    }

    async updateLatestBids() {
        const response = await fetch('/api/latest-bids');
        const bids = await response.json();
        
        const bidsContainer = document.getElementById('latest-bids-container');
        if (bidsContainer) {
            this.renderBids(bids, bidsContainer);
        }
    }

    async updateLatestNotices() {
        const response = await fetch('/api/latest-notices');
        const notices = await response.json();
        
        const noticesContainer = document.getElementById('latest-notices-container');
        if (noticesContainer) {
            this.renderNotices(notices, noticesContainer);
        }
    }

    async updateProjectStats() {
        const userId = document.body.getAttribute('data-user-id');
        if (!userId) return;
        
        const response = await fetch(`/api/project-stats/${userId}`);
        const stats = await response.json();
        
        // Update stats counters if they exist
        stats.forEach(stat => {
            const element = document.getElementById(`stat-${stat._id}`);
            if (element) {
                element.textContent = stat.count;
            }
        });
    }

    async updateBidStats() {
        // Similar implementation for seller bid stats
        // This would require a new API endpoint
    }

    renderBids(bids, container) {
        if (bids.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">No bids yet</p>';
            return;
        }

        container.innerHTML = bids.map(bid => `
            <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition duration-300 mb-3">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-semibold text-gray-800 truncate text-sm">
                        ${bid.project?.title || 'Project'}
                    </h4>
                    <span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                        $${bid.amount}
                    </span>
                </div>
                <p class="text-xs text-gray-600 mb-2">
                    By: ${bid.seller?.companyName || bid.seller?.name || 'Unknown'}
                </p>
                <p class="text-xs text-gray-500">
                    ${new Date(bid.createdAt).toLocaleDateString()}
                </p>
            </div>
        `).join('');
    }

    renderNotices(notices, container) {
        if (notices.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">No notices</p>';
            return;
        }

        container.innerHTML = notices.map(notice => `
            <div class="border-l-4 border-indigo-500 pl-4 py-2 hover:bg-gray-50 transition duration-300 mb-3">
                <h4 class="font-semibold text-gray-800 text-sm mb-1">
                    ${notice.title}
                </h4>
                <p class="text-xs text-gray-600 mb-2">
                    ${notice.content.substring(0, 80)}...
                </p>
                <p class="text-xs text-gray-500">
                    ${new Date(notice.createdAt).toLocaleDateString()}
                </p>
            </div>
        `).join('');
    }
}

// Initialize real-time updates when page loads
document.addEventListener('DOMContentLoaded', function() {
    const realTimeUpdates = new RealTimeUpdates();
    
    // Start updates only on dashboard pages
    if (window.location.pathname.includes('/dashboard')) {
        realTimeUpdates.start();
    }
    
    // Stop updates when leaving the page
    window.addEventListener('beforeunload', () => {
        realTimeUpdates.stop();
    });
});