# IP Location Tracker

Interactive 3D globe visualization for tracking IP addresses and their geographic locations.

## Features

- 🌍 Beautiful 3D globe visualization with interactive controls
- 📍 Support for multiple free IP geolocation APIs
- 🔄 Auto-fallback mechanism when APIs fail
- 💾 Local caching (30 days) to minimize API calls
- 🔍 Advanced search and filtering
- 📊 Real-time statistics
- 📱 Fully responsive design

## Supported API Providers

Choose from multiple free API providers or use auto mode with fallback:

1. **[ipwho.is](https://ipwho.is/)** - HTTPS, No rate limit mentioned (Default)
2. **[ipquery.io](https://ipquery.io/)** - HTTPS, Free tier available
3. **[ip-api.com](http://ip-api.com)** - HTTP, 45 requests/minute
4. **[ipapi.co](https://ipapi.co/)** - HTTPS, 1,000 requests/day
5. **[ipinfo.io](https://ipinfo.io/)** - HTTPS, 50,000 requests/month

## Usage

1. Select your preferred API provider (or use Auto mode)
2. Enter IP addresses (one per line)
3. Click "Locate IPs on Globe"
4. Explore results on the interactive 3D globe

![Demo](./screenshots/1.png)
