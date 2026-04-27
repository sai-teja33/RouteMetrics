let map;
let directionsService;
let directionsDisplay = [];
let routeData = {};
let allRoutes = [];
let selectedRouteIndex = 0;
let userCurrentLocation = null;
let autocompleteService;
let placesService;
let currentTravelMode = "DRIVING";

// Route colors for different routes
const routeColors = ["#667eea", "#ff6b6b", "#51cf66", "#ffd93d", "#845ef7"];

// Storage Keys
const HISTORY_KEY = "routeHistory";
const FAVORITES_KEY = "routeFavorites";
const SETTINGS_KEY = "appSettings";

// Default Settings
const defaultSettings = {
  autoSaveRoute: true,
  darkMode: false,
  defaultVehicle: "car",
  defaultFuelPrice: 100,
};

// Initialize Settings from LocalStorage
let appSettings =
  JSON.parse(localStorage.getItem(SETTINGS_KEY)) || defaultSettings;

// Wait for Google Maps to load
function waitForGoogleMaps() {
  return new Promise((resolve, reject) => {
    let finished = false;
    const checkInterval = setInterval(() => {
      if (window.google && window.google.maps) {
        if (!finished) {
          finished = true;
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          console.log("✓ Google Maps API loaded successfully");
          resolve();
        }
      }
    }, 100);

    const timeoutId = setTimeout(() => {
      if (!finished) {
        finished = true;
        clearInterval(checkInterval);
        console.error("Google Maps API failed to load within timeout");
        reject(
          new Error(
            "Failed to load Google Maps. Please check your API key in config.js and try again.",
          ),
        );
      }
    }, 20000);
  });
}

// Initialize Google Maps and Services
async function initMap() {
  try {
    await waitForGoogleMaps();

    // Set default travel mode now that google is loaded
    currentTravelMode = google.maps.TravelMode.DRIVING;

    const defaultCenter = { lat: 17.385, lng: 78.4867 }; // Hyderabad

    map = new google.maps.Map(document.getElementById("map"), {
      zoom: 10,
      center: defaultCenter,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
      styles: [
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#e9e9e9" }, { lightness: 17 }],
        },
        {
          featureType: "landscape",
          elementType: "geometry",
          stylers: [{ color: "#f5f5f5" }, { lightness: 20 }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry.fill",
          stylers: [{ color: "#fed7d7" }, { lightness: 16 }],
        },
        {
          featureType: "road.arterial",
          elementType: "geometry.fill",
          stylers: [{ color: "#f0e4d3" }, { lightness: 45 }],
        },
        {
          featureType: "poi",
          stylers: [{ visibility: "off" }],
        },
        {
          featureType: "transit",
          stylers: [{ visibility: "off" }],
        },
      ],
    });

    directionsService = new google.maps.DirectionsService();
    autocompleteService = new google.maps.places.AutocompleteService();
    placesService = new google.maps.places.PlacesService(map);

    // Setup autocomplete
    setupAutocomplete("origin", "originSuggestions");
    setupAutocomplete("destination", "destinationSuggestions");

    // Load history and favorites
    loadRouteHistory();
    loadFavorites();

    // Apply saved settings
    applySettings();

    console.log("✓ Google Maps initialized successfully");
  } catch (error) {
    console.error("Map initialization error:", error);
    showError("Error initializing map: " + error.message);
  }
}

// Setup autocomplete for input fields
function setupAutocomplete(inputId, suggestionsId) {
  const inputElement = document.getElementById(inputId);
  const suggestionsElement = document.getElementById(suggestionsId);
  let autocompleteTimeout;

  inputElement.addEventListener("input", (e) => {
    clearTimeout(autocompleteTimeout);
    const value = e.target.value.trim();

    if (value.length < 2) {
      suggestionsElement.classList.add("hidden");
      return;
    }

    autocompleteTimeout = setTimeout(() => {
      getAutocompleteSuggestions(value, suggestionsElement);
    }, 300);
  });

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(`#${inputId}`) &&
      !e.target.closest(`#${suggestionsId}`)
    ) {
      suggestionsElement.classList.add("hidden");
    }
  });
}

