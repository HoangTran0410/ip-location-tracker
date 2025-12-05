let globe;
let autoRotate = true;
let locationData = [];
let countriesData = [];
let currentAltitude = 2.5;

// Throttle mechanism for progressive updates
let updateScheduled = false;
let lastUpdateTime = 0;
const UPDATE_THROTTLE_MS = 300; // Update at most every 300ms

// IndexedDB setup for caching IP locations
let db;
const DB_NAME = "IPLocationCache";
const STORE_NAME = "locations";
const DB_VERSION = 1;

// Store all results for filtering
let allResults = [];

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
      updateCacheCount();
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "ip" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

// Get count of cached IPs
async function getCacheCount() {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Update cache count display
async function updateCacheCount() {
  try {
    const count = await getCacheCount();
    document.getElementById("cachedIPs").textContent = count;
  } catch (error) {
    console.error("Failed to get cache count:", error);
    document.getElementById("cachedIPs").textContent = "?";
  }
}

// Clear all cache
async function clearCache() {
  if (!confirm("Are you sure you want to clear all cached IP data?")) {
    return;
  }

  try {
    if (!db) await initDB();

    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.log("Cache cleared successfully");
      updateCacheCount();
      showTemporaryMessage("✅ Cache cleared successfully!");
    };

    request.onerror = () => {
      console.error("Failed to clear cache:", request.error);
      showError("Failed to clear cache");
    };
  } catch (error) {
    console.error("Failed to clear cache:", error);
    showError("Failed to clear cache: " + error.message);
  }
}

// Show temporary success message
function showTemporaryMessage(message) {
  const errorContainer = document.getElementById("errorContainer");
  errorContainer.innerHTML = `<div style="background: rgba(76, 175, 80, 0.2); border: 1px solid #4CAF50; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 0.9rem;">${message}</div>`;
  setTimeout(() => {
    errorContainer.innerHTML = "";
  }, 3000);
}

