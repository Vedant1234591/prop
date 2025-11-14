const Blog = require('../models/Blog');

// Function to generate slug from title
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);
};

// Get latest blogs for homepage (limit to 3)
exports.getHomepageBlogs = async () => {
  try {
    const blogs = await Blog.find({ status: 'published' })
      .sort({ date: -1 })
      .limit(3);
    
    const formattedBlogs = blogs.map(blog => ({
      ...blog._doc,
      formattedDate: blog.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }));

    return formattedBlogs;
  } catch (error) {
    console.error('Error fetching homepage blogs:', error);
    return [];
  }
};

// Get all blogs for blog page
exports.getAllBlogs = async () => {
  try {
    const blogs = await Blog.find({ status: 'published' }).sort({ date: -1 });
    
    const formattedBlogs = blogs.map(blog => ({
      ...blog._doc,
      formattedDate: blog.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    }));

    return formattedBlogs;
  } catch (error) {
    console.error('Error fetching all blogs:', error);
    return [];
  }
};

// Get single blog post by slug
exports.getBlogBySlug = async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug });
    
    if (!blog) {
      return res.status(404).render('error', {
        message: 'Blog post not found'
      });
    }

    const formattedBlog = {
      ...blog._doc,
      formattedDate: blog.date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };

    res.render('blog-single', {
      blog: formattedBlog,
      currentRoute: `/blog/${blog.slug}`
    });

  } catch (error) {
    console.error('Error in getBlogBySlug:', error);
    res.status(500).render('error', {
      message: 'Server error while fetching blog post'
    });
  }
};

// Show create blog form
exports.showCreateForm = (req, res) => {
  try {
    res.render('admin/create-blog', {
      currentRoute: '/admin/create-blog'
    });
  } catch (error) {
    console.error('Error in showCreateForm:', error);
    res.status(500).render('error', {
      message: 'Error loading create blog form'
    });
  }
};

// Create new blog post - FIXED VERSION
exports.createBlog = async (req, res) => {
  try {
    const { title, summary, content, img, author } = req.body;

    // Validate required fields
    if (!title || !summary || !content || !img) {
      return res.status(400).render('admin/create-blog', {
        error: 'All fields are required',
        currentRoute: '/admin/create-blog',
        formData: req.body // Preserve form data
      });
    }

    // Generate unique slug
    let slug = generateSlug(title);
    let existingBlog = await Blog.findOne({ slug });
    let counter = 1;
    
    while (existingBlog) {
      slug = `${generateSlug(title)}-${counter}`;
      existingBlog = await Blog.findOne({ slug });
      counter++;
      
      // Prevent infinite loop
      if (counter > 100) {
        throw new Error('Could not generate unique slug');
      }
    }

    // Create and save blog
    const blog = new Blog({
      title: title.trim(),
      summary: summary.trim(),
      content: content.trim(),
      img: img.trim(),
      author: (author || 'Admin').trim(),
      slug: slug
    });

    await blog.save();
    
    console.log('✅ Blog created successfully:', blog.title);
    res.redirect('/');

  } catch (error) {
    console.error('❌ Error creating blog:', error);
    
    let errorMessage = 'Error creating blog post. Please try again.';
    
    if (error.code === 11000) {
      errorMessage = 'A blog with this title already exists. Please choose a different title.';
    } else if (error.name === 'ValidationError') {
      errorMessage = 'Please fill all required fields correctly.';
    }

    res.status(500).render('admin/create-blog', {
      error: errorMessage,
      currentRoute: '/admin/create-blog',
      formData: req.body // Preserve form data on error
    });
  }
};

// Show all blogs (admin)
exports.showAdminBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ date: -1 });
    res.render('admin/blogs', {
      blogs,
      currentRoute: '/admin/blogs'
    });
  } catch (error) {
    console.error('Error in showAdminBlogs:', error);
    res.status(500).render('error', {
      message: 'Error fetching blogs'
    });
  }
};