// Get autocomplete suggestions
function getAutocompleteSuggestions(input, suggestionsElement) {
  const request = {
    input: input,
    componentRestrictions: { country: "in" },
    types: ["geocode", "establishment"],
  };

  autocompleteService.getPlacePredictions(request, (predictions, status) => {
    if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
      suggestionsElement.innerHTML =
        '<li class="autocomplete-item">No suggestions found</li>';
      suggestionsElement.classList.remove("hidden");
      return;
    }

    suggestionsElement.innerHTML = "";
    predictions.slice(0, 8).forEach((prediction) => {
      const li = document.createElement("li");
      li.className = "autocomplete-item";
      li.textContent = prediction.description;

      li.addEventListener("click", () => {
        const inputId =
          suggestionsElement.id === "originSuggestions"
            ? "origin"
            : "destination";
        document.getElementById(inputId).value = prediction.description;
        suggestionsElement.classList.add("hidden");
      });

      suggestionsElement.appendChild(li);
    });

    suggestionsElement.classList.remove("hidden");
  });
}

// Get user's current location
function getUserLocation() {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser");
    return;
  }

  showLoading(true);
  showSuccess("Getting your current location...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCurrentLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: userCurrentLocation }, (results, status) => {
        showLoading(false);

        if (status === google.maps.GeocoderStatus.OK && results[0]) {
          const address = results[0].formatted_address;
          document.getElementById("origin").value = address;
          showSuccess(
            `📍 Location set: ${address.split(",").slice(0, 2).join(",")}`,
          );
          setTimeout(() => hideSuccess(), 3000);
        } else {
          document.getElementById("origin").value =
            `${userCurrentLocation.lat.toFixed(4)}, ${userCurrentLocation.lng.toFixed(4)}`;
          showSuccess("📍 Location detected (coordinates)");
          setTimeout(() => hideSuccess(), 3000);
        }
      });
    },
    (error) => {
      showLoading(false);
      let errorMsg = "Unable to get your location";

      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg =
            "Location permission denied. Please enable location access.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg = "Location information is unavailable.";
          break;
        case error.TIMEOUT:
          errorMsg = "Location request timed out.";
          break;
      }

      showError(errorMsg);
    },
  );
}

// Analyze the route with all alternatives
async function analyzeRoute() {
  const origin = document.getElementById("origin").value.trim();
  const destination = document.getElementById("destination").value.trim();

  if (!origin || !destination) {
    showError("Please enter both origin and destination");
    return;
  }

  showLoading(true);
  hideError();

  try {
    if (!directionsService) {
      showError("Google Maps not ready. Please refresh and try again.");
      showLoading(false);
      return;
    }

    const request = {
      origin: origin,
      destination: destination,
      travelMode: currentTravelMode,
      provideRouteAlternatives: true,
    };

    const result = await new Promise((resolve, reject) => {
      directionsService.route(request, (response, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
          resolve(response);
        } else {
          reject(new Error(`Directions API error: ${status}`));
        }
      });
    });

    allRoutes = result.routes;
    selectedRouteIndex = 0;

    directionsDisplay.forEach((display) => {
      if (display) {
        if (display.polyline) display.polyline.setMap(null);
        if (display.markers) {
          display.markers.forEach((marker) => marker.setMap(null));
        }
      }
    });
    directionsDisplay = [];

    displayAllRoutesOnMap(result);
    displayRouteResults(result);

    // Get weather info
    if (document.getElementById("showWeather").checked) {
      getWeatherInfo(origin, destination);
      trackEvent("weather_checked");
    }

    // Save to history if enabled
    if (appSettings.autoSaveRoute) {
      saveToHistory(origin, destination);
    }

    // Track successful route analysis
    const totalDistance =
      result.routes[0].legs.reduce((sum, leg) => sum + leg.distance.value, 0) /
      1000;
    trackEvent("route_analyzed", {
      origin: origin.split(",")[0],
      destination: destination.split(",")[0],
      distance_km: Math.round(totalDistance),
      route_count: result.routes.length,
    });

    showLoading(false);
    displayResults();
    document.getElementById("saveFavoriteBtn").classList.remove("hidden");
  } catch (error) {
    console.error("Error analyzing route:", error);
    showError("Error: " + error.message);
    showLoading(false);

    // Track route analysis error
    trackEvent("route_analysis_error", {
      error_message: error.message,
    });
  }
}