// Get cached location from IndexedDB
async function getCachedLocation(ip) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ip);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        // Check if cache is still valid (30 days)
        const cacheAge = Date.now() - result.timestamp;
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

        if (cacheAge < maxAge) {
          console.log(`Cache HIT for ${ip}`);
          resolve(result.location);
        } else {
          console.log(`Cache EXPIRED for ${ip}`);
          resolve(null);
        }
      } else {
        console.log(`Cache MISS for ${ip}`);
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Save location to IndexedDB cache
async function saveCachedLocation(ip, location) {
  if (!db) await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const data = {
      ip: ip,
      location: location,
      timestamp: Date.now(),
    };
    const request = store.put(data);

    request.onsuccess = () => {
      updateCacheCount();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Initialize Globe
async function initGlobe() {
  const container = document.getElementById("globe");

  // Load GeoJSON data for countries
  try {
    const countriesResponse = await fetch(
      "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
    );
    countriesData = await countriesResponse.json();
  } catch (error) {
    console.error("Failed to load countries data:", error);
  }

  globe = Globe()(container)
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-blue-marble.jpg")
    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundImageUrl("//unpkg.com/three-globe/example/img/night-sky.png")

    // Country polygons with borders
    .polygonsData(countriesData.features || [])
    .polygonCapColor(() => "rgba(0, 100, 200, 0.15)")
    .polygonSideColor(() => "rgba(0, 100, 200, 0.05)")
    .polygonStrokeColor(() => "#ffffff")
    .polygonAltitude(0.001)
    .polygonLabel(
      ({ properties: d }) => `
            <div style="background: rgba(0,0,0,0.9); padding: 12px; border-radius: 6px; color: white; max-width: 250px;">
              <div style="font-weight: bold; color: #4FC3F7; font-size: 1.1em; margin-bottom: 8px;">
                ${d.ADMIN || d.NAME}
              </div>
              ${
                d.ISO_A2
                  ? `<div style="opacity: 0.9; margin-bottom: 4px;">Code: ${d.ISO_A2}</div>`
                  : ""
              }
              ${
                d.POP_EST
                  ? `<div style="opacity: 0.9; margin-bottom: 4px;">Population: ${(
                      d.POP_EST / 1000000
                    ).toFixed(1)}M</div>`
                  : ""
              }
              ${
                d.CONTINENT
                  ? `<div style="opacity: 0.8; font-size: 0.9em;">Continent: ${d.CONTINENT}</div>`
                  : ""
              }
            </div>
          `
    )

    // No city labels - removed for performance

    // IP location points - fixed size for performance
    .pointsData([])
    .pointAltitude(0.02)
    .pointColor((d) => (d.count > 1 ? "#FFA726" : "#FF1744"))
    .pointRadius((d) => {
      // Fixed size, no zoom scaling for better performance
      const baseRadius = d.count > 1 ? 0.6 : 0.5;
      const clusterScale =
        d.count > 1 ? Math.min(Math.log(d.count) * 0.2, 0.6) : 0;
      return baseRadius + clusterScale;
    })
    .pointLabel((d) => {
      if (d.count > 1) {
        // Cluster tooltip
        return `
                <div style="background: rgba(0,0,0,0.9); padding: 12px; border-radius: 6px; color: white; max-width: 300px;">
                  <div style="font-weight: bold; color: #FFA726; margin-bottom: 8px; font-size: 1.2em;">
                    📍 ${d.count} IP Locations
                  </div>
                  <div style="margin-bottom: 8px;">🌍 ${d.city}, ${d.region}, ${
          d.country
        }</div>
                  <div style="opacity: 0.9; font-size: 0.95em; margin-bottom: 6px;">IPs in this cluster:</div>
                  <div style="opacity: 0.8; font-size: 0.85em; max-height: 150px; overflow-y: auto; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                    ${d.ips.map((ip) => `• ${ip}`).join("<br>")}
                  </div>
                  <div style="opacity: 0.7; font-size: 0.85em; margin-top: 8px;">📊 ${d.lat.toFixed(
                    4
                  )}, ${d.lng.toFixed(4)}</div>
                </div>
              `;
      } else {
        // Single IP tooltip
        return `
                <div style="background: rgba(0,0,0,0.9); padding: 12px; border-radius: 6px; color: white; max-width: 300px;">
                  <div style="font-weight: bold; color: #FF1744; margin-bottom: 8px; font-size: 1.1em;">
                    📍 ${d.ip}
                  </div>
                  <div style="margin-bottom: 4px;">🌍 ${d.city}, ${
          d.region
        }</div>
                  <div style="margin-bottom: 4px;">🏳️ ${d.country} (${
          d.countryCode
        })</div>
                  <div style="opacity: 0.8; font-size: 0.9em; margin-bottom: 4px;">📊 ${d.lat.toFixed(
                    4
                  )}, ${d.lng.toFixed(4)}</div>
                  ${
                    d.timezone
                      ? `<div style="opacity: 0.8; font-size: 0.9em; margin-bottom: 4px;">🕐 ${d.timezone}</div>`
                      : ""
                  }
                  ${
                    d.org
                      ? `<div style="opacity: 0.8; font-size: 0.9em; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2);">🏢 ${d.org}</div>`
                      : ""
                  }
                  ${
                    d.isp
                      ? `<div style="opacity: 0.8; font-size: 0.9em;">📡 ${d.isp}</div>`
                      : ""
                  }
                  ${
                    d.as
                      ? `<div style="opacity: 0.8; font-size: 0.9em;">🔢 ${d.as}</div>`
                      : ""
                  }
                  <div style="opacity: 0.8; font-size: 0.9em; margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.2);">
                    ${
                      d.mobile
                        ? "📱 Mobile/Cellular Connection"
                        : "💻 Broadband/WiFi Connection"
                    }
                  </div>
                </div>
              `;
      }
    });

  // No arcs - removed as they have no meaning

  // Auto-rotate
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.5;

  // Initial camera position
  globe.pointOfView({ altitude: 2.5 });

  // No dynamic scaling - removed for performance
}

// Cluster nearby locations
function clusterLocations(locations, distanceThreshold = 0.5) {
  if (locations.length === 0) return [];

  const clusters = [];
  const used = new Set();

  for (let i = 0; i < locations.length; i++) {
    if (used.has(i)) continue;

    const cluster = {
      ...locations[i],
      count: 1,
      ips: [locations[i].ip],
    };

    for (let j = i + 1; j < locations.length; j++) {
      if (used.has(j)) continue;

      const distance = calculateDistance(
        locations[i].lat,
        locations[i].lng,
        locations[j].lat,
        locations[j].lng
      );

      if (distance < distanceThreshold) {
        cluster.count++;
        cluster.ips.push(locations[j].ip);
        // Average the coordinates
        cluster.lat =
          (cluster.lat * (cluster.count - 1) + locations[j].lat) /
          cluster.count;
        cluster.lng =
          (cluster.lng * (cluster.count - 1) + locations[j].lng) /
          cluster.count;
        used.add(j);
      }
    }

    clusters.push(cluster);
    used.add(i);
  }

  return clusters;
}

// Calculate distance between two lat/lng points (in degrees)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Fetch from ipwho.is API
async function fetchFromIpwho(ip) {
  const response = await fetch(`https://ipwho.is/${ip}`);
  const data = await response.json();

  if (data.success === true) {
    return {
      ip: data.ip,
      country: data.country,
      countryCode: data.country_code,
      region: data.region,
      city: data.city,
      lat: data.latitude,
      lng: data.longitude,
      timezone: data.timezone?.id || "",
      isp: data.connection?.isp || "",
      org: data.connection?.org || "",
      as: data.connection?.asn ? `AS${data.connection.asn}` : "",
      mobile: false,
    };
  }
  throw new Error(data.message || "Failed to fetch from ipwho.is");
}

// Fetch from ip-api.com API
async function fetchFromIpApi(ip) {
  const response = await fetch(
    `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,mobile,query`
  );
  const data = await response.json();

  if (data.status === "success") {
    return {
      ip: data.query,
      country: data.country,
      countryCode: data.countryCode,
      region: data.regionName,
      city: data.city,
      lat: data.lat,
      lng: data.lon,
      timezone: data.timezone,
      isp: data.isp,
      org: data.org,
      as: data.as,
      mobile: data.mobile,
    };
  }
  throw new Error(data.message || "Failed to fetch from ip-api.com");
}

// Fetch from ipapi.co API
async function fetchFromIpApiCo(ip) {
  const response = await fetch(`https://ipapi.co/${ip}/json/`);
  const data = await response.json();

  if (!data.error) {
    return {
      ip: data.ip,
      country: data.country_name,
      countryCode: data.country_code,
      region: data.region,
      city: data.city,
      lat: data.latitude,
      lng: data.longitude,
      timezone: data.timezone,
      isp: data.org || "",
      org: data.org || "",
      as: data.asn || "",
      mobile: false,
    };
  }
  throw new Error(data.reason || "Failed to fetch from ipapi.co");
}

// Fetch from ipinfo.io API
async function fetchFromIpInfo(ip) {
  const response = await fetch(`https://ipinfo.io/${ip}/json`);
  const data = await response.json();

  if (!data.error && data.loc) {
    const [lat, lng] = data.loc.split(",").map(parseFloat);
    return {
      ip: data.ip,
      country: data.country || "",
      countryCode: data.country || "",
      region: data.region || "",
      city: data.city || "",
      lat: lat,
      lng: lng,
      timezone: data.timezone || "",
      isp: data.org || "",
      org: data.org || "",
      as: data.org || "",
      mobile: false,
    };
  }
  throw new Error(data.error || "Failed to fetch from ipinfo.io");
}

// Fetch from ipquery.io API
async function fetchFromIpQuery(ip) {
  const response = await fetch(`https://api.ipquery.io/${ip}`);
  const data = await response.json();

  if (data.location) {
    return {
      ip: data.ip || ip,
      country: data.location.country || "",
      countryCode: data.location.country_code || "",
      region: data.location.state || "",
      city: data.location.city || "",
      lat: data.location.latitude,
      lng: data.location.longitude,
      timezone: data.location.timezone || "",
      isp: data.isp?.isp || "",
      org: data.isp?.org || "",
      as: data.isp?.asn ? `AS${data.isp.asn}` : "",
      mobile: data.connection?.mobile || false,
    };
  }
  throw new Error("Failed to fetch from ipquery.io");
}

// Fetch IP location using selected provider or auto-fallback
// APIs available:
// 1. ipwho.is - Free, HTTPS, no rate limit mentioned
// 2. ip-api.com - Free, 45 requests/minute limit
// 3. ipapi.co - Free, 1000 requests/day
// 4. ipinfo.io - Free, 50,000 requests/month
// 5. ipquery.io - Free, HTTPS, free tier available
async function getIPLocation(ip) {
  try {
    // Check bypass cache setting
    const bypassCache = document.getElementById("bypassCache").checked;

    // Check cache first (unless bypassing)
    if (!bypassCache) {
      const cached = await getCachedLocation(ip);
      if (cached) {
        return cached;
      }
    } else {
      console.log(`Bypassing cache for ${ip}`);
    }

    const provider = document.getElementById("apiProvider").value;
    let location = null;

    // Try specific provider if selected
    if (provider !== "auto") {
      try {
        switch (provider) {
          case "ipwho":
            location = await fetchFromIpwho(ip);
            break;
          case "ipapi":
            location = await fetchFromIpApi(ip);
            break;
          case "ipapico":
            location = await fetchFromIpApiCo(ip);
            break;
          case "ipinfo":
            location = await fetchFromIpInfo(ip);
            break;
          case "ipquery":
            location = await fetchFromIpQuery(ip);
            break;
        }

        if (location) {
          await saveCachedLocation(ip, location);
          return location;
        }
      } catch (error) {
        console.warn(`${provider} API failed:`, error);
        return { error: `${provider} API failed: ${error.message}` };
      }
    }

    // Auto mode: try all providers with fallback
    // Try ipwho.is first (HTTPS, free, no rate limit)
    try {
      location = await fetchFromIpwho(ip);
      await saveCachedLocation(ip, location);
      return location;
    } catch (error) {
      console.warn("ipwho.is API failed, trying fallback:", error);
    }

    // Fallback to ipquery.io
    try {
      location = await fetchFromIpQuery(ip);
      await saveCachedLocation(ip, location);
      return location;
    } catch (error) {
      console.warn("ipquery.io API failed, trying next fallback:", error);
    }

    // Fallback to ip-api.com
    try {
      location = await fetchFromIpApi(ip);
      await saveCachedLocation(ip, location);
      return location;
    } catch (error) {
      console.warn("ip-api.com API failed, trying next fallback:", error);
    }

    // Fallback to ipapi.co
    try {
      location = await fetchFromIpApiCo(ip);
      await saveCachedLocation(ip, location);
      return location;
    } catch (error) {
      console.warn("ipapi.co API failed, trying next fallback:", error);
    }

    // Fallback to ipinfo.io
    try {
      location = await fetchFromIpInfo(ip);
      await saveCachedLocation(ip, location);
      return location;
    } catch (error) {
      console.warn("ipinfo.io API failed:", error);
    }

    // All APIs failed
    return { error: "All API services failed. Please try again later." };
  } catch (error) {
    return { error: error.message };
  }
}

// Locate multiple IPs
async function locateIPs() {
  const ipListText = document.getElementById("ipList").value.trim();
  if (!ipListText) {
    showError("Please enter at least one IP address");
    return;
  }

  const ipsList = ipListText
    .split("\n")
    .map((ip) => ip.trim())
    .map((_) => {
      // extract ip between <>
      if (_.includes("<") && _.includes(">")) {
        return _.match(/<\s*([^,\s>]+)/)?.[1];
      }
      return _;
    })
    .filter((ip) => ip && isValidIP(ip));

  // unique IPs only
  const ips = [...new Set(ipsList)];

  // update textarea with cleaned IPs
  document.getElementById("ipList").value = ips.join("\n");

  if (ips.length === 0) {
    showError("No valid IP addresses found");
    return;
  }

  // Clear previous results
  clearError();
  document.getElementById("results").innerHTML = "";
  document.getElementById("totalIPs").textContent = ips.length;
  document.getElementById("foundIPs").textContent = "0";

  const btn = document.getElementById("locateBtn");
  btn.disabled = true;
  btn.textContent = "🔍 Locating...";

  locationData = [];
  let foundCount = 0;
  let apiCallCount = 0;

  // Fetch locations with smart caching - only delay for API calls
  for (let i = 0; i < ips.length; i++) {
    const ip = ips[i];

    // Check if cached (will be fast)
    const isCached = await getCachedLocation(ip);
    const needsDelay = !isCached && apiCallCount > 0;

    // Add delay BEFORE API call if needed (ip-api.com: 45 requests/minute)
    if (needsDelay) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const location = await getIPLocation(ip);

    // Track API calls for rate limiting
    if (!isCached) {
      apiCallCount++;
    }

    if (location.error) {
      addResult(ip, null, location.error);
    } else {
      locationData.push(location);
      addResult(ip, location);
      foundCount++;
      document.getElementById("foundIPs").textContent = foundCount;

      // Progressive update: update globe after each IP (throttled)
      scheduleGlobeUpdate(foundCount === 1); // Focus on first IP only
    }
  }

  console.log(
    `Processed ${ips.length} IPs: ${apiCallCount} API calls, ${
      ips.length - apiCallCount
    } from cache`
  );

  // Final update to ensure everything is shown
  updateGlobe();

  btn.disabled = false;
  btn.textContent = "🔍 Locate IPs on Globe";
}

// Update globe visualization with clustering (throttled)
function updateGlobe(focusFirst = false) {
  if (locationData.length === 0) return;

  // Cluster nearby locations
  const clusteredData = clusterLocations(locationData, 0.5);

  // Update points with clusters
  globe.pointsData(clusteredData);

  // Focus on first location only if requested (first IP found)
  if (focusFirst && clusteredData.length > 0) {
    globe.pointOfView(
      {
        lat: clusteredData[0].lat,
        lng: clusteredData[0].lng,
        altitude: 2,
      },
      1500
    );
  }
}

// Throttled update - prevents too many rapid updates
function scheduleGlobeUpdate(focusFirst = false) {
  const now = Date.now();
  const timeSinceLastUpdate = now - lastUpdateTime;

  if (timeSinceLastUpdate >= UPDATE_THROTTLE_MS) {
    // Enough time has passed, update immediately
    updateGlobe(focusFirst);
    lastUpdateTime = now;
    updateScheduled = false;
  } else if (!updateScheduled) {
    // Schedule an update for later
    updateScheduled = true;
    const delay = UPDATE_THROTTLE_MS - timeSinceLastUpdate;
    setTimeout(() => {
      updateGlobe(focusFirst);
      lastUpdateTime = Date.now();
      updateScheduled = false;
    }, delay);
  }
  // If update already scheduled, do nothing (it will happen soon)
}

// Add result to sidebar
function addResult(ip, location, error) {
  const resultsDiv = document.getElementById("results");
  const resultItem = document.createElement("div");
  resultItem.className = "result-item";

  if (error) {
    resultItem.innerHTML = `
            <div class="ip">${ip}</div>
            <div class="error">❌ ${error}</div>
          `;
    resultItem.dataset.error = "true";
  } else {
    // Store data in dataset for filtering
    resultItem.dataset.ip = ip;
    resultItem.dataset.country = location.country || "";
    resultItem.dataset.city = location.city || "";
    resultItem.dataset.region = location.region || "";
    resultItem.dataset.isp = location.isp || "";
    resultItem.dataset.org = location.org || "";
    resultItem.dataset.timezone = location.timezone || "";
    resultItem.dataset.mobile = location.mobile ? "mobile" : "broadband";
    resultItem.dataset.as = location.as || "";
    resultItem.dataset.lat = location.lat;
    resultItem.dataset.lng = location.lng;

    resultItem.innerHTML = `
            <div class="ip">${ip}</div>
            <div class="location">
              📍 ${location.city}, ${location.region}, ${location.country} (${
      location.countryCode
    })<br>
              🌐 ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}<br>
              ${location.timezone ? `🕐 ${location.timezone}<br>` : ""}
              ${location.isp ? `📡 ${location.isp}<br>` : ""}
              ${location.org ? `🏢 ${location.org}<br>` : ""}
              ${location.as ? `🔢 ${location.as}<br>` : ""}
              ${location.mobile ? "📱 Mobile/Cellular" : "💻 Broadband/WiFi"}
            </div>
          `;

    // Add click event to zoom to location on globe
    resultItem.addEventListener("click", () => {
      zoomToLocation(location.lat, location.lng, ip);

      // Close mobile menu if open
      if (window.innerWidth <= 768) {
        toggleMobileMenu();
      }
    });

    // Store in allResults array
    allResults.push({
      element: resultItem,
      data: location,
    });
  }

  resultsDiv.appendChild(resultItem);

  // Show filter section if we have results
  if (allResults.length > 0) {
    document.getElementById("searchFilterSection").style.display = "block";
    updateFilterOptions();
    updateResultsCount();
  }
}

// Clear all results
function clearResults() {
  if (!confirm("Are you sure you want to clear all results?")) return;
  document.getElementById("ipList").value = "";
  document.getElementById("results").innerHTML = "";
  document.getElementById("totalIPs").textContent = "0";
  document.getElementById("foundIPs").textContent = "0";
  document.getElementById("searchFilterSection").style.display = "none";
  allResults = [];
  locationData = [];
  globe.pointsData([]);
  globe.arcsData([]);
  clearError();
  clearFilters();
}

// Update filter dropdowns with unique values
function updateFilterOptions() {
  const countries = new Set();
  const cities = new Set();
  const regions = new Set();
  const isps = new Set();
  const timezones = new Set();

  allResults.forEach(({ data }) => {
    if (data.country) countries.add(data.country);
    if (data.city) cities.add(data.city);
    if (data.region) regions.add(data.region);
    if (data.isp) isps.add(data.isp);
    if (data.timezone) timezones.add(data.timezone);
  });

  // Update country filter
  const filterCountry = document.getElementById("filterCountry");
  const currentCountry = filterCountry.value;
  filterCountry.innerHTML = '<option value="">All Countries</option>';
  [...countries].sort().forEach((country) => {
    filterCountry.innerHTML += `<option value="${country}">${country}</option>`;
  });
  filterCountry.value = currentCountry;

  // Update city filter
  const filterCity = document.getElementById("filterCity");
  const currentCity = filterCity.value;
  filterCity.innerHTML = '<option value="">All Cities</option>';
  [...cities].sort().forEach((city) => {
    filterCity.innerHTML += `<option value="${city}">${city}</option>`;
  });
  filterCity.value = currentCity;

  // Update region filter
  const filterRegion = document.getElementById("filterRegion");
  const currentRegion = filterRegion.value;
  filterRegion.innerHTML = '<option value="">All Regions</option>';
  [...regions].sort().forEach((region) => {
    filterRegion.innerHTML += `<option value="${region}">${region}</option>`;
  });
  filterRegion.value = currentRegion;

  // Update ISP filter
  const filterISP = document.getElementById("filterISP");
  const currentISP = filterISP.value;
  filterISP.innerHTML = '<option value="">All ISPs</option>';
  [...isps].sort().forEach((isp) => {
    filterISP.innerHTML += `<option value="${isp}">${isp}</option>`;
  });
  filterISP.value = currentISP;

  // Update timezone filter
  const filterTimezone = document.getElementById("filterTimezone");
  const currentTimezone = filterTimezone.value;
  filterTimezone.innerHTML = '<option value="">All Timezones</option>';
  [...timezones].sort().forEach((timezone) => {
    filterTimezone.innerHTML += `<option value="${timezone}">${timezone}</option>`;
  });
  filterTimezone.value = currentTimezone;
}

// Apply filters to results
function applyFilters() {
  const searchText = document.getElementById("searchBox").value.toLowerCase();
  const filterCountry = document.getElementById("filterCountry").value;
  const filterCity = document.getElementById("filterCity").value;
  const filterRegion = document.getElementById("filterRegion").value;
  const filterISP = document.getElementById("filterISP").value;
  const filterMobile = document.getElementById("filterMobile").value;
  const filterTimezone = document.getElementById("filterTimezone").value;

  let visibleCount = 0;

  allResults.forEach(({ element }) => {
    // Skip error items
    if (element.dataset.error === "true") {
      element.classList.remove("hidden");
      visibleCount++;
      return;
    }

    let isVisible = true;

    // Apply search text filter (searches across all fields)
    if (searchText) {
      const searchableText = [
        element.dataset.ip,
        element.dataset.country,
        element.dataset.city,
        element.dataset.region,
        element.dataset.isp,
        element.dataset.org,
        element.dataset.as,
        element.dataset.timezone,
      ]
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchText)) {
        isVisible = false;
      }
    }

    // Apply dropdown filters
    if (filterCountry && element.dataset.country !== filterCountry) {
      isVisible = false;
    }

    if (filterCity && element.dataset.city !== filterCity) {
      isVisible = false;
    }

    if (filterRegion && element.dataset.region !== filterRegion) {
      isVisible = false;
    }

    if (filterISP && element.dataset.isp !== filterISP) {
      isVisible = false;
    }

    if (filterMobile && element.dataset.mobile !== filterMobile) {
      isVisible = false;
    }

    if (filterTimezone && element.dataset.timezone !== filterTimezone) {
      isVisible = false;
    }

    // Show/hide element
    if (isVisible) {
      element.classList.remove("hidden");
      visibleCount++;
    } else {
      element.classList.add("hidden");
    }
  });

  // Update count
  document.getElementById("filteredCount").textContent = visibleCount;
}

// Clear all filters
function clearFilters() {
  document.getElementById("searchBox").value = "";
  document.getElementById("filterCountry").value = "";
  document.getElementById("filterCity").value = "";
  document.getElementById("filterRegion").value = "";
  document.getElementById("filterISP").value = "";
  document.getElementById("filterMobile").value = "";
  document.getElementById("filterTimezone").value = "";
  applyFilters();
}

// Update results count display
function updateResultsCount() {
  const total = allResults.length;
  document.getElementById("totalCount").textContent = total;
  document.getElementById("filteredCount").textContent = total;
}

// Show error message
function showError(message) {
  const errorContainer = document.getElementById("errorContainer");
  errorContainer.innerHTML = `<div class="error-message">⚠️ ${message}</div>`;
}

// Clear error message
function clearError() {
  document.getElementById("errorContainer").innerHTML = "";
}

// Validate IP address
function isValidIP(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// Reset camera view
function resetCamera() {
  globe.pointOfView({ altitude: 2.5 }, 1000);
}

// Zoom to specific location on globe
function zoomToLocation(lat, lng, ip) {
  console.log(`Zooming to ${ip} at ${lat}, ${lng}`);

  // Remove active class from all result items
  document.querySelectorAll(".result-item").forEach((item) => {
    item.classList.remove("active");
  });

  // Add active class to the clicked item
  const clickedItem = Array.from(
    document.querySelectorAll(".result-item")
  ).find((item) => item.dataset.ip === ip);
  if (clickedItem) {
    clickedItem.classList.add("active");
  }

  // Disable auto-rotation temporarily for better focus
  const wasRotating = globe.controls().autoRotate;
  globe.controls().autoRotate = false;

  // Zoom to location with smooth animation
  globe.pointOfView(
    {
      lat: lat,
      lng: lng,
      altitude: 1.5, // Closer zoom level
    },
    1500 // Animation duration in ms
  );

  // Re-enable auto-rotation after a delay if it was on
  if (wasRotating) {
    setTimeout(() => {
      if (autoRotate) {
        globe.controls().autoRotate = true;
      }
    }, 3000); // Wait 3 seconds before resuming rotation
  }
}

// Toggle auto-rotation
function toggleRotation() {
  autoRotate = !autoRotate;
  globe.controls().autoRotate = autoRotate;
}

// Toggle country borders
let showBorders = true;
function toggleBorders() {
  showBorders = !showBorders;
  const btn = document.getElementById("bordersBtn");
  btn.style.opacity = showBorders ? "1" : "0.5";
  globe.polygonsData(showBorders ? countriesData.features || [] : []);
}

// Initialize on page load
window.addEventListener("load", async () => {
  document.getElementById("loading").classList.remove("hidden");

  // Initialize IndexedDB
  try {
    await initDB();
    console.log("IndexedDB initialized");
  } catch (error) {
    console.error("Failed to initialize IndexedDB:", error);
  }

  setTimeout(async () => {
    await initGlobe();
    document.getElementById("loading").classList.add("hidden");
  }, 500);
});

// Add sample IPs button functionality
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    document.getElementById("ipList").value =
      "8.8.8.8\n1.1.1.1\n208.67.222.222\n142.250.185.46\n13.107.42.14\n203.113.151.1\n210.245.24.20";
  }
});

// Mobile menu toggle
function toggleMobileMenu() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.querySelector(".sidebar-overlay");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("open");
}

// Handle window resize - update globe size
let resizeTimeout;
window.addEventListener("resize", () => {
  // Debounce resize events to avoid too many updates
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (globe) {
      // Globe.GL automatically handles resize, but we can force update
      globe.width(globe.width());
      globe.height(globe.height());

      // Close mobile menu on resize to desktop
      if (window.innerWidth > 768) {
        const sidebar = document.getElementById("sidebar");
        const overlay = document.querySelector(".sidebar-overlay");
        sidebar.classList.remove("open");
        overlay.classList.remove("open");
      }
    }
  }, 250);
});

// Close mobile menu when clicking on locate button
const originalLocateIPs = window.locateIPs;
window.locateIPs = function () {
  if (window.innerWidth <= 768) {
    toggleMobileMenu();
  }
  return originalLocateIPs();
};
