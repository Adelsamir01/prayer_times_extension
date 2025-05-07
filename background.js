// Function to fetch prayer times
async function fetchPrayerTimes() {
  try {
    const response = await fetch('https://canterburymosque.co.uk/services/prayers/');
    const text = await response.text();
    
    // Parse the prayer times using regex
    const prayerTimes = {};
    const prayerNames = ['Fajr', 'Sunrise', 'Zuhr', 'Asr', 'Magrib', 'Isha'];
    
    prayerNames.forEach(prayer => {
      let pattern;
      
      // Sunrise has a different pattern as it spans 2 columns rather than having a separate Jamah time
      if (prayer === 'Sunrise') {
        pattern = new RegExp(`${prayer}</td><td[^>]*colspan="2"[^>]*>([^<]*)</td>`, 'i');
        const match = text.match(pattern);
        
        if (match) {
          prayerTimes[prayer] = {
            begin: match[1].trim(),
            jamah: match[1].trim() // Sunrise has no Jamah, but we keep the same structure
          };
        }
      } else {
        // Regular prayers with begin and jamah times
        pattern = new RegExp(`${prayer}</td><td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>`, 'i');
        const match = text.match(pattern);
        
        if (match) {
          prayerTimes[prayer] = {
            begin: match[1].trim(),
            jamah: match[2] ? match[2].trim() : match[1].trim()
          };
        }
      }
    });

    // Store the prayer times
    await chrome.storage.local.set({
      prayerTimes: prayerTimes,
      lastUpdated: new Date().toISOString()
    });

    console.log("Prayer times fetched and stored:", prayerTimes);

    // Notify that new prayer times are available
    chrome.runtime.sendMessage({ type: 'PRAYER_TIMES_UPDATED' });
    
    // Start monitoring for prayer times
    startPrayerTimeMonitoring();
  } catch (error) {
    console.error('Error fetching prayer times:', error);
  }
}

// Function to convert time string to Date object
function timeStringToDate(timeStr) {
  const [time, period] = timeStr.split(' ');
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  
  // Convert to 24-hour format
  let hour = hours;
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  
  date.setHours(hour, minutes, 0, 0);
  return date;
}

// Track if azan audio is currently playing
let isAzanPlaying = false;
// Store interval ID for prayer monitoring
let prayerMonitoringInterval = null;

// Function to create a visible popup to play sound reliably
function createSoundPopup() {
  return new Promise((resolve) => {
    chrome.windows.create({
      url: chrome.runtime.getURL('azan.mp3'),
      type: 'popup',
      width: 0,
      height: 0,
      focused: false,
      left: 0,
      top: 0
    }, (popupWindow) => {
      console.log('Created popup for audio playback, window ID:', popupWindow.id);
      
      // Set timeout to close the popup after 30 seconds
      setTimeout(() => {
        chrome.windows.remove(popupWindow.id, () => {
          console.log('Closed audio popup');
          resolve();
        });
      }, 30000); // 30 seconds should be enough for azan
    });
  });
}

// Function to play azan
async function playAzan(prayerName) {
  console.log(`Attempting to play azan for ${prayerName}...`);
  
  // Check if prayer is muted
  const result = await chrome.storage.local.get('mutedPrayers');
  const mutedPrayers = result.mutedPrayers || {};
  
  // Don't allow multiple plays simultaneously
  if (isAzanPlaying) {
    console.log('Azan already playing, not starting another');
    return;
  }
  
  // Create a notification (silent) to show the prayer time
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title: 'Prayer Time Reminder',
    message: `${prayerName} prayer will start soon`,
    silent: true // No sound from notification
  });
  
  // Only play audio if the prayer is not muted
  if (mutedPrayers[prayerName]) {
    console.log(`Prayer ${prayerName} is muted, not playing azan sound`);
    return; // Don't play sound if muted
  }
  
  isAzanPlaying = true;
  
  try {
    // Open popup window to play sound
    console.log('Creating popup to play azan');
    await createSoundPopup();
    
    // Reset playing state
    isAzanPlaying = false;
    console.log('Azan playback completed');
  } catch (error) {
    console.error('Error playing azan:', error);
    isAzanPlaying = false;
  }
}