// Display all routes on the map
function displayAllRoutesOnMap(result) {
  result.routes.forEach((route, index) => {
    // Create polyline for the route
    const polyline = new google.maps.Polyline({
      path: route.overview_path,
      strokeColor: routeColors[index % routeColors.length],
      strokeWeight: index === selectedRouteIndex ? 5 : 3,
      strokeOpacity: index === selectedRouteIndex ? 0.8 : 0.5,
      zIndex: index === selectedRouteIndex ? 2 : 1,
      clickable: false,
      map: map,
    });

    // Add markers only for selected route
    let markers = [];
    if (index === selectedRouteIndex) {
      // Start marker
      const startMarker = new google.maps.Marker({
        position: route.legs[0].start_location,
        map: map,
        title: route.legs[0].start_address,
      });

      // End marker
      const endMarker = new google.maps.Marker({
        position: route.legs[0].end_location,
        map: map,
        title: route.legs[0].end_address,
      });

      markers = [startMarker, endMarker];
    }

    // Store route data
    const routeData = {
      polyline: polyline,
      markers: markers,
      route: route,
    };

    directionsDisplay.push(routeData);
  });

  // Fit map to show all routes
  const bounds = new google.maps.LatLngBounds();
  result.routes.forEach((route) => {
    route.overview_path.forEach((point) => bounds.extend(point));
  });
  map.fitBounds(bounds, { padding: 20 });
}

// Display route results
function displayRouteResults(result) {
  const routesList = document.getElementById("routesList");
  const highwaysList = document.getElementById("highwaysList");

  routesList.innerHTML = "";
  highwaysList.innerHTML = "";

  const primaryRoute = result.routes[0];
  const highways = analyzeRouteDetails(primaryRoute);

  let totalDistance = 0;
  let totalDuration = 0;

  primaryRoute.legs.forEach((leg) => {
    totalDistance += leg.distance.value / 1000;
    totalDuration += leg.duration.value / 60;
  });

  routeData = {
    totalDistance: totalDistance,
    totalDuration: totalDuration,
    highways: highways,
    origin: primaryRoute.legs[0].start_address,
    destination: primaryRoute.legs[primaryRoute.legs.length - 1].end_address,
    allRoutes: result.routes,
    selectedRouteIndex: selectedRouteIndex,
  };

  document.getElementById("routeCount").textContent = result.routes.length;
  updateSelectedRouteSummary(selectedRouteIndex);
  updateHighwayBreakdown(selectedRouteIndex);

  // Display routes
  result.routes.forEach((route, index) => {
    let routeDistance = 0;
    let routeDuration = 0;

    route.legs.forEach((leg) => {
      routeDistance += leg.distance.value / 1000;
      routeDuration += leg.duration.value / 60;
    });

    const routeHours = Math.floor(routeDuration / 60);
    const routeMinutes = Math.round(routeDuration % 60);

    const routeCard = document.createElement("div");
    routeCard.className =
      "route-card" + (index === selectedRouteIndex ? " selected" : "");
    routeCard.innerHTML = `
            <div class="route-header" style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <span class="route-title">${index === 0 ? "🚀 Fastest" : `Route ${index + 1}`}</span>
                <span class="route-badge" style="background: ${routeColors[index % routeColors.length]}; color: white; padding: 4px 12px; border-radius: 20px;">${index + 1}</span>
            </div>
            <div class="route-details" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px;">
                <div class="route-detail-item">
                    <span style="font-size: 0.85em; color: #666; text-transform: uppercase;">Distance</span>
                    <span style="font-size: 1.1em; font-weight: 500;">${routeDistance.toFixed(1)} km</span>
                </div>
                <div class="route-detail-item">
                    <span style="font-size: 0.85em; color: #666; text-transform: uppercase;">Duration</span>
                    <span style="font-size: 1.1em; font-weight: 500;">${routeHours}h ${routeMinutes}m</span>
                </div>
            </div>
        `;

    routeCard.addEventListener("click", () => selectRoute(index));
    routesList.appendChild(routeCard);
  });
}

