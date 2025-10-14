const cron = require('node-cron');
const ProjectService = require('./services/projectService');

// Run every hour to update project statuses
cron.schedule('0 * * * *', () => {
    console.log('Running scheduled task: Update project statuses');
    ProjectService.updateProjectStatuses();
});

// Run every day at midnight to check bid deadlines
cron.schedule('0 0 * * *', () => {
    console.log('Running scheduled task: Check bid deadlines');
    ProjectService.checkBidDeadlines();
});

module.exports = cron;