// Function to check for upcoming prayers and set notifications
function startPrayerTimeMonitoring() {
  console.log('Starting prayer time monitoring');
  
  // Clear any existing interval
  if (prayerMonitoringInterval) {
    clearInterval(prayerMonitoringInterval);
  }
  
  // Check every minute
  prayerMonitoringInterval = setInterval(checkPrayerTimes, 60000);
  
  // Also check immediately
  checkPrayerTimes();
}

// Function to check prayer times and trigger notifications
function checkPrayerTimes() {
  console.log('Checking prayer times...');
  chrome.storage.local.get(['prayerTimes', 'lastAzanPlayed', 'lastDesktopNotification'], (result) => {
    if (!result.prayerTimes) {
      console.log('No prayer times found');
      return;
    }
    
    console.log('Prayer times:', result.prayerTimes);
    
    const now = new Date();
    let nextPrayer = null;
    let nextPrayerTime = null;
    let minDiff = Infinity;
    
    // Find the next prayer
    Object.entries(result.prayerTimes).forEach(([prayer, times]) => {
      // Skip sunrise as it's not a prayer
      if (prayer === 'Sunrise') return;
      
      const prayerTime = timeStringToDate(times.jamah);
      const diff = prayerTime - now;
      
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        nextPrayer = prayer;
        nextPrayerTime = prayerTime;
      }
    });
    
    if (nextPrayer) {
      console.log(`Next prayer: ${nextPrayer} in ${minDiff / (60 * 1000)} minutes`);
      const lastPlayed = result.lastAzanPlayed || {};
      const lastNotifications = result.lastDesktopNotification || {};
      const currentDate = new Date().toISOString().split('T')[0]; // Today's date
      
      // Regular 15-minute notification with audio and desktop notification
      const fifteenMinutes = 15 * 60 * 1000; // 15 minutes in milliseconds
      if (minDiff <= fifteenMinutes && minDiff > (fifteenMinutes - 60000)) { // Within a minute of the 15-min mark
        if (lastPlayed[currentDate + nextPrayer] !== true) {
          console.log("REGULAR: Processing notification for " + nextPrayer + " (15 minute notification)");
          
          // Always show desktop notification at 15 minutes
          console.log("DESKTOP: Showing desktop notification for " + nextPrayer);
          
          // Show desktop notification
          try {
            chrome.notifications.create(
              `prayer-${nextPrayer}-${Date.now()}`, // unique ID
              {
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: 'Prayer Time Reminder',
                message: `${nextPrayer} prayer starts in 15 minutes`,
                priority: 2,
                requireInteraction: true // Notification persists until user interacts with it
              },
              (notificationId) => {
                console.log(`Created notification for ${nextPrayer} with ID: ${notificationId}`);
              }
            );
            
            // Update last notification
            lastNotifications[currentDate + nextPrayer] = true;
            chrome.storage.local.set({ lastDesktopNotification: lastNotifications });
            
            // Play sound (this function will check if muted internally)
            playAzan(nextPrayer);
            
            // Update last played regardless of whether sound was actually played
            lastPlayed[currentDate + nextPrayer] = true;
            chrome.storage.local.set({ lastAzanPlayed: lastPlayed });
          } catch (error) {
            console.error('Error creating prayer notification:', error);
          }
        }
      }
    } else {
      console.log('No upcoming prayer found for today');
    }
  });
}

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAY_PREVIEW') {
    console.log('Received request to play azan preview');
    // Play preview sound when requested from popup
    if (!isAzanPlaying) {
      playAzan('Preview').then(() => {
        sendResponse({ success: true });
      }).catch(() => {
        sendResponse({ success: false, reason: 'Playback error' });
      });
      
      // After 5 seconds, ensure we reset the state and notify popup
      setTimeout(() => {
        isAzanPlaying = false;
        chrome.runtime.sendMessage({ type: 'PREVIEW_ENDED' });
      }, 35000);
    } else {
      sendResponse({ success: false, reason: 'Already playing' });
      console.log('Sent failure response for preview request - already playing');
    }
    return true; // Keep message channel open for sendResponse
  } else if (message.type === 'STOP_SOUND') {
    // Stop any currently playing sounds
    console.log('Received request to stop sounds');
    isAzanPlaying = false;
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'TEST_DESKTOP_NOTIFICATION') {
    // Super simple notification test
    console.log('Start: Creating test desktop notification');
    
    try {
      // Check if we have notification permission first
      if (Notification.permission === 'granted') {
        console.log('Notification permission already granted');
      } else {
        console.log('Notification permission status:', Notification.permission);
      }
      
      // Create a notification with minimal parameters
      chrome.notifications.create(
        'test-notification', // notificationId
        {
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: 'Prayer Time Test',
          message: 'This is a test notification'
        },
        // Optional callback - not waiting for it
        (notificationId) => {
          console.log('Notification callback executed with ID:', notificationId);
        }
      );
      
      console.log('Notification creation command executed');
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error creating notification:', error);
      sendResponse({ success: false, error: error.toString() });
    }
    
    console.log('End: Notification process complete');
    return true; // Keep message channel open for sendResponse
  } else if (message.type === 'TEST_COMPLETE_NOTIFICATION') {
    // Test both notification and sound at once
    console.log('Testing complete notification system (visual + sound)');
    
    try {
      // Get the requested prayer to test or default to next prayer
      const prayerToTest = message.prayer || 'Test';
      
      // Create notification with nice design
      chrome.notifications.create(
        `test-prayer-${Date.now()}`, // unique ID
        {
          type: 'basic',
          iconUrl: 'images/icon128.png',
          title: 'Prayer Time Reminder (TEST)',
          message: `${prayerToTest} prayer starts in 15 minutes`,
          priority: 2,
          requireInteraction: true // Notification persists until user interacts with it
        },
        (notificationId) => {
          console.log(`Created test notification with ID: ${notificationId}`);
        }
      );
      
      // Play sound if not muted
      playAzan(prayerToTest);
      
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error in complete notification test:', error);
      sendResponse({ success: false, error: error.toString() });
    }
    
    return true; // Keep message channel open for sendResponse
  }
});