function updateSelectedRouteSummary(routeIndex) {
  if (!routeData.allRoutes || !routeData.allRoutes[routeIndex]) return;

  const route = routeData.allRoutes[routeIndex];
  let routeDistance = 0;
  let routeDuration = 0;

  route.legs.forEach((leg) => {
    routeDistance += leg.distance.value / 1000;
    routeDuration += leg.duration.value / 60;
  });

  routeData.selectedRouteIndex = routeIndex;
  routeData.selectedDistance = routeDistance;
  routeData.selectedDuration = routeDuration;

  document.getElementById("totalDistance").textContent =
    routeDistance.toFixed(1) + " km";
  const hours = Math.floor(routeDuration / 60);
  const minutes = Math.round(routeDuration % 60);
  document.getElementById("estimatedTime").textContent =
    `${hours}h ${minutes}m`;

  const defaultMileage = 15;
  const defaultFuelPrice = appSettings.defaultFuelPrice || 100;
  const estimatedFuelCost = (routeDistance / defaultMileage) * defaultFuelPrice;
  document.getElementById("estimatedCost").textContent =
    "₹ " + Math.round(estimatedFuelCost);
  updateHighwayBreakdown(routeIndex);
}

function updateHighwayBreakdown(routeIndex) {
  const highwaysList = document.getElementById("highwaysList");
  highwaysList.innerHTML = "";

  if (!routeData.allRoutes || !routeData.allRoutes[routeIndex]) {
    highwaysList.innerHTML =
      '<p style="text-align:center;color:#666;">Highway details not available.</p>';
    return;
  }

  const selectedRoute = routeData.allRoutes[routeIndex];
  const highways = analyzeRouteDetails(selectedRoute);
  const totalDistance = selectedRoute.legs.reduce(
    (sum, leg) => sum + leg.distance.value / 1000,
    0,
  );

  if (Object.keys(highways).length === 0) {
    const card = document.createElement("div");
    card.className = "highway-card";
    card.innerHTML = `
            <div class="highway-name">Primary Route</div>
            <div class="highway-meta">
                <span>${totalDistance.toFixed(1)} km</span>
                <span>100%</span>
            </div>
            <div class="highway-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 100%;"></div>
                </div>
            </div>
        `;
    highwaysList.appendChild(card);
    return;
  }

  let matchedDistance = 0;
  const sortedHighways = Object.values(highways).sort(
    (a, b) => b.distance - a.distance,
  );

  sortedHighways.forEach((highway) => {
    matchedDistance += highway.distance;
    const percentage = totalDistance
      ? (highway.distance / totalDistance) * 100
      : 0;
    const card = document.createElement("div");
    card.className = "highway-card";
    card.innerHTML = `
            <div class="highway-name">${highway.name}</div>
            <div class="highway-meta">
                <span>${highway.distance.toFixed(1)} km</span>
                <span>${percentage.toFixed(0)}%</span>
            </div>
            <div class="highway-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage.toFixed(0)}%;"></div>
                </div>
            </div>
        `;
    highwaysList.appendChild(card);
  });

  const otherDistance = totalDistance - matchedDistance;
  if (otherDistance > 0.5) {
    const otherPercentage = totalDistance
      ? (otherDistance / totalDistance) * 100
      : 0;
    const card = document.createElement("div");
    card.className = "highway-card";
    card.innerHTML = `
            <div class="highway-name">Other Roads</div>
            <div class="highway-meta">
                <span>${otherDistance.toFixed(1)} km</span>
                <span>${otherPercentage.toFixed(0)}%</span>
            </div>
            <div class="highway-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${otherPercentage.toFixed(0)}%;"></div>
                </div>
            </div>
        `;
    highwaysList.appendChild(card);
  }
}

