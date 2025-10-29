# ServiceNow Consultancy Portfolio

A modern, interactive portfolio website for ServiceNow and frontend development consulting services.

## Features

### Current Version (Frontend)
- ✨ **Modern Design**: Sleek one-page portfolio with glass-morphism effects
- 🌟 **Subtle Shimmer Background**: CSS-only sparkle animation
- 📱 **Fully Responsive**: Mobile-first design with Tailwind CSS
- 🎯 **Interactive Sections**: Hero, About, Services, Portfolio, Contact
- 🖼️ **Portfolio Showcase**: 6 project displays with modal lightboxes
- 🤖 **AI Chatbot Interface**: Interactive chat UI with placeholder responses
- ⚡ **Performance Optimized**: GPU-accelerated animations, lazy loading
- ♿ **Accessible**: Semantic HTML, ARIA labels, keyboard navigation

### Upcoming Backend Features
- 🧠 **AI-Powered Chatbot**: Anthropic Claude API integration
- 📅 **Meeting Scheduling**: Google Calendar integration
- 🔍 **Knowledge Base**: Vector database for intelligent responses
- 📊 **Lead Management**: Automated contact capture and CRM
- 🔗 **Real-time Chat**: WebSocket connections for instant responses

## Technology Stack

### Frontend
- **HTML5**: Semantic structure
- **CSS3**: Custom animations and Tailwind CSS
- **JavaScript**: Vanilla JS with modern ES6+ features
- **Design**: Glass-morphism, gradient effects, responsive layout

### Backend (In Development)
- **Runtime**: Node.js with Express.js
- **AI**: Anthropic Claude API with function calling
- **Database**: PostgreSQL + Redis + Pinecone (Vector DB)
- **Calendar**: Google Calendar API
- **Real-time**: WebSocket connections
- **Deployment**: Railway/Vercel

## Getting Started

### Frontend Only (Current)
1. Clone the repository:
   ```bash
   git clone https://github.com/pflantzdog27/consulting-portfolio.git
   cd consulting-portfolio
   ```

2. Open `index.html` in your browser or serve with a local server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   ```

3. Add your own headshot image as `headshot.jpg` in the root directory

### Backend Setup (Coming Soon)
Full backend integration with AI chatbot, scheduling, and database features.

## Customization

### Content Updates
- **About Section**: Update the professional bio in the About section
- **Services**: Modify the 4 service cards with your specific offerings
- **Portfolio**: Replace the 6 placeholder projects with your actual work
- **Contact Information**: Update email addresses and social links

### Styling
- **Colors**: Modify CSS custom properties in the `<style>` section
- **Animations**: Adjust timing and effects in the CSS animations
- **Layout**: Responsive breakpoints can be modified via Tailwind classes

## Project Structure

```
consulting-portfolio/
├── index.html          # Main portfolio page
├── headshot.jpg        # Professional headshot image
├── README.md          # Project documentation
├── .gitignore         # Git ignore file
└── backend/           # Backend services (coming soon)
    ├── services/      # AI, calendar, database services
    ├── routes/        # API endpoints
    ├── models/        # Database models
    └── utils/         # Helper functions
```

## Features Breakdown

### Hero Section
- Gradient text effects with animation
- Dual CTA buttons (View Work + Schedule Meeting)
- Floating geometric shapes
- Particle effects
- Scroll indicator

### About Section
- Professional headshot with parallax effect
- Compelling business copy
- Animated tech stack badges
- Fortune 100 experience highlighting

### Services Section
- 4 service cards with hover effects
- 3D transforms and glow shadows
- Stagger animations on scroll
- Professional service descriptions

### Portfolio Section
- 6 project showcases in responsive grid
- Hover overlays with tech stack
- Modal lightboxes for detailed views
- Smooth animations and transitions

### Contact Section (AI Chatbot)
- Professional chat interface
- Quick action buttons
- Typing indicators
- Message bubbles with avatars
- Glass-morphism design

## Performance Optimizations

- **GPU Acceleration**: transform3d() for smooth animations
- **Lazy Loading**: Images load only when needed
- **Efficient Animations**: CSS-only where possible
- **Responsive Images**: Proper sizing and format optimization
- **Minimal Dependencies**: Pure CSS/JS for fast loading

## Browser Support

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ⚠️ IE11 (limited support)

## Contributing

This is a personal portfolio project, but feedback and suggestions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this as inspiration for your own portfolio!

## Contact

For questions about this portfolio or to discuss ServiceNow consulting services:

- 📧 Email: hello@devstudio.com
- 💼 LinkedIn: [Your LinkedIn]
- 🐙 GitHub: [Your GitHub]

---

**Built with ❤️ for the ServiceNow community**