// Set up daily alarm to fetch prayer times
chrome.alarms.create('fetchPrayerTimes', {
  periodInMinutes: 1440, // 24 hours
  delayInMinutes: 1 // Start after 1 minute
});

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchPrayerTimes') {
    fetchPrayerTimes();
  }
});

// Initial fetch
fetchPrayerTimes();

// Initialize default settings
async function initializeDefaultSettings() {
  // Check if settings are already initialized
  const result = await chrome.storage.local.get('settingsInitialized');
  
  if (!result.settingsInitialized) {
    console.log('Initializing default settings');
    
    // Set Fajr to be muted by default
    const mutedPrayers = { 'Fajr': true };
    await chrome.storage.local.set({ 
      mutedPrayers: mutedPrayers,
      settingsInitialized: true
    });
    
    console.log('Default settings initialized: Fajr muted by default');
  }
}

// Request notification permission
async function requestNotificationPermission() {
  try {
    console.log('Checking notification permission...');
    // For Chrome extensions using chrome.notifications API, we need to check if notifications permission is granted
    const permissionStatus = await chrome.permissions.contains({
      permissions: ['notifications']
    });
    
    console.log('Notification permission status:', permissionStatus);
    
    if (!permissionStatus) {
      console.log('Requesting notification permission...');
      const granted = await chrome.permissions.request({
        permissions: ['notifications']
      });
      console.log('Notification permission granted:', granted);
    }
  } catch (error) {
    console.error('Error requesting notification permission:', error);
  }
}

// Call initialization functions when the extension starts
requestNotificationPermission();
initializeDefaultSettings(); 