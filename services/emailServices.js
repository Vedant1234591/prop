const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransporter({
            // Configure with your email service
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    }

    async sendBidNotification(customerEmail, projectTitle, bidderName, amount) {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: customerEmail,
            subject: `New Bid Received for ${projectTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4F46E5;">New Bid Received!</h2>
                    <p>Hello,</p>
                    <p>You have received a new bid for your project <strong>${projectTitle}</strong>.</p>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Bidder:</strong> ${bidderName}</p>
                        <p><strong>Bid Amount:</strong> $${amount}</p>
                    </div>
                    <p>Login to your Propload account to review the bid and take action.</p>
                    <a href="${process.env.APP_URL}/customer/my-projects" 
                       style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        View Project
                    </a>
                    <p style="margin-top: 30px; color: #666; font-size: 12px;">
                        This is an automated message from Propload.
                    </p>
                </div>
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log('Bid notification email sent');
        } catch (error) {
            console.error('Error sending bid notification email:', error);
        }
    }

    async sendBidWonNotification(sellerEmail, projectTitle, customerName, amount) {
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: sellerEmail,
            subject: `Congratulations! You Won the Bid for ${projectTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #10B981;">Bid Won!</h2>
                    <p>Congratulations!</p>
                    <p>Your bid for <strong>${projectTitle}</strong> has been selected by ${customerName}.</p>
                    <div style="background: #f0fdf4; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>Project:</strong> ${projectTitle}</p>
                        <p><strong>Winning Amount:</strong> $${amount}</p>
                        <p><strong>Customer:</strong> ${customerName}</p>
                    </div>
                    <p>Please log in to your Propload account to proceed with the contract and next steps.</p>
                    <a href="${process.env.APP_URL}/seller/my-bids" 
                       style="background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        View My Bids
                    </a>
                </div>
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log('Bid won notification email sent');
        } catch (error) {
            console.error('Error sending bid won notification email:', error);
        }
    }

    async sendContractReadyNotification(userEmail, projectTitle, userType) {
        const action = userType === 'customer' ? 'seller' : 'customer';
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: userEmail,
            subject: `Contract Ready for ${projectTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #F59E0B;">Contract Ready for Signing</h2>
                    <p>The ${action} has uploaded their signed contract for <strong>${projectTitle}</strong>.</p>
                    <p>Please log in to download the contract, sign it, and upload the signed copy to proceed.</p>
                    <a href="${process.env.APP_URL}/${userType}/my-${userType === 'customer' ? 'projects' : 'bids'}" 
                       style="background: #F59E0B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Review Contract
                    </a>
                </div>
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log('Contract ready notification email sent');
        } catch (error) {
            console.error('Error sending contract ready notification email:', error);
        }
    }

    async sendProjectCompletedNotification(customerEmail, sellerEmail, projectTitle, certificateUrl) {
        const emails = [customerEmail, sellerEmail];
        
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: emails.join(','),
            subject: `Project Completed: ${projectTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #10B981;">Project Successfully Completed!</h2>
                    <p>Congratulations! The project <strong>${projectTitle}</strong> has been successfully completed and verified.</p>
                    <p>A certificate of completion has been generated for your records.</p>
                    ${certificateUrl ? `
                    <a href="${certificateUrl}" 
                       style="background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0;">
                        Download Certificate
                    </a>
                    ` : ''}
                    <p style="margin-top: 30px; color: #666;">
                        Thank you for using Propload for your project needs.
                    </p>
                </div>
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log('Project completed notification email sent');
        } catch (error) {
            console.error('Error sending project completed notification email:', error);
        }
    }
}

module.exports = new EmailService();