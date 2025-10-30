const cron = require('node-cron');
const Project = require('../models/Project');
const Bid = require('../models/Bid');
const Contract = require('../models/Contract');
const User = require('../models/User');
const Notice = require('../models/Notice');
const Agreement = require('../models/Agreement');
const PDFGenerator = require('../services/pdfGenerator');

class StatusAutomationService {
    constructor() {
        this.isRunning = false;
    }

    // ==================== CORE AUTOMATION METHOD ====================
    async updateAllProjectStatuses() {
        try {
            console.log('🔄 === COMPLETE PROJECT LIFECYCLE AUTOMATION STARTED ===');
            const now = new Date();
            
            let results = {
                autoSubmitted: 0,
                draftedToActive: 0,
                biddingStarted: 0,
                biddingClosed: 0,
                winnersSelected: 0,
                bidsUpdated: 0,
                contractsCreated: 0,
                contractsCompleted: 0,
                projectsCompleted: 0,
                certificatesGenerated: 0,
                expiredProjects: 0,
                validationErrors: 0,
                round1Completed: 0,
                round2Completed: 0,
                contractsCancelled: 0,
                projectsFailed: 0,
                adminApproved: 0,
                agreementsCreated: 0,
                defectedExpired: 0,
                waitingPromoted: 0
            };

            // 🔄 PHASE 1: Project Verification & Auto-Submission
            await this.handleProjectVerificationStatus(results, now);
            
            // 🔄 PHASE 2: Activate Admin-Approved Projects
            await this.activateApprovedProjects(results, now);
            
            // 🔄 PHASE 3: Bidding Rounds Management
            await this.manageBiddingRounds(results, now);
            
            // 🔄 PHASE 4: Handle Expired Resubmissions
            await this.handleExpiredResubmissions(results, now);
            
            // 🔄 PHASE 5: Contract Management
            await this.manageContracts(results, now);
            
            // 🔄 PHASE 6: Project Completion
            await this.completeProjects(results, now);
            
            // 🔄 PHASE 7: Cleanup Expired Projects
            await this.cleanupExpiredProjects(results, now);

            console.log('\n📊 === COMPLETE AUTOMATION SUMMARY ===');
            Object.entries(results).forEach(([key, value]) => {
                if (value > 0) {
                    console.log(`📈 ${key}: ${value}`);
                }
            });
            
            console.log('✅ === AUTOMATION CYCLE COMPLETED ===\n');
            return results;

        } catch (error) {
            console.error('❌ Complete automation error:', error);
            throw error;
        }
    }

