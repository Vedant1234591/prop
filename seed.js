require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/database');

// Models
const User = require('./models/User');
// scripts/resetAdminPassword.js


const resetAdminPassword = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name');
        
        const adminEmail = 'admin@example.com';
        const newPassword = 'admin12345'; // Use a stronger password
        
        console.log('=== ADMIN PASSWORD RESET START ===');
        
        // Find the admin user
        let adminUser = await User.findOne({ email: adminEmail, role: 'admin' });
        
        if (!adminUser) {
            console.log('⚠️ Admin user not found. Creating new admin...');
            
            // Create new admin - let the User model handle the hashing
            adminUser = new User({
                name: 'System Administrator',
                email: adminEmail,
                password: newPassword, // Will be hashed by pre-save hook
                role: 'admin',
                phone: '+1234567890',
                isActive: true
            });
        } else {
            console.log('✅ Admin user found, updating password...');
            // Update password - let the User model handle the hashing
            adminUser.password = newPassword;
        }
        
        // Save the user - this will trigger the pre-save hook to hash the password
        await adminUser.save();
        
        console.log('✅ Admin password reset successfully!');
        console.log('Email:', adminEmail);
        console.log('New Password:', newPassword);
        console.log('Stored Hash Prefix:', adminUser.password.substring(0, 4));
        
        // Verify the password works
        const isMatch = await adminUser.comparePassword(newPassword);
        console.log('✅ Password verification test:', isMatch);
        
        if (!isMatch) {
            console.log('❌ CRITICAL: Password verification failed!');
        }
        
        console.log('=== ADMIN PASSWORD RESET END ===');
        
    } catch (error) {
        console.error('❌ Error resetting admin password:', error);
    } finally {
        await mongoose.connection.close();
    }
};

resetAdminPassword();