// Analyze route details to identify highways
function analyzeRouteDetails(route) {
  const legs = route.legs;
  const highways = {};

  legs.forEach((leg) => {
    leg.steps.forEach((step) => {
      const instruction = (
        step.instructions ||
        step.html_instructions ||
        ""
      ).replace(/<[^>]*>/g, " ");
      const stepName = (step.name || "").trim();
      const highwayPattern =
        /(NH|AH|SH|ORR|Expressway|Ring Road|Outer Ring Road|Outer Ring Rd|Regional Ring Road|Bypass|Service Road|State Highway|National Highway|Asian Highway)(?:\s*[-\s]*\d+)?/gi;
      const matches = [
        ...(instruction.match(highwayPattern) || []),
        ...(stepName.match(highwayPattern) || []),
      ];

      if (matches.length > 0) {
        const highway = matches[0];
        const cleanName = highway.toUpperCase().replace(/\s+/g, " ").trim();

        if (!highways[cleanName]) {
          highways[cleanName] = {
            name: cleanName,
            distance: 0,
            lanes: "4-lane",
            direction: "Two-way",
            steps: [],
          };
        }

        highways[cleanName].distance += step.distance.value / 1000;
      }
    });
  });

  return highways;
}

// Select a different route
function selectRoute(routeIndex) {
  selectedRouteIndex = routeIndex;
  routeData.selectedRouteIndex = routeIndex;

  document.querySelectorAll(".route-card").forEach((card, index) => {
    if (index === routeIndex) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });

  // Update map display for selected route
  directionsDisplay.forEach((display, index) => {
    if (display.polyline) {
      display.polyline.setOptions({
        strokeWeight: index === selectedRouteIndex ? 5 : 3,
        strokeOpacity: index === selectedRouteIndex ? 1 : 0.6,
      });
    }

    if (display.markers) {
      display.markers.forEach((marker) => {
        marker.setMap(index === selectedRouteIndex ? map : null);
      });
    }
  });

  updateSelectedRouteSummary(routeIndex);
}

// Save route to history
function saveToHistory(origin, destination) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  const route = {
    id: Date.now(),
    origin: origin,
    destination: destination,
    distance: routeData.totalDistance.toFixed(1),
    time: document.getElementById("estimatedTime").textContent,
    timestamp: new Date().toLocaleString(),
  };

  history.unshift(route);
  if (history.length > 20) history.pop();

  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  loadRouteHistory();
}

