// 🔑 PASTE YOUR GOOGLE MAPS API KEY HERE
const GOOGLE_MAPS_API_KEY = "AIzaSyBpArhA1azKFUtD2rfC0hUZ4Brk36T9KtU";

// 📊 GOOGLE ANALYTICS - Replace 'G-XXXXXXXXXX' with your GA4 Measurement ID
const GOOGLE_ANALYTICS_ID = "G-XXXXXXXXXX";

// Google Analytics helper functions
function trackEvent(eventName, eventParams = {}) {
  if (typeof gtag !== "undefined") {
    gtag("event", eventName, eventParams);
  }
}

function trackPageView(pagePath = window.location.pathname) {
  if (typeof gtag !== "undefined") {
    gtag("config", GOOGLE_ANALYTICS_ID, {
      page_path: pagePath,
    });
  }
}

// Track user properties
function trackUserProperty(propertyName, propertyValue) {
  if (typeof gtag !== "undefined") {
    gtag("set", {
      [propertyName]: propertyValue,
    });
  }
}

// Dynamically load Google Maps API with your key
if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY_HERE") {
  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    console.log("Google Maps API script loaded successfully");
    // Track successful map initialization
    trackEvent("maps_api_loaded");
  };
  script.onerror = () => {
    console.error("Failed to load Google Maps API");
    const errorDiv = document.getElementById("error");
    if (errorDiv) {
      errorDiv.textContent =
        "❌ Failed to load Google Maps API. Please check your API key and network.";
      errorDiv.classList.remove("hidden");
    }
    // Track map loading error
    trackEvent("maps_api_error");
  };
  document.head.appendChild(script);
} else {
  console.error(
    "❌ API key not configured! Update config.js with your Google Maps API key",
  );
  setTimeout(() => {
    const errorDiv = document.getElementById("error");
    if (errorDiv) {
      errorDiv.textContent =
        "❌ API Key Error: Please update config.js with your Google Maps API key";
      errorDiv.classList.remove("hidden");
    }
  }, 1000);
  // Track missing API key
  trackEvent("api_key_missing");
}