    // ==================== PROJECT VERIFICATION ====================
    async handleProjectVerificationStatus(results, now) {
        try {
            // Auto-submit drafted projects for verification after 24 hours
            const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const draftedProjects = await Project.find({
                status: 'drafted',
                createdAt: { $lte: twentyFourHoursAgo }
            }).populate('customer');

            console.log(`📝 Found ${draftedProjects.length} drafted projects to check`);

            for (const project of draftedProjects) {
                try {
                    // Validate required fields
                    const requiredFields = [
                        'title', 'description', 'requirements', 
                        'location.address', 'location.city', 'location.state', 'location.zipCode',
                        'contact.phone', 'timeline.startDate', 'timeline.endDate',
                        'bidSettings.startingBid', 'bidSettings.bidEndDate'
                    ];
                    
                    let missingFields = [];
                    for (const field of requiredFields) {
                        const value = field.split('.').reduce((obj, key) => obj && obj[key], project);
                        if (!value || value.toString().trim() === '') {
                            missingFields.push(field);
                        }
                    }

                    if (missingFields.length > 0) {
                        console.log(`⏭️ Skipping ${project.title} - missing: ${missingFields.join(', ')}`);
                        continue;
                    }

                    // Submit for verification
                    project.status = 'pending';
                    project.adminStatus = 'pending';
                    await project.save();
                    
                    results.autoSubmitted++;
                    console.log(`✅ Auto-submitted: ${project.title}`);
                    
                    // Notify customer
                    await this.createNotice(
                        `Project Submitted - ${project.title}`,
                        'Your project has been automatically submitted for admin verification.',
                        'customer',
                        'info',
                        project.customer._id
                    );
                    
                    // Notify admin
                    await this.createNotice(
                        `New Project for Verification - ${project.title}`,
                        `A new project "${project.title}" has been submitted for verification.`,
                        'admin',
                        'info'
                    );
                    
                } catch (error) {
                    console.error(`❌ Error auto-submitting ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Project verification error:', error);
        }
    }

    // ==================== ACTIVATE APPROVED PROJECTS ====================
    async activateApprovedProjects(results, now) {
        try {
            const approvedProjects = await Project.find({
                adminStatus: 'approved',
                status: 'pending'
            }).populate('customer');

            console.log(`✅ Found ${approvedProjects.length} approved projects to activate`);

            for (const project of approvedProjects) {
                try {
                    // Create agreements for the project
                    const agreement = await Agreement.createDefaultAgreements(project);
                    results.agreementsCreated++;

                    // Activate project and start Round 1 bidding
                    project.status = 'active';
                    project.bidSettings.isActive = true;
                    project.isPublic = true;
                    
                    // Initialize Round 1 bidding
                    project.biddingRounds.round1.startDate = new Date();
                    project.biddingRounds.round1.endDate = project.bidSettings.bidEndDate;
                    project.biddingRounds.round1.status = 'active';
                    project.biddingRounds.currentRound = 1;
                    
                    await project.save();
                    
                    results.draftedToActive++;
                    results.adminApproved++;
                    console.log(`🚀 Activated project: ${project.title}`);
                    
                    // Notify customer
                    await this.createNotice(
                        `Project Approved and Active - ${project.title}`,
                        'Your project has been approved and is now active for Round 1 bidding.',
                        'customer',
                        'success',
                        project.customer._id
                    );

                    // Notify all sellers
                    await this.createNotice(
                        `New Project Available - ${project.title}`,
                        `A new project "${project.title}" is now available for Round 1 bidding.`,
                        'seller',
                        'info'
                    );
                    
                } catch (error) {
                    console.error(`❌ Failed to activate ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Project activation error:', error);
        }
    }

    // ==================== BIDDING ROUNDS MANAGEMENT ====================
    async manageBiddingRounds(results, now) {
        try {
            console.log('🔄 Managing bidding rounds...');
            
            // 🎯 PHASE 1: Process Round 1 Completion
            await this.processRound1Completion(results, now);
            
            // 🎯 PHASE 2: Process Customer Selection Phase
            await this.processSelectionPhase(results, now);
            
            // 🎯 PHASE 3: Process Round 2 Completion & Winner Selection
            await this.processRound2Completion(results, now);

        } catch (error) {
            console.error('❌ Bidding rounds management error:', error);
        }
    }

   
    // 🎯 SELECTION PHASE - CUSTOMER SELECTS TOP 3 FROM TOP 10
    async processSelectionPhase(results, now) {
        try {
            // Check for projects where selection deadline has passed but customer hasn't selected
            const expiredSelectionProjects = await Project.find({
                'biddingRounds.currentRound': 1.5,
                'biddingRounds.selectionDeadline': { $lte: now },
                'biddingRounds.round2.status': 'pending'
            }).populate('customer');

            console.log(`⏰ Processing ${expiredSelectionProjects.length} expired selection projects`);

            for (const project of expiredSelectionProjects) {
                try {
                    // Auto-select the current top 3 for Round 2
                    const currentTop3 = project.round1Selections.top3
                        .filter(selection => selection.status === 'selected' || selection.status === 'resubmitted')
                        .slice(0, 3);

                    if (currentTop3.length === 3) {
                        const selectedBidIds = currentTop3.map(selection => selection.bid);
                        await project.selectTop3ForRound2(selectedBidIds);

                        console.log(`✅ Auto-selected top 3 for Round 2: ${project.title}`);
                        results.round2Started++;

                        // Notify customer
                        await this.createNotice(
                            `Round 2 Auto-Started - ${project.title}`,
                            'Round 2 has been automatically started with the current top 3 bids since no selection was made within 24 hours.',
                            'customer',
                            'info',
                            project.customer._id
                        );

                        // Notify selected sellers
                        for (const selection of currentTop3) {
                            const bid = await Bid.findById(selection.bid).populate('seller');
                            if (bid && bid.seller) {
                                await this.createNotice(
                                    `Selected for Round 2 - ${project.title}`,
                                    `Your bid has been automatically selected for Round 2. You can update your bid within the next 24 hours.`,
                                    'seller',
                                    'success',
                                    bid.seller._id
                                );
                            }
                        }

                        // Notify waiting queue sellers they are now lost
                        const waitingBids = await Bid.find({
                            project: project._id,
                            selectionStatus: 'waiting-queue'
                        }).populate('seller');

                        for (const bid of waitingBids) {
                            await this.createNotice(
                                `Project Completed - ${project.title}`,
                                'The project has moved to Round 2 and your bid in waiting queue is now marked as lost.',
                                'seller',
                                'info',
                                bid.seller._id
                            );
                        }

                    } else {
                        // Not enough valid bids - project fails
                        await project.markAsFailed();
                        console.log(`❌ Project failed - not enough valid bids: ${project.title}`);
                        results.projectsFailed++;

                        await this.createNotice(
                            `Project Failed - ${project.title}`,
                            'Project failed because there were not enough valid bids for Round 2.',
                            'customer',
                            'error',
                            project.customer._id
                        );
                    }

                } catch (error) {
                    console.error(`❌ Error processing expired selection for ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Selection phase error:', error);
        }
    }





    // ==================== ROUND 1 COMPLETION ====================
// ==================== ROUND 1 COMPLETION ====================
async processRound1Completion(results, now) {
  try {
    const round1Projects = await Project.find({
      'biddingRounds.currentRound': 1,
      'biddingRounds.round1.status': 'active',
      'biddingRounds.round1.endDate': { $lte: now },
      'biddingRounds.round1.autoSelectionCompleted': { $ne: true }
    }).populate('customer');

    console.log(`🎯 Processing ${round1Projects.length} Round 1 projects for completion`);

    for (const project of round1Projects) {
      try {
        console.log(`🔄 Completing Round 1 for: ${project.title}`);
        
        // Check if there are any bids for this project
        const bidCount = await Bid.countDocuments({ 
          project: project._id,
          $or: [
            { round: 1 },
            { round: { $exists: false } }
          ]
        });
        
        console.log(`📊 Found ${bidCount} total bids for project ${project.title}`);
        
        if (bidCount === 0) {
          console.log(`❌ No bids found for project: ${project.title}, marking as failed`);
          project.status = 'failed';
          project.biddingRounds.round1.status = 'completed';
          project.biddingRounds.round1Completed = true;
          project.biddingRounds.currentRound = 1.5;
          await project.save();
          results.projectsFailed++;
          continue;
        }
        
        // Use project method to complete Round 1 and auto-select top 3 + waiting queue
        await project.completeRound1();
        
        // Reload project to get updated status
        const updatedProject = await Project.findById(project._id);
        
        if (updatedProject.status === 'failed') {
          console.log(`❌ Project failed after Round 1 completion: ${project.title}`);
          results.projectsFailed++;
          
          await this.createNotice(
            `Project Failed - ${project.title}`,
            'The project failed because there were no eligible bids for Round 1 selection.',
            'customer',
            'error',
            project.customer._id
          );
        } else {
          results.round1Completed++;
          console.log(`✅ Round 1 completed: ${project.title}`);
          
          // Notify customer
          await this.createNotice(
            `Round 1 Completed - ${project.title}`,
            'Round 1 bidding has ended. Top 3 bids have been automatically selected for your review. You have 24 hours to select or mark defects.',
            'customer',
            'info',
            project.customer._id
          );

          // Notify top 3 sellers
          const top3Bids = await Bid.find({
            project: project._id,
            selectionStatus: 'selected-round1'
          }).populate('seller');

          for (const bid of top3Bids) {
            await this.createNotice(
              `Selected for Customer Review - ${project.title}`,
              'Congratulations! Your bid has been selected in the top 3. Customer will now review your bid and may mark as defected with remarks.',
              'seller',
              'success',
              bid.seller._id
            );
          }

          // Notify waiting queue sellers
          const waitingBids = await Bid.find({
            project: project._id,
            selectionStatus: 'waiting-queue'
          }).populate('seller');

          for (const bid of waitingBids) {
            await this.createNotice(
              `Waiting Queue - ${project.title}`,
              `Your bid is in waiting queue position ${bid.queuePosition}. You may be promoted if any top 3 bids are defected and not resubmitted within 24 hours.`,
              'seller',
              'info',
              bid.seller._id
            );
          }
        }

      } catch (error) {
        console.error(`❌ Error completing Round 1 for ${project.title}:`, error.message);
        results.validationErrors++;
        
        // Mark project as failed if Round 1 completion fails
        project.status = 'failed';
        project.biddingRounds.round1.status = 'completed';
        await project.save();
        results.projectsFailed++;
      }
    }
  } catch (error) {
    console.error('❌ Round 1 completion error:', error);
  }
}
    // ==================== EXPIRED RESUBMISSIONS ====================
    async handleExpiredResubmissions(results, now) {
        try {
            console.log('⏰ Handling expired resubmissions...');
            
            // Handle expired defected bids across all projects
            await this.handleExpiredDefectedBids(results, now);
            
            // Handle projects with expired resubmissions
            await this.handleProjectExpiredResubmissions(results, now);

        } catch (error) {
            console.error('❌ Expired resubmissions error:', error);
        }
    }

    async handleExpiredDefectedBids(results, now) {
        try {
            const expiredDefectedBids = await Bid.find({
                selectionStatus: 'defected',
                resubmissionDeadline: { $lte: now }
            }).populate('project').populate('seller');

            console.log(`⏰ Processing ${expiredDefectedBids.length} expired defected bids`);

            for (const bid of expiredDefectedBids) {
                try {
                    // Auto-mark as lost using bid method
                    const wasExpired = await bid.autoMarkAsLostIfExpired();
                    
                    if (wasExpired) {
                        results.defectedExpired++;
                        console.log(`❌ Bid ${bid._id} expired and marked as lost`);
                        
                        // Notify seller
                        await this.createNotice(
                            `Resubmission Deadline Passed - ${bid.project.title}`,
                            'Your bid resubmission deadline has passed. The bid is now marked as lost.',
                            'seller',
                            'error',
                            bid.seller._id
                        );
                    }
                } catch (error) {
                    console.error(`❌ Error handling expired defected bid ${bid._id}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Expired defected bids error:', error);
        }
    }

    async handleProjectExpiredResubmissions(results, now) {
        try {
            const projectsWithExpiredResubmissions = await Project.find({
                'round1Selections.top3.status': 'defected',
                'round1Selections.top3.resubmissionDeadline': { $lte: now }
            }).populate('customer');

            for (const project of projectsWithExpiredResubmissions) {
                try {
                    // Use project method to handle expired resubmissions
                    await project.handleExpiredResubmissions();
                    
                    // Check if any promotions happened
                    const updatedProject = await Project.findById(project._id);
                    const promotedBids = updatedProject.round1Selections.top3.filter(
                        s => s.status === 'selected' && 
                        !project.round1Selections.top3.some(os => os.bid.toString() === s.bid.toString())
                    );
                    
                    if (promotedBids.length > 0) {
                        results.waitingPromoted++;
                        console.log(`⬆️ Promoted ${promotedBids.length} bids from waiting queue for project: ${project.title}`);
                        
                        // Notify promoted sellers
                        for (const selection of promotedBids) {
                            await this.createNotice(
                                `Promoted to Top 3 - ${project.title}`,
                                'Congratulations! You have been promoted from waiting queue to top 3. Customer will now review your bid.',
                                'seller',
                                'success',
                                selection.seller
                            );
                        }
                    }
                } catch (error) {
                    console.error(`❌ Error handling expired resubmissions for ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Project expired resubmissions error:', error);
        }
    }



    
    // ==================== ROUND 2 COMPLETION ====================
    // async processRound2Completion(results, now) {
    //     try {
    //         const round2Projects = await Project.find({
    //             'biddingRounds.currentRound': 2,
    //             'biddingRounds.round2.status': 'active',
    //             'biddingRounds.round2.endDate': { $lte: now },
    //             'biddingRounds.round2.winnerSelected': false
    //         }).populate('customer');

    //         console.log(`🏆 Processing ${round2Projects.length} Round 2 projects for winner selection`);

    //         for (const project of round2Projects) {
    //             try {
    //                 console.log(`🔄 Auto-completing Round 2 for: ${project.title}`);
                    
    //                 // Use project method to complete Round 2 and select lowest bidder as winner
    //                 await project.completeRound2();
                    
    //                 console.log(`✅ Round 2 completed: ${project.title}`);
    //                 results.round2Completed++;

    //                 // Get the winning bid
    //                 const winningBid = await Bid.findById(project.finalWinner.bid).populate('seller');
                    
    //                 if (winningBid) {
    //                     // Notify winner
    //                     await this.createNotice(
    //                         `You Won! - ${project.title}`,
    //                         `Congratulations! Your bid has been selected as the winner for "${project.title}". Contract process will start soon.`,
    //                         'seller',
    //                         'success',
    //                         winningBid.seller._id
    //                     );

    //                     // Notify customer
    //                     await this.createNotice(
    //                         `Winner Selected - ${project.title}`,
    //                         `A winner has been automatically selected for your project. The lowest bidder in Round 2 has won.`,
    //                         'customer',
    //                         'success',
    //                         project.customer._id
    //                     );

    //                     // Notify other bidders (losers)
    //                     const losingBids = await Bid.find({
    //                         project: project._id,
    //                         round: 2,
    //                         selectionStatus: 'lost'
    //                     }).populate('seller');

    //                     for (const bid of losingBids) {
    //                         await this.createNotice(
    //                             `Bid Result - ${project.title}`,
    //                             `The project "${project.title}" has been awarded to another bidder. Thank you for your participation.`,
    //                             'seller',
    //                             'info',
    //                             bid.seller._id
    //                         );
    //                     }
    //                 }

    //             } catch (error) {
    //                 console.error(`❌ Error auto-completing Round 2 for ${project.title}:`, error.message);
    //                 results.validationErrors++;
    //             }
    //         }
    //     } catch (error) {
    //         console.error('❌ Round 2 completion error:', error);
    //     }
    // }
    // ==================== ROUND 2 COMPLETION ====================
async processRound2Completion(results, now) {
    try {
        const round2Projects = await Project.find({
            'biddingRounds.currentRound': 2,
            'biddingRounds.round2.status': 'active',
            'biddingRounds.round2.endDate': { $lte: now },
            'biddingRounds.round2.winnerSelected': false
        }).populate('customer');

        console.log(`🏆 Processing ${round2Projects.length} Round 2 projects for winner selection`);

        for (const project of round2Projects) {
            try {
                console.log(`🔄 Auto-completing Round 2 for: ${project.title}`);
                
                // Use project method to complete Round 2 and select lowest bidder as winner
                await project.completeRound2();
                
                // Get updated project data
                const updatedProject = await Project.findById(project._id);
                
                console.log(`✅ Round 2 completed: ${project.title}, Status: ${updatedProject.status}`);
                results.round2Completed++;

                // Check if project was awarded and initialize contract
                if (updatedProject.status === 'awarded' && updatedProject.finalWinner && updatedProject.finalWinner.bid) {
                    const winningBid = await Bid.findById(updatedProject.finalWinner.bid).populate('seller');
                    
                    if (winningBid) {
                        console.log(`📝 Initializing contract for winning bid: ${winningBid._id}`);
                        
                        // Initialize contract for winner
                        await this.initializeContractForWinner(updatedProject, winningBid, results);

                        // Notify winner
                        await this.createNotice(
                            `You Won! - ${updatedProject.title}`,
                            `Congratulations! Your bid has been selected as the winner for "${updatedProject.title}". Contract process has started. Please wait for customer to upload their signed contract first.`,
                            'seller',
                            'success',
                            winningBid.seller._id
                        );

                        // Notify customer
                        await this.createNotice(
                            `Winner Selected - ${updatedProject.title}`,
                            `A winner has been automatically selected for your project. Please download the contract template, sign it, and upload the signed contract to proceed.`,
                            'customer',
                            'success',
                            updatedProject.customer._id
                        );

                        console.log(`✅ Contract process started for project ${updatedProject._id}`);
                    }
                } else {
                    console.log(`❌ Project not awarded after Round 2: ${updatedProject.title}, Status: ${updatedProject.status}`);
                }

            } catch (error) {
                console.error(`❌ Error auto-completing Round 2 for ${project.title}:`, error.message);
                results.validationErrors++;
            }
        }
    } catch (error) {
        console.error('❌ Round 2 completion error:', error);
    }
}

    // ==================== EXPIRED SELECTION PHASE ====================
    async processExpiredSelectionPhase(results, now) {
        try {
            // Check for projects where selection deadline has passed but customer hasn't selected
            const expiredSelectionProjects = await Project.find({
                'biddingRounds.currentRound': 1.5,
                'biddingRounds.selectionDeadline': { $lte: now },
                'biddingRounds.round2.status': 'pending'
            }).populate('customer');

            console.log(`⏰ Processing ${expiredSelectionProjects.length} expired selection projects`);

            for (const project of expiredSelectionProjects) {
                try {
                    // Auto-select the current top 3 for Round 2
                    const currentTop3 = project.round1Selections.top3
                        .filter(selection => selection.status === 'selected' || selection.status === 'resubmitted')
                        .slice(0, 3);

                    if (currentTop3.length === 3) {
                        const selectedBidIds = currentTop3.map(selection => selection.bid);
                        await project.selectTop3ForRound2(selectedBidIds);

                        console.log(`✅ Auto-selected top 3 for Round 2: ${project.title}`);

                        // Notify customer
                        await this.createNotice(
                            `Round 2 Auto-Started - ${project.title}`,
                            'Round 2 has been automatically started with the current top 3 bids since no selection was made within 24 hours.',
                            'customer',
                            'info',
                            project.customer._id
                        );

                        // Notify selected sellers
                        for (const selection of currentTop3) {
                            const bid = await Bid.findById(selection.bid).populate('seller');
                            if (bid && bid.seller) {
                                await this.createNotice(
                                    `Selected for Round 2 - ${project.title}`,
                                    `Your bid has been automatically selected for Round 2. You can update your bid within the next 24 hours.`,
                                    'seller',
                                    'success',
                                    bid.seller._id
                                );
                            }
                        }

                    } else {
                        // Not enough valid bids - project fails
                        project.status = 'failed';
                        await project.save();
                        
                        console.log(`❌ Project failed - not enough valid bids: ${project.title}`);

                        await this.createNotice(
                            `Project Failed - ${project.title}`,
                            'Project failed because there were not enough valid bids for Round 2.',
                            'customer',
                            'error',
                            project.customer._id
                        );
                    }

                } catch (error) {
                    console.error(`❌ Error processing expired selection for ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Selection phase error:', error);
        }
    }

    // ==================== NOTIFICATION SYSTEM ====================
    async createNotice(title, content, audience, type, specificUser = null) {
        try {
            const notice = new Notice({
                title,
                content,
                targetAudience: audience,
                specificUser: specificUser,
                noticeType: type,
                isActive: true,
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                createdAt: new Date(),
                updatedAt: new Date()
            });
            await notice.save();
            console.log(`📢 Notice created: ${title} for ${audience}`);
        } catch (error) {
            console.error('❌ Notice creation error:', error);
        }
    }






















    // ==================== CONTRACT MANAGEMENT ====================
    async manageContracts(results, now) {
        try {
            const contracts = await Contract.find({
                status: { $in: ['pending-customer', 'pending-seller', 'pending-admin', 'correcting'] }
            }).populate('project').populate('seller').populate('customer').populate('bid');

            console.log(`📄 Managing ${contracts.length} contracts`);

            for (const contract of contracts) {
                try {
                    switch (contract.status) {
                        case 'pending-customer':
                            if (contract.customerSignedContract && contract.customerSignedContract.url) {
                                await contract.completeCustomerStep();
                                console.log(`✅ Contract moved to pending-seller: ${contract.project.title}`);
                            }
                            break;

                        case 'pending-seller':
                            if (contract.sellerSignedContract && contract.sellerSignedContract.url) {
                                await contract.completeSellerStep();
                                console.log(`✅ Contract moved to pending-admin: ${contract.project.title}`);
                            }
                            break;

                        case 'correcting':
                            await this.handleContractCorrection(contract, results, now);
                            break;

                        case 'pending-admin':
                            // Wait for manual admin approval
                            console.log(`⏳ Contract waiting admin approval: ${contract.project.title}`);
                            break;
                    }
                } catch (error) {
                    console.error(`❌ Error managing contract ${contract._id}:`, error.message);
                    results.validationErrors++;
                }
            }

            // Handle expired corrections
            await this.handleExpiredCorrections(results, now);

        } catch (error) {
            console.error('❌ Contract management error:', error);
        }
    }

    async handleContractCorrection(contract, results, now) {
        try {
            if (contract.isRejectionExpired && contract.isRejectionExpired()) {
                await this.cancelExpiredContract(contract, results);
            }
        } catch (error) {
            console.error(`❌ Contract correction error for ${contract._id}:`, error.message);
            results.validationErrors++;
        }
    }

    async handleExpiredCorrections(results, now) {
        try {
            const expiredContracts = await Contract.find({
                status: 'correcting',
                'currentRejection.deadline': { $lte: now }
            }).populate('project').populate('customer').populate('seller');

            for (const contract of expiredContracts) {
                await this.cancelExpiredContract(contract, results);
            }
        } catch (error) {
            console.error('❌ Expired corrections error:', error);
        }
    }

    async cancelExpiredContract(contract, results) {
        try {
            contract.status = 'rejected';
            contract.currentRejection = null;
            await contract.save();

            // Mark bid as cancelled
            await Bid.findByIdAndUpdate(contract.bid._id, {
                status: 'cancelled',
                selectionStatus: 'lost'
            });

            // Reset project status
            await Project.findByIdAndUpdate(contract.project._id, {
                selectedBid: null,
                status: 'failed'
            });

            // Notify parties
            await this.createNotice(
                `Contract Cancelled - ${contract.project.title}`,
                'Contract cancelled due to missed correction deadline.',
                'customer',
                'error',
                contract.customer._id
            );

            await this.createNotice(
                `Contract Cancelled - ${contract.project.title}`,
                'Contract cancelled due to missed correction deadline.',
                'seller',
                'error',
                contract.seller._id
            );

            console.log(`❌ Contract cancelled: ${contract._id}`);
            results.contractsCancelled++;

        } catch (error) {
            console.error(`❌ Error cancelling contract ${contract._id}:`, error.message);
            results.validationErrors++;
        }
    }

    // ==================== CONTRACT INITIALIZATION ====================
    async initializeContractForWinner(project, winningBid, results) {
        try {
            console.log('📝 Initializing contract for winning bid...');
            
            // Check if contract already exists
            const existingContract = await Contract.findOne({ bid: winningBid._id });
            if (existingContract) {
                console.log('⏭️ Contract already exists');
                return existingContract;
            }

            // Get customer and seller details
            const customer = await User.findById(project.customer);
            const seller = await User.findById(winningBid.seller);

            if (!customer || !seller) {
                throw new Error('Customer or seller not found');
            }

            console.log('🔄 Generating contract templates...');
            
            // Generate contract templates
            const customerTemplate = await PDFGenerator.generateContract('customer', winningBid, project, customer, seller);
            const sellerTemplate = await PDFGenerator.generateContract('seller', winningBid, project, customer, seller);

            // Create contract record
            const contract = new Contract({
                bid: winningBid._id,
                project: project._id,
                customer: project.customer,
                seller: winningBid.seller._id,
                contractValue: winningBid.round2Bid?.amount || winningBid.amount,
                status: 'pending-customer',
                currentStep: 1,
                autoGenerated: true,
                
                // Store templates
                customerTemplate: {
                    public_id: customerTemplate.public_id,
                    url: customerTemplate.secure_url,
                    filename: `customer_contract_${winningBid._id}.pdf`,
                    bytes: customerTemplate.bytes,
                    generatedAt: new Date()
                },
                sellerTemplate: {
                    public_id: sellerTemplate.public_id,
                    url: sellerTemplate.secure_url,
                    filename: `seller_contract_${winningBid._id}.pdf`,
                    bytes: sellerTemplate.bytes,
                    generatedAt: new Date()
                },
                
                // Contract terms
                terms: new Map([
                    ['projectTitle', project.title],
                    ['projectDescription', project.description],
                    ['contractValue', (winningBid.round2Bid?.amount || winningBid.amount).toString()],
                    ['startDate', project.timeline.startDate.toISOString()],
                    ['endDate', project.timeline.endDate.toISOString()],
                    ['category', project.category],
                    ['customerName', customer.name],
                    ['sellerName', seller.companyName || seller.name],
                    ['customerEmail', customer.email],
                    ['sellerEmail', seller.email]
                ]),
                
                createdAt: new Date(),
                updatedAt: new Date()
            });

            await contract.save();
            console.log(`✅ Contract initialized: ${contract._id}`);
            results.contractsCreated++;

            // Create notifications
            await this.createNotice(
                `Contract Ready - ${project.title}`,
                `Your bid won! Wait for customer to upload signed contract first.`,
                'seller',
                'success',
                winningBid.seller._id
            );

            await this.createNotice(
                `Contract Ready - ${project.title}`,
                `Winner selected! Download contract template, sign and upload to proceed.`,
                'customer',
                'info',
                project.customer._id
            );

            await this.createNotice(
                `New Contract - ${project.title}`,
                `New contract created and waiting for customer upload.`,
                'admin',
                'info'
            );

            return contract;

        } catch (error) {
            console.error('❌ Contract initialization error:', error);
            throw error;
        }
    }

    // ==================== PROJECT COMPLETION ====================
    async completeProjects(results, now) {
        try {
            const projectsToComplete = await Project.find({
                status: 'contract-approved',
                'timeline.endDate': { $lte: now }
            }).populate('customer').populate('selectedBid');

            console.log(`🏁 Found ${projectsToComplete.length} projects to complete`);

            for (const project of projectsToComplete) {
                try {
                    // Update project status
                    project.status = 'completed';
                    project.completedAt = now;
                    await project.save();

                    // Update winning bid
                    await Bid.findByIdAndUpdate(project.selectedBid, {
                        status: 'completed',
                        completedAt: now
                    });

                    // Generate completion certificate
                    await this.generateCompletionCertificate(project, results);

                    results.projectsCompleted++;
                    console.log(`✅ Project completed: ${project.title}`);

                    // Notify parties
                    await this.createNotice(
                        `Project Completed - ${project.title}`,
                        `Your project has been completed successfully! Download completion certificate.`,
                        'customer',
                        'success',
                        project.customer._id
                    );

                    const winningBid = await Bid.findById(project.selectedBid).populate('seller');
                    if (winningBid && winningBid.seller) {
                        await this.createNotice(
                            `Project Completed - ${project.title}`,
                            `Congratulations! Project completed successfully. Download your certificate.`,
                            'seller',
                            'success',
                            winningBid.seller._id
                        );
                    }

                } catch (error) {
                    console.error(`❌ Error completing ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Project completion error:', error);
        }
    }

    async generateCompletionCertificate(project, results) {
        try {
            const winningBid = await Bid.findById(project.selectedBid)
                .populate('seller')
                .populate('customer');
                
            const customer = await User.findById(project.customer);

            if (!winningBid || !customer) {
                throw new Error('Winning bid or customer not found');
            }

            // Generate certificate
            const certificate = await PDFGenerator.generateContract(
                'certificate', 
                winningBid, 
                project, 
                customer, 
                winningBid.seller
            );

            // Update bid with certificate
            winningBid.certificateGenerated = true;
            winningBid.certificateUrl = certificate.secure_url;
            winningBid.certificatePublicId = certificate.public_id;
            winningBid.certificateGeneratedAt = new Date();
            await winningBid.save();

            // Update contract if exists
            const contract = await Contract.findOne({ project: project._id });
            if (contract) {
                contract.finalContract = {
                    public_id: certificate.public_id,
                    url: certificate.secure_url,
                    filename: `completion_certificate_${project._id}.pdf`,
                    generatedAt: new Date()
                };
                await contract.save();
            }

            results.certificatesGenerated++;
            console.log(`📜 Certificate generated for: ${project.title}`);

        } catch (error) {
            console.error('❌ Certificate generation error:', error);
        }
    }

    // ==================== CLEANUP EXPIRED PROJECTS ====================
    async cleanupExpiredProjects(results, now) {
        try {
            const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            
            const expiredProjects = await Project.find({
                status: { $in: ['completed', 'failed', 'cancelled'] },
                updatedAt: { $lte: thirtyDaysAgo },
                isArchived: { $ne: true }
            });

            for (const project of expiredProjects) {
                try {
                    project.isArchived = true;
                    project.archivedAt = now;
                    await project.save();
                    
                    results.expiredProjects++;
                    console.log(`🗑️ Archived expired project: ${project.title}`);
                } catch (error) {
                    console.error(`❌ Error archiving ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
    }

    // ==================== NOTIFICATION SYSTEM ====================
    async createNotice(title, content, audience, type, specificUser = null) {
        try {
            const notice = new Notice({
                title,
                content,
                targetAudience: audience,
                specificUser: specificUser,
                noticeType: type,
                isActive: true,
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                createdAt: new Date(),
                updatedAt: new Date()
            });
            await notice.save();
            console.log(`📢 Notice created: ${title} for ${audience}`);
        } catch (error) {
            console.error('❌ Notice creation error:', error);
        }
    }

    // ==================== DEBUGGING METHOD ====================
    async debugRoundIssues() {
        console.log('🔍 DEBUGGING ROUND ISSUES');
        
        const projects = await Project.find({
            'biddingRounds.currentRound': { $in: [1, 1.5, 2] }
        }).select('title status biddingRounds round1Selections');
        
        projects.forEach(project => {
            console.log(`📋 Project: ${project.title}`);
            console.log(`   Status: ${project.status}`);
            console.log(`   Current Round: ${project.biddingRounds.currentRound}`);
            console.log(`   Round1 Status: ${project.biddingRounds.round1.status}`);
            console.log(`   Round2 Status: ${project.biddingRounds.round2.status}`);
            console.log(`   Top 3 Count: ${project.round1Selections?.top3?.length || 0}`);
            console.log(`   Waiting Queue: ${project.round1Selections?.waitingQueue?.length || 0}`);
            console.log('---');
        });
    }

    // ==================== MANUAL TRIGGER FOR TESTING ====================
    async manualUpdate(projectId = null) {
        try {
            console.log('🔄 === MANUAL AUTOMATION TRIGGERED ===');
            
            // Debug current state
            await this.debugRoundIssues();
            
            if (projectId) {
                console.log(`🔧 Processing specific project: ${projectId}`);
                const project = await Project.findById(projectId);
                if (project) {
                    // Force bid end date to past for immediate testing
                    await Project.findByIdAndUpdate(
                        projectId,
                        {
                            'bidSettings.bidEndDate': new Date(Date.now() - 24 * 60 * 60 * 1000),
                            'biddingRounds.round1.endDate': new Date(Date.now() - 24 * 60 * 60 * 1000)
                        },
                        { runValidators: false }
                    );
                    console.log(`🔧 Set bid end date to past for: ${project.title}`);
                }
            }
            
            const result = await this.updateAllProjectStatuses();
            return {
                success: true,
                message: 'Manual automation completed',
                data: result
            };
        } catch (error) {
            console.error('❌ Manual automation error:', error);
            return {
                success: false,
                message: 'Automation failed',
                error: error.message
            };
        }
    }

    // ==================== START AUTOMATION SERVICE ====================
    start() {
        if (this.isRunning) {
            console.log('⚠️ Status automation service already running');
            return;
        }
        
        // Run every 2 minutes for testing
        cron.schedule('*/2 * * * *', async () => {
            try {
                if (this.isRunning) {
                    await this.updateAllProjectStatuses();
                }
            } catch (error) {
                console.error('❌ Scheduled automation error:', error);
            }
        });

        console.log('🚀 STATUS AUTOMATION SERVICE STARTED (runs every 2 minutes)');
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
        console.log('🛑 Status automation service stopped');
    }
}

module.exports = new StatusAutomationService();