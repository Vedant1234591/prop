const cron = require('node-cron');
const Project = require('../models/Project');
const Bid = require('../models/Bid');
const Contract = require('../models/Contract');
const User = require('../models/User');
const Notice = require('../models/Notice');
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
                adminApproved: 0
            };

            // 🔄 PHASE 1: Project Verification & Auto-Submission
            await this.handleProjectVerificationStatus(results, now);
            
            // 🔄 PHASE 2: Activate Admin-Approved Projects
            await this.activateApprovedProjects(results, now);
            
            // 🔄 PHASE 3: Bidding Rounds Management (AUTOMATIC SELECTION)
            await this.manageBiddingRounds(results, now);
            
            // 🔄 PHASE 4: Contract Management
            await this.manageContracts(results, now);
            
            // 🔄 PHASE 5: Project Completion
            await this.completeProjects(results, now);
            
            // 🔄 PHASE 6: Cleanup Expired Projects
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
            if (!now || !(now instanceof Date)) {
                console.error('❌ Invalid date in verification status');
                return;
            }

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
                    if (!project.contact?.phone) {
                        console.log(`⏭️ Skipping ${project.title} - missing phone`);
                        continue;
                    }

                    // Check all required fields
                    const requiredFields = [
                        'title', 'description', 'requirements', 
                        'location.address', 'location.city', 'location.state', 'location.zipCode'
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
                        'Your project has been approved and is now active for bidding in Round 1.',
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
            
            // 🎯 PHASE 4: Handle Expired Selections
            await this.handleExpiredSelections(results, now);

        } catch (error) {
            console.error('❌ Bidding rounds management error:', error);
        }
    }

    // 🎯 ROUND 1 COMPLETION - AUTO SELECT TOP 10
    async processRound1Completion(results, now) {
        try {
            const round1Projects = await Project.find({
                'biddingRounds.currentRound': 1,
                'biddingRounds.round1.status': 'active',
                'biddingRounds.round1.endDate': { $lte: now }
            }).populate('customer');

            console.log(`📊 Processing ${round1Projects.length} Round 1 projects`);

            for (const project of round1Projects) {
                try {
                    console.log(`🔄 Completing Round 1 for: ${project.title}`);
                    
                    // 🎯 AUTOMATICALLY SELECT TOP 10 HIGHEST BIDS
                    const topBids = await Bid.find({
                        project: project._id,
                        round: 1,
                        status: 'submitted'
                    })
                    .sort({ amount: -1 }) // Highest amount first
                    .limit(10)
                    .select('_id amount seller');

                    console.log(`🎯 Found ${topBids.length} bids for ${project.title}`);

                    if (topBids.length === 0) {
                        console.log(`❌ No bids - marking project as failed: ${project.title}`);
                        await project.markAsFailed();
                        results.projectsFailed++;
                        continue;
                    }

                    // ✅ FIXED: Use project method to complete round 1
                    await project.completeRound1(topBids.map(bid => bid._id));

                    // 🏷️ Mark top 10 bids as selected
                    await Bid.updateMany(
                        { _id: { $in: topBids.map(bid => bid._id) } },
                        { 
                            selectionStatus: 'selected-round1',
                            status: 'selected'
                        }
                    );

                    // ❌ Mark other bids as lost
                    await Bid.updateMany(
                        {
                            project: project._id,
                            round: 1,
                            _id: { $nin: topBids.map(bid => bid._id) },
                            status: 'submitted'
                        },
                        { 
                            selectionStatus: 'lost', 
                            status: 'lost' 
                        }
                    );

                    // 📢 Notify customer to select top 3
                    await this.createNotice(
                        `Round 1 Completed - ${project.title}`,
                        `Round 1 bidding completed! ${topBids.length} bids were automatically selected. Please select exactly 3 bids to proceed to Round 2 within 24 hours.`,
                        'customer',
                        'info',
                        project.customer._id
                    );

                    // 📢 Notify selected sellers
                    for (const bid of topBids) {
                        await this.createNotice(
                            `Selected for Top 10 - ${project.title}`,
                            `Congratulations! Your bid made it to the top 10. Wait for customer to select top 3 for Round 2.`,
                            'seller',
                            'success',
                            bid.seller
                        );
                    }

                    console.log(`✅ Round 1 completed: ${project.title} - Selected ${topBids.length} bids`);
                    results.round1Completed++;

                } catch (error) {
                    console.error(`❌ Error in Round 1 for ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Round 1 processing error:', error);
        }
    }

    // 🎯 SELECTION PHASE - CUSTOMER SELECTS TOP 3 FROM TOP 10
    async processSelectionPhase(results, now) {
        try {
            // Check for projects where customer has selected top 3 bids
            const selectionProjects = await Project.find({
                'biddingRounds.currentRound': 1.5,
                'biddingRounds.round2.selectedBids': { $exists: true, $ne: [] }
            }).populate('biddingRounds.round2.selectedBids');

            console.log(`🎯 Processing ${selectionProjects.length} projects with customer selection`);

            for (const project of selectionProjects) {
                try {
                    const selectedBidIds = project.biddingRounds.round2.selectedBids.map(bid => bid._id);
                    
                    if (selectedBidIds.length !== 3) {
                        console.log(`⏭️ Invalid selection count for ${project.title}: ${selectedBidIds.length}`);
                        continue;
                    }

                    // 🚀 Start Round 2 with selected 3 bids
                    await project.selectTop3(selectedBidIds);

                    // 🏷️ Mark selected bids for Round 2
                    await Bid.updateMany(
                        { _id: { $in: selectedBidIds } },
                        { 
                            round: 2,
                            selectionStatus: 'selected-round2',
                            status: 'selected'
                        }
                    );

                    // 📢 Notify selected sellers
                    await Bid.find({ _id: { $in: selectedBidIds } }).then(bids => {
                        bids.forEach(async (bid) => {
                            await this.createNotice(
                                `Round 2 Started - ${project.title}`,
                                `Congratulations! Your bid was selected for Round 2. Round 2 bidding ends in 24 hours.`,
                                'seller',
                                'success',
                                bid.seller
                            );
                        });
                    });

                    // 📢 Notify customer
                    await this.createNotice(
                        `Round 2 Started - ${project.title}`,
                        `Round 2 bidding has started with your 3 selected bids. It will end in 24 hours.`,
                        'customer',
                        'info',
                        project.customer._id
                    );

                    console.log(`✅ Round 2 started: ${project.title} with 3 selected bids`);

                } catch (error) {
                    console.error(`❌ Error starting Round 2 for ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Selection phase error:', error);
        }
    }

    // 🎯 ROUND 2 COMPLETION - AUTO SELECT WINNER FROM TOP 3
 // Add this to your statusAutomation service
async processRound2Completion(results, now) {
  try {
    const round2Projects = await Project.find({
      'biddingRounds.currentRound': 2,
      'biddingRounds.round2.status': 'active',
      'biddingRounds.round2.endDate': { $lte: now }
    }).populate('customer');

    console.log(`🏆 Processing ${round2Projects.length} Round 2 projects for winner selection`);

    for (const project of round2Projects) {
      try {
        console.log(`🔄 Auto-completing Round 2 for: ${project.title}`);
        
        // Import seller controller to use autoCompleteRound2
        const sellerController = require('../controllers/sellerController');
        await sellerController.autoCompleteRound2(project._id);
        
        console.log(`✅ Round 2 completed and winner selected: ${project.title}`);
        results.round2Completed++;
        results.winnersSelected++;

      } catch (error) {
        console.error(`❌ Error auto-completing Round 2 for ${project.title}:`, error.message);
        results.validationErrors++;
      }
    }
  } catch (error) {
    console.error('❌ Round 2 completion error:', error);
  }
}
    // 🎯 HANDLE EXPIRED SELECTIONS
    async handleExpiredSelections(results, now) {
        try {
            const expiredSelections = await Project.find({
                'biddingRounds.currentRound': 1.5,
                selectionDeadline: { $lte: now }
            }).populate('customer');

            console.log(`⏰ Processing ${expiredSelections.length} expired selections`);

            for (const project of expiredSelections) {
                try {
                    // ❌ Mark project as failed due to no selection
                    await project.markAsFailed();

                    // Mark all top 10 bids as lost
                    await Bid.updateMany(
                        {
                            project: project._id,
                            selectionStatus: 'selected-round1'
                        },
                        { selectionStatus: 'lost', status: 'lost' }
                    );

                    // 📢 Notify customer
                    await this.createNotice(
                        `Project Failed - ${project.title}`,
                        'Project failed because no selection was made within 24 hours after Round 1.',
                        'customer',
                        'error',
                        project.customer._id
                    );

                    console.log(`❌ Project failed - no selection: ${project.title}`);
                    results.projectsFailed++;

                } catch (error) {
                    console.error(`❌ Error handling expired selection for ${project.title}:`, error.message);
                    results.validationErrors++;
                }
            }
        } catch (error) {
            console.error('❌ Expired selections error:', error);
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
// Add the autoCompleteRound2 function to statusAutomation
async autoCompleteRound2  (projectId) {
  try {
    const project = await Project.findById(projectId);
    if (!project || project.biddingRounds.currentRound !== 2) {
      return;
    }

    console.log(`🕒 Processing expired Round 2 for project: ${projectId}`);

    // Get all Round 2 bids that were actually submitted (not just selected)
    const round2Bids = await Bid.find({
      project: projectId,
      round: 2,
      selectionStatus: 'selected-round2'
    }).sort({ amount: 1 }); // Sort by lowest amount first

    console.log(`📨 Found ${round2Bids.length} Round 2 bids for project ${projectId}`);

    if (round2Bids.length > 0) {
      // Auto-select the lowest bid as winner
      const winningBid = round2Bids[0];
      await project.completeRound2(winningBid._id);
      await winningBid.markAsWon();

      // Mark other bids as lost
      await Bid.updateMany(
        {
          project: projectId,
          round: 2,
          _id: { $ne: winningBid._id },
          selectionStatus: 'selected-round2'
        },
        { selectionStatus: 'lost', status: 'lost' }
      );

      console.log(`🏆 Round 2 automatically completed for project ${projectId}. Winner: ${winningBid._id}`);
      
      // Initialize contract for winner
      await exports.initializeContractForWinner(project, winningBid, {});
    } else {
      // No bids submitted in Round 2 - project fails
      await project.markAsFailed();
      console.log(`❌ Project ${projectId} failed - no bids submitted in Round 2`);
    }
  } catch (error) {
    console.error("Auto complete Round 2 error:", error);
  }
};
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
                contractValue: winningBid.amount,
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
                    ['contractValue', winningBid.amount.toString()],
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
        }).select('title status biddingRounds');
        
        projects.forEach(project => {
            console.log(`📋 Project: ${project.title}`);
            console.log(`   Status: ${project.status}`);
            console.log(`   Current Round: ${project.biddingRounds.currentRound}`);
            console.log(`   Round1 Status: ${project.biddingRounds.round1.status}`);
            console.log(`   Round2 Status: ${project.biddingRounds.round2.status}`);
            console.log(`   Round1 End: ${project.biddingRounds.round1.endDate}`);
            console.log(`   Round2 End: ${project.biddingRounds.round2.endDate}`);
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
        
        // Run every 2 minutes for testing (change to appropriate schedule for production)
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