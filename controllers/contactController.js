const Contact = require('../models/Contact');


// Get all contact submissions for admin
exports.getContactSubmissions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status || 'all';
    const skip = (page - 1) * limit;

    // Build filter
    let filter = {};
    if (status !== 'all') {
      filter.status = status;
    }

    // Get submissions with pagination
    const submissions = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Contact.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);

    res.render('admin/contact-submissions', {
      submissions,
      currentPage: page,
      totalPages,
      total,
      limit,
      status,
      currentRoute: '/admin/contact-submissions'
    });

  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    res.status(500).render('error', {
      message: 'Error loading contact submissions'
    });
  }
};

// Get single contact submission for admin
exports.getContactSubmission = async (req, res) => {
  try {
    const submission = await Contact.findById(req.params.id);

    if (!submission) {
      req.flash('error', 'Contact submission not found');
      return res.redirect('/admin/contact-submissions');
    }

    res.render('admin/contact-detail', {
      submission,
      currentRoute: '/admin/contact-submissions'
    });

  } catch (error) {
    console.error('Error fetching contact submission:', error);
    req.flash('error', 'Error loading contact submission');
    res.redirect('/admin/contact-submissions');
  }
};

// Update contact submission status (admin)
exports.updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, responded } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (responded !== undefined) updateData.responded = responded === 'true';

    await Contact.findByIdAndUpdate(id, updateData);

    req.flash('success', 'Contact submission updated successfully');
    res.redirect(`/admin/contact-submissions/${id}`);

  } catch (error) {
    console.error('Error updating contact submission:', error);
    req.flash('error', 'Error updating contact submission');
    res.redirect(`/admin/contact-submissions/${req.params.id}`);
  }
};

// Delete contact submission (admin)
exports.deleteContactSubmission = async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    
    req.flash('success', 'Contact submission deleted successfully');
    res.redirect('/admin/contact-submissions');

  } catch (error) {
    console.error('Error deleting contact submission:', error);
    req.flash('error', 'Error deleting contact submission');
    res.redirect('/admin/contact-submissions');
  }
};

// Get contact statistics for admin dashboard
exports.getContactStats = async (req, res) => {
  try {
    const total = await Contact.countDocuments();
    const newCount = await Contact.countDocuments({ status: 'new' });
    const inProgressCount = await Contact.countDocuments({ status: 'in_progress' });
    const resolvedCount = await Contact.countDocuments({ status: 'resolved' });

    res.json({
      total,
      new: newCount,
      inProgress: inProgressCount,
      resolved: resolvedCount
    });

  } catch (error) {
    console.error('Error fetching contact stats:', error);
    res.status(500).json({ error: 'Error fetching statistics' });
  }
};