// Load route history
function loadRouteHistory() {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  const historyList = document.getElementById("historyList");

  if (history.length === 0) {
    historyList.innerHTML =
      '<p style="text-align: center; color: #999;">No history yet. Analyze some routes first!</p>';
    return;
  }

  historyList.innerHTML = "";
  history.forEach((route) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
            <div class="route-info">
                <div class="route-info-main">${route.origin} → ${route.destination}</div>
                <div class="route-info-sub">${route.distance} km | ${route.time} | ${route.timestamp}</div>
            </div>
            <div class="route-actions">
                <button class="btn-secondary" onclick="loadHistoryRoute('${route.origin}', '${route.destination}')">Use</button>
                <button class="btn-danger" onclick="deleteHistoryRoute(${route.id})">Delete</button>
            </div>
        `;
    historyList.appendChild(item);
  });
}

// Load route from history
function loadHistoryRoute(origin, destination) {
  document.getElementById("origin").value = origin;
  document.getElementById("destination").value = destination;
  switchTab("analyzer");
  analyzeRoute();
}

// Delete history route
function deleteHistoryRoute(id) {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  const filtered = history.filter((r) => r.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  loadRouteHistory();
}

// Save as favorite
function saveFavorite() {
  const origin = document.getElementById("origin").value;
  const destination = document.getElementById("destination").value;

  const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  const favorite = {
    id: Date.now(),
    origin: origin,
    destination: destination,
    distance: document.getElementById("totalDistance").textContent,
    time: document.getElementById("estimatedTime").textContent,
    savedDate: new Date().toLocaleString(),
  };

  favorites.unshift(favorite);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  showSuccess("⭐ Route saved to favorites!");

  // Track favorite saved
  trackEvent("favorite_saved", {
    origin: origin.split(",")[0],
    destination: destination.split(",")[0],
  });

  loadFavorites();
}

// Load favorites
function loadFavorites() {
  const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  const favoritesList = document.getElementById("favoritesList");

  if (favorites.length === 0) {
    favoritesList.innerHTML =
      '<p style="text-align: center; color: #999;">No favorites yet. Save some routes!</p>';
    return;
  }

  favoritesList.innerHTML = "";
  favorites.forEach((fav) => {
    const item = document.createElement("div");
    item.className = "favorite-item";
    item.innerHTML = `
            <div class="route-info">
                <div class="route-info-main">⭐ ${fav.origin} → ${fav.destination}</div>
                <div class="route-info-sub">${fav.distance} km | ${fav.time} | Saved: ${fav.savedDate}</div>
            </div>
            <div class="route-actions">
                <button class="btn-secondary" onclick="loadHistoryRoute('${fav.origin}', '${fav.destination}')">Use</button>
                <button class="btn-danger" onclick="deleteFavorite(${fav.id})">Remove</button>
            </div>
        `;
    favoritesList.appendChild(item);
  });
}

// Delete favorite
function deleteFavorite(id) {
  const favorites = JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  const filtered = favorites.filter((f) => f.id !== id);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(filtered));
  loadFavorites();
}

// Calculate cost
function calculateCost() {
  const distance =
    routeData.selectedDistance ||
    routeData.totalDistance ||
    parseFloat(document.getElementById("totalDistance").textContent) ||
    0;
  const vehicleType = document.getElementById("vehicleType").value;
  const fuelPrice = parseFloat(document.getElementById("fuelPrice").value) || 0;
  const mileage = parseFloat(document.getElementById("mileage").value) || 1;
  const toll = parseFloat(document.getElementById("tollCost").value) || 0;

  const fuelCost = distance > 0 ? (distance / mileage) * fuelPrice : 0;
  const totalCost = fuelCost + toll;
  const costPerKm = distance > 0 ? totalCost / distance : 0;

  // Track cost calculation
  trackEvent("cost_calculated", {
    vehicle_type: vehicleType,
    distance_km: Math.round(distance),
    total_cost_inr: Math.round(totalCost),
  });

  document.getElementById("fuelCostResult").textContent =
    "₹ " + fuelCost.toFixed(2);
  document.getElementById("tollCostResult").textContent =
    "₹ " + toll.toFixed(2);
  document.getElementById("totalCostResult").textContent =
    "₹ " + totalCost.toFixed(2);
  document.getElementById("costPerKmResult").textContent =
    "₹ " + costPerKm.toFixed(2);
  document.getElementById("costResults").classList.remove("hidden");
}

// Get weather info (mock)
function getWeatherInfo(origin, destination) {
  const weatherInfo = document.getElementById("weatherInfo");
  const weatherSection = document.getElementById("weatherSection");

  weatherInfo.innerHTML = `
        <div class="weather-item">
            <div>📍 ${origin}</div>
            <div>🌤️ 28°C, Sunny</div>
        </div>
        <div class="weather-item">
            <div>📍 ${destination}</div>
            <div>⛅ 25°C, Partly Cloudy</div>
        </div>
    `;
  weatherSection.classList.remove("hidden");
}

// Get traffic info (mock)
// Tab Navigation
function switchTab(tabName) {
  document
    .querySelectorAll(".tab-content")
    .forEach((tab) => tab.classList.remove("active"));
  document
    .querySelectorAll(".nav-tab")
    .forEach((btn) => btn.classList.remove("active"));

  document.getElementById(tabName).classList.add("active");
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
}

// Settings
function applySettings() {
  if (appSettings.darkMode) {
    document.body.classList.add("dark-mode");
    document.getElementById("darkMode").checked = true;
  }
  document.getElementById("autoSaveRoute").checked = appSettings.autoSaveRoute;
  document.getElementById("defaultVehicle").value = appSettings.defaultVehicle;
  document.getElementById("defaultFuelPrice").value =
    appSettings.defaultFuelPrice;
}

function saveSettings() {
  appSettings = {
    darkMode: document.getElementById("darkMode").checked,
    autoSaveRoute: document.getElementById("autoSaveRoute").checked,
    defaultVehicle: document.getElementById("defaultVehicle").value,
    defaultFuelPrice: parseFloat(
      document.getElementById("defaultFuelPrice").value,
    ),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));

  if (appSettings.darkMode) {
    document.body.classList.add("dark-mode");
  } else {
    document.body.classList.remove("dark-mode");
  }

  // Track settings changes
  trackEvent("settings_updated", {
    dark_mode: appSettings.darkMode,
    auto_save_route: appSettings.autoSaveRoute,
    default_vehicle: appSettings.defaultVehicle,
  });

  showSuccess("✓ Settings saved!");
}

// Display results
function displayResults() {
  document.getElementById("results").classList.remove("hidden");
}

// UI Helpers
function showLoading(show) {
  document.getElementById("loading").classList.toggle("hidden", !show);
}

function showError(message) {
  const errorDiv = document.getElementById("error");
  errorDiv.textContent = "❌ " + message;
  errorDiv.classList.remove("hidden");
}

function hideError() {
  document.getElementById("error").classList.add("hidden");
}

function showSuccess(message) {
  const successDiv = document.getElementById("successMsg");
  successDiv.textContent = message;
  successDiv.classList.remove("hidden");
  setTimeout(() => hideSuccess(), 3000);
}

function hideSuccess() {
  document.getElementById("successMsg").classList.add("hidden");
}

// Event Listeners
document.querySelectorAll(".nav-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

document.querySelectorAll(".transport-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".transport-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTravelMode = google.maps.TravelMode.DRIVING;
  });
});

document.getElementById("analyzeBtn").addEventListener("click", analyzeRoute);
document
  .getElementById("liveLocationBtn")
  .addEventListener("click", getUserLocation);
document
  .getElementById("saveFavoriteBtn")
  .addEventListener("click", saveFavorite);
document
  .getElementById("calculateBtn")
  .addEventListener("click", calculateCost);
document.getElementById("showWeather").addEventListener("change", () => {
  if (
    document.getElementById("showWeather").checked &&
    routeData.allRoutes &&
    routeData.allRoutes.length
  ) {
    getWeatherInfo(routeData.origin, routeData.destination);
  } else {
    document.getElementById("weatherSection").classList.add("hidden");
  }
});
document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  loadRouteHistory();
  showSuccess("History cleared!");
});
document.getElementById("clearFavoritesBtn").addEventListener("click", () => {
  localStorage.removeItem(FAVORITES_KEY);
  loadFavorites();
  showSuccess("Favorites cleared!");
});

// Settings Event Listeners
document.getElementById("darkMode").addEventListener("change", saveSettings);
document
  .getElementById("autoSaveRoute")
  .addEventListener("change", saveSettings);
document
  .getElementById("defaultVehicle")
  .addEventListener("change", saveSettings);
document
  .getElementById("defaultFuelPrice")
  .addEventListener("change", saveSettings);
// document.getElementById("resetSettingsBtn").addEventListener("click", () => {
//   localStorage.removeItem(SETTINGS_KEY);
//   appSettings = defaultSettings;
//   location.reload();
// });

// Keyboard Enter
document.getElementById("origin").addEventListener("keypress", (e) => {
  if (e.key === "Enter") analyzeRoute();
});

document.getElementById("destination").addEventListener("keypress", (e) => {
  if (e.key === "Enter") analyzeRoute();
});

// Initialize on page load
window.addEventListener("load", () => {
  console.log("Page loaded, initializing map...");
  initMap();
});
