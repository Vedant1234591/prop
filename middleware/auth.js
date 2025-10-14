
const protect = (req, res, next) => {
    console.log('=== AUTH CHECK ===');
    console.log('Session userId:', req.session.userId);
    console.log('Session user:', req.session.user);
    
    if (req.session && req.session.userId) {
        // Make user available as req.user for consistency
        req.user = req.session.user;
        console.log('User is authenticated:', req.user);
        return next();
    }
    
    console.log('User NOT authenticated - redirecting to login');
    req.flash('error', 'Please log in to access this page');
    res.redirect('/auth/login');
};

const requireRole = (role) => {
    return (req, res, next) => {
        console.log('=== ROLE CHECK ===');
        console.log('Required role:', role);
        console.log('User role:', req.session.userRole);
        
        if (req.session && req.session.userId && req.session.userRole === role) {
            // Make user available as req.user for consistency
            req.user = req.session.user;
            console.log('Role access granted');
            return next();
        }
        
        console.log('Role access denied');
        req.flash('error', `Access denied. ${role} access required.`);
        res.redirect('/auth/login');
    };
};

// Keep the old functions for compatibility
const isAuthenticated = protect;
const isCustomer = requireRole('customer');
const isSeller = requireRole('seller');
// middleware/auth.js





// middleware/auth.js
const ensureAuthenticated = (req, res, next) => {
    console.log('=== AUTH CHECK ===');
    console.log('Session userId:', req.session.userId);
    console.log('Session user:', req.session.user);
    
    if (req.session && req.session.userId) {
        // Make user available as req.user for consistency
        req.user = req.session.user;
        console.log('User is authenticated');
        return next();
    }
    
    console.log('User NOT authenticated - redirecting to login');
    req.flash('error', 'Please log in to access this page');
    res.redirect('/auth/login');
};

const ensureSeller = (req, res, next) => {
    console.log('=== SELLER ROLE CHECK ===');
    console.log('User role:', req.session.user?.role);
    
    if (req.session && req.session.user && req.session.user.role === 'seller') {
        req.user = req.session.user;
        console.log('Seller access granted');
        return next();
    }
    
    console.log('Seller access denied');
    req.flash('error', 'Seller access required');
    res.redirect('/auth/login');
};

const ensureCustomer = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'customer') {
        return next();
    }
    req.flash('error', 'Customer access required');
    res.redirect('/auth/login');
};

const ensureAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    req.flash('error', 'Admin access required');
    res.redirect('/auth/login');
};

// Alternative naming for compatibility







module.exports = {
    ensureAuthenticated,
    ensureSeller,
    ensureCustomer,
    ensureAdmin,

    protect,
    requireRole,
    isAuthenticated,
    isCustomer,
    isSeller
};