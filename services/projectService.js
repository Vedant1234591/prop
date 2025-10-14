const Project = require('../models/Project');
const Bid = require('../models/Bid');

class ProjectService {
    static async updateProjectStatuses() {
        try {
            const now = new Date();
            
            // Update drafted projects to in-progress when start date arrives
            await Project.updateMany({
                status: 'drafted',
                'timeline.startDate': { $lte: now }
            }, {
                status: 'in-progress'
            });

            // Update in-progress projects to failed if end date passed
            await Project.updateMany({
                status: 'in-progress',
                'timeline.endDate': { $lte: now }
            }, {
                status: 'failed'
            });

            console.log('Project statuses updated successfully');
        } catch (error) {
            console.error('Error updating project statuses:', error);
        }
    }

    static async checkBidDeadlines() {
        try {
            const now = new Date();
            
            await Project.updateMany({
                'bidSettings.bidEndDate': { $lte: now },
                'bidSettings.isActive': true
            }, {
                'bidSettings.isActive': false
            });

            console.log('Bid deadlines checked successfully');
        } catch (error) {
            console.error('Error checking bid deadlines:', error);
        }
    }
}

module.exports = ProjectService;