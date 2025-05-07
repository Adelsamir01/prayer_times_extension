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

// Function to format time difference
function formatTimeDifference(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// Track if preview button is disabled
let previewButtonDisabled = false;

// Function to toggle mute for a prayer
function toggleMute(prayerName, button) {
  chrome.storage.local.get('mutedPrayers', (result) => {
    const mutedPrayers = result.mutedPrayers || {};
    mutedPrayers[prayerName] = !mutedPrayers[prayerName];
    chrome.storage.local.set({ mutedPrayers: mutedPrayers });
    
    // Update button icon
    button.innerHTML = mutedPrayers[prayerName] 
      ? '<img src="images/muted.png" alt="Muted">'
      : '<img src="images/unmuted.png" alt="Unmuted">';
  });
}

// Function to update countdown
function updateCountdown(prayerTimes) {
  const now = new Date();
  let nextPrayer = null;
  let nextPrayerTime = null;
  let minDiff = Infinity;

  // Find the next prayer
  Object.entries(prayerTimes).forEach(([prayer, times]) => {
    // Skip sunrise for countdown purposes as it's not a prayer
    if (prayer === 'Sunrise') return;
    
    const prayerTime = timeStringToDate(times.jamah);
    const diff = prayerTime - now;
    
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
      nextPrayer = prayer;
      nextPrayerTime = prayerTime;
    }
  });

  // Update countdown display
  const nextPrayerElement = document.getElementById('next-prayer');
  const timeLeftElement = document.getElementById('time-left');
  
  if (nextPrayer) {
    nextPrayerElement.textContent = nextPrayer;
    timeLeftElement.textContent = formatTimeDifference(minDiff);

    // Highlight the next prayer in the list
    highlightNextPrayer(nextPrayer);
  } else {
    nextPrayerElement.textContent = 'Fajr (Tomorrow)';
    const fajrTime = timeStringToDate(prayerTimes.Fajr.jamah);
    fajrTime.setDate(fajrTime.getDate() + 1);
    timeLeftElement.textContent = formatTimeDifference(fajrTime - now);
    
    // Highlight Fajr as the next prayer
    highlightNextPrayer('Fajr');
  }
}

// Function to highlight the next prayer in the list
function highlightNextPrayer(nextPrayer) {
  // Remove 'next-prayer' class from all prayer times
  document.querySelectorAll('.prayer-time').forEach(el => {
    el.classList.remove('next-prayer');
  });
  
  // Add 'next-prayer' class to the next prayer
  document.querySelectorAll('.prayer-time').forEach(el => {
    const prayerNameEl = el.querySelector('.prayer-name');
    if (prayerNameEl && prayerNameEl.textContent === nextPrayer) {
      el.classList.add('next-prayer');
    }
  });
}

// Function to format prayer times for display
function displayPrayerTimes(prayerTimes) {
  const container = document.getElementById('prayer-times');
  container.innerHTML = '';

  // Ensure prayers are displayed in correct order
  const prayers = ['Fajr', 'Sunrise', 'Zuhr', 'Asr', 'Magrib', 'Isha'];
  const now = new Date();
  
  chrome.storage.local.get('mutedPrayers', (result) => {
    const mutedPrayers = result.mutedPrayers || {};
    
    prayers.forEach(prayer => {
      const prayerTime = prayerTimes[prayer];
      if (prayerTime) {
        const div = document.createElement('div');
        div.className = 'prayer-time';
        
        // Check if this is the current prayer (only for actual prayers, not sunrise)
        if (prayer !== 'Sunrise') {
          const prayerDate = timeStringToDate(prayerTime.jamah);
          if (Math.abs(prayerDate - now) < 30 * 60 * 1000) {
            div.classList.add('current');
          }
        }
        
        const prayerInfo = document.createElement('div');
        prayerInfo.className = 'prayer-info';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'prayer-name';
        nameSpan.textContent = prayer;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'time';
        
        // Sunrise only has one time, not Jamah
        if (prayer === 'Sunrise') {
          timeSpan.textContent = prayerTime.begin;
        } else {
          timeSpan.innerHTML = `${prayerTime.begin} <span class="jamah">(${prayerTime.jamah})</span>`;
        }
        
        prayerInfo.appendChild(nameSpan);
        prayerInfo.appendChild(document.createElement('br'));
        prayerInfo.appendChild(timeSpan);
        
        // Add mute button for prayers only (not for sunrise)
        if (prayer !== 'Sunrise') {
          const muteButton = document.createElement('button');
          muteButton.className = 'mute-button';
          muteButton.innerHTML = mutedPrayers[prayer] 
            ? '<img src="images/muted.png" alt="Muted">'
            : '<img src="images/unmuted.png" alt="Unmuted">';
          muteButton.onclick = () => toggleMute(prayer, muteButton);
          
          div.appendChild(prayerInfo);
          div.appendChild(muteButton);
        } else {
          div.appendChild(prayerInfo);
        }
        
        container.appendChild(div);
      }
    });
  });
}

// Function to update the date display
function updateDate() {
  const dateElement = document.getElementById('date');
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateElement.textContent = now.toLocaleDateString('en-GB', options);
}

// Function to update the current time
function updateCurrentTime() {
  const timeElement = document.getElementById('current-time');
  const now = new Date();
  const options = { hour: '2-digit', minute: '2-digit', hour12: true };
  timeElement.textContent = now.toLocaleTimeString('en-GB', options);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PREVIEW_ENDED') {
    previewButtonDisabled = false;
    const previewButton = document.getElementById('sound-preview');
    if (previewButton) {
      previewButton.style.opacity = '0.7';
      previewButton.style.cursor = 'pointer';
    }
  }
});

// Load prayer times from storage and update display
chrome.storage.local.get(['prayerTimes', 'lastUpdated'], (result) => {
  if (result.prayerTimes) {
    displayPrayerTimes(result.prayerTimes);
    updateCountdown(result.prayerTimes);
    
    // Update countdown and current time every second
    setInterval(() => {
      updateCountdown(result.prayerTimes);
      updateCurrentTime();
    }, 1000);

    // Add sound preview functionality
    const previewButton = document.getElementById('sound-preview');
    previewButton.addEventListener('click', () => {
      if (previewButtonDisabled) return;
      
      previewButtonDisabled = true;
      previewButton.style.opacity = '0.5';
      previewButton.style.cursor = 'default';
      
      // Request the background script to play the preview
      chrome.runtime.sendMessage({ type: 'PLAY_PREVIEW' }, (response) => {
        if (!response || !response.success) {
          // Re-enable button if playback failed or is already playing
          previewButtonDisabled = false;
          previewButton.style.opacity = '0.7';
          previewButton.style.cursor = 'pointer';
        }
      });
    });
  } else {
    document.getElementById('prayer-times').innerHTML = 
      '<div style="text-align: center; color: #666;">Loading prayer times...</div>';
  }
});

// Update date and initial current time
updateDate();
updateCurrentTime();

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PRAYER_TIMES_UPDATED') {
    chrome.storage.local.get('prayerTimes', (result) => {
      if (result.prayerTimes) {
        displayPrayerTimes(result.prayerTimes);
        updateCountdown(result.prayerTimes);
      }
    });
  